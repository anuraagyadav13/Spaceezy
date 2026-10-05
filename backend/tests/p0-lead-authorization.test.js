const request = require('supertest');
const app = require('../src/app');
const prisma = require('../src/db/prisma');
const LeadService = require('../src/services/leadService');

jest.mock('../src/db/prisma', () => {
  const tx = {
    lead: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      delete: jest.fn(),
    },
    leadActivity: {
      create: jest.fn(),
      updateMany: jest.fn(),
    },
    leadInterest: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      deleteMany: jest.fn(),
    },
  };
  return {
    __tx: tx,
    session: { findUnique: jest.fn() },
    user: { findFirst: jest.fn() },
    lead: { findFirst: jest.fn(), findMany: jest.fn() },
    leadActivity: { create: jest.fn() },
    $transaction: jest.fn(async (fn) => fn(tx)),
  };
});

const ORG = '11111111-1111-4111-8111-111111111111';
const LEAD_A = '22222222-2222-4222-8222-222222222222';
const LEAD_B = '33333333-3333-4333-8333-333333333333';
const ASSIGNEE = '44444444-4444-4444-8444-444444444444';
const EXEC = '55555555-5555-4555-8555-555555555555';
const OTHER_USER = '66666666-6666-4666-8666-666666666666';

const mockSession = (role, userId) => {
  prisma.session.findUnique.mockResolvedValue({
    expiresAt: new Date(Date.now() + 60_000),
    user: { id: userId, organizationId: ORG, role, status: 'ACTIVE' },
  });
};

const activeAssignee = (overrides = {}) => ({
  id: ASSIGNEE,
  organizationId: ORG,
  name: 'Assignee',
  status: 'ACTIVE',
  ...overrides,
});

const survivorLead = (overrides = {}) => ({
  id: LEAD_A,
  organizationId: ORG,
  name: 'Survivor',
  email: null,
  source: null,
  projectId: null,
  propertyId: null,
  assignedToId: OTHER_USER,
  message: null,
  ...overrides,
});

const duplicateLead = (overrides = {}) => ({
  id: LEAD_B,
  organizationId: ORG,
  name: 'Duplicate',
  email: 'dup@example.com',
  source: 'FACEBOOK',
  projectId: null,
  propertyId: null,
  assignedToId: OTHER_USER,
  message: 'dup note',
  ...overrides,
});

describe('P0 #1: bulk-assign authorization', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.SESSION_COOKIE_NAME;
  });

  it('rejects SALES_EXECUTIVE bulk-assign with 403 FORBIDDEN', async () => {
    mockSession('SALES_EXECUTIVE', EXEC);

    const response = await request(app)
      .patch('/api/v1/leads/bulk-assign')
      .set('Cookie', 'spaceezy_session=exec-token')
      .send({ leadIds: [LEAD_A], assignedToId: ASSIGNEE });

    expect(response.status).toBe(403);
    expect(response.body.success).toBe(false);
    expect(response.body.code).toBe('FORBIDDEN');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('allows ADMIN bulk-assign of org-scoped leads', async () => {
    mockSession('ADMIN', 'admin-user');
    prisma.user.findFirst.mockResolvedValue(activeAssignee());
    prisma.__tx.lead.findMany.mockResolvedValue([
      { id: LEAD_A, assignedToId: OTHER_USER },
      { id: LEAD_B, assignedToId: EXEC },
    ]);
    prisma.__tx.lead.updateMany.mockResolvedValue({ count: 2 });
    prisma.__tx.leadActivity.create.mockResolvedValue({});

    const response = await request(app)
      .patch('/api/v1/leads/bulk-assign')
      .set('Cookie', 'spaceezy_session=admin-token')
      .send({ leadIds: [LEAD_A, LEAD_B], assignedToId: ASSIGNEE });

    expect(response.status).toBe(200);
    expect(response.body.data.count).toBe(2);
    expect(prisma.__tx.lead.updateMany).toHaveBeenCalledWith({
      where: { id: { in: [LEAD_A, LEAD_B] }, organizationId: ORG },
      data: { assignedToId: ASSIGNEE },
    });
    expect(prisma.__tx.leadActivity.create).toHaveBeenCalledTimes(2);
  });

  it('returns 404 (not silent partial success) when a lead is outside the organization scope', async () => {
    mockSession('ADMIN', 'admin-user');
    prisma.user.findFirst.mockResolvedValue(activeAssignee());
    prisma.__tx.lead.findMany.mockResolvedValue([{ id: LEAD_A, assignedToId: OTHER_USER }]);
    prisma.__tx.lead.updateMany.mockResolvedValue({ count: 1 });

    const response = await request(app)
      .patch('/api/v1/leads/bulk-assign')
      .set('Cookie', 'spaceezy_session=admin-token')
      .send({ leadIds: [LEAD_A, LEAD_B], assignedToId: ASSIGNEE });

    expect(response.status).toBe(404);
    expect(response.body.code).toBe('NOT_FOUND');
    expect(prisma.__tx.lead.updateMany).not.toHaveBeenCalled();
    expect(prisma.__tx.leadActivity.create).not.toHaveBeenCalled();
  });

  it('returns 404 when assignee is not in the organization', async () => {
    mockSession('ADMIN', 'admin-user');
    prisma.user.findFirst.mockResolvedValue(null);

    const response = await request(app)
      .patch('/api/v1/leads/bulk-assign')
      .set('Cookie', 'spaceezy_session=admin-token')
      .send({ leadIds: [LEAD_A], assignedToId: ASSIGNEE });

    expect(response.status).toBe(404);
    expect(response.body.message).toBe('Assignee not found');
  });

  it('returns 400 when assignee is deactivated', async () => {
    mockSession('ADMIN', 'admin-user');
    prisma.user.findFirst.mockResolvedValue(activeAssignee({ status: 'INACTIVE' }));

    const response = await request(app)
      .patch('/api/v1/leads/bulk-assign')
      .set('Cookie', 'spaceezy_session=admin-token')
      .send({ leadIds: [LEAD_A], assignedToId: ASSIGNEE });

    expect(response.status).toBe(400);
    expect(response.body.message).toMatch(/inactive/i);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('service-level ownership defense: restricted role cannot bulk-assign leads owned by others', async () => {
    prisma.user.findFirst.mockResolvedValue(activeAssignee());
    prisma.__tx.lead.findMany.mockResolvedValue([{ id: LEAD_A, assignedToId: OTHER_USER }]);
    prisma.__tx.lead.updateMany.mockResolvedValue({ count: 1 });

    await expect(
      LeadService.bulkAssignLeads([LEAD_A], ASSIGNEE, ORG, EXEC, 'SALES_EXECUTIVE')
    ).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
    expect(prisma.__tx.lead.updateMany).not.toHaveBeenCalled();
  });

  it('service-level ownership defense: restricted role can bulk-assign their own leads', async () => {
    prisma.user.findFirst.mockResolvedValue(activeAssignee());
    prisma.__tx.lead.findMany.mockResolvedValue([{ id: LEAD_A, assignedToId: EXEC }]);
    prisma.__tx.lead.updateMany.mockResolvedValue({ count: 1 });
    prisma.__tx.leadActivity.create.mockResolvedValue({});

    const result = await LeadService.bulkAssignLeads(
      [LEAD_A], ASSIGNEE, ORG, EXEC, 'SALES_EXECUTIVE'
    );

    expect(result).toEqual({ count: 1 });
    expect(prisma.__tx.lead.updateMany).toHaveBeenCalled();
  });
});

describe('P0 #2: merge authorization', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.SESSION_COOKIE_NAME;
  });

  it('rejects SALES_EXECUTIVE merge with 403 FORBIDDEN', async () => {
    mockSession('SALES_EXECUTIVE', EXEC);

    const response = await request(app)
      .post(`/api/v1/leads/${LEAD_A}/merge`)
      .set('Cookie', 'spaceezy_session=exec-token')
      .send({ duplicateLeadId: LEAD_B });

    expect(response.status).toBe(403);
    expect(response.body.code).toBe('FORBIDDEN');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('allows ADMIN merge of org-scoped leads and deletes only the duplicate', async () => {
    mockSession('ADMIN', 'admin-user');
    prisma.__tx.lead.findFirst
      .mockResolvedValueOnce(survivorLead())
      .mockResolvedValueOnce(duplicateLead());
    prisma.__tx.lead.update.mockResolvedValue({});
    prisma.__tx.leadActivity.updateMany.mockResolvedValue({});
    prisma.__tx.leadInterest.findMany.mockResolvedValue([]);
    prisma.__tx.leadInterest.deleteMany.mockResolvedValue({});
    prisma.__tx.lead.delete.mockResolvedValue({});
    prisma.__tx.leadActivity.create.mockResolvedValue({});

    const response = await request(app)
      .post(`/api/v1/leads/${LEAD_A}/merge`)
      .set('Cookie', 'spaceezy_session=admin-token')
      .send({ duplicateLeadId: LEAD_B });

    expect(response.status).toBe(200);
    expect(response.body.data.survivingLeadId).toBe(LEAD_A);
    expect(prisma.__tx.lead.delete).toHaveBeenCalledWith({ where: { id: LEAD_B } });
    expect(prisma.__tx.lead.findFirst).toHaveBeenCalledWith({
      where: { id: LEAD_A, organizationId: ORG },
    });
    expect(prisma.__tx.lead.findFirst).toHaveBeenCalledWith({
      where: { id: LEAD_B, organizationId: ORG },
    });
  });

  it('returns 404 when either lead is outside the organization scope', async () => {
    mockSession('ADMIN', 'admin-user');
    prisma.__tx.lead.findFirst
      .mockResolvedValueOnce(survivorLead())
      .mockResolvedValueOnce(null);

    const response = await request(app)
      .post(`/api/v1/leads/${LEAD_A}/merge`)
      .set('Cookie', 'spaceezy_session=admin-token')
      .send({ duplicateLeadId: LEAD_B });

    expect(response.status).toBe(404);
    expect(response.body.code).toBe('NOT_FOUND');
    expect(prisma.__tx.lead.delete).not.toHaveBeenCalled();
  });

  it('returns 400 when merging a lead into itself', async () => {
    mockSession('ADMIN', 'admin-user');

    const response = await request(app)
      .post(`/api/v1/leads/${LEAD_A}/merge`)
      .set('Cookie', 'spaceezy_session=admin-token')
      .send({ duplicateLeadId: LEAD_A });

    expect(response.status).toBe(400);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('service-level ownership defense: restricted role cannot merge leads owned by others', async () => {
    prisma.__tx.lead.findFirst
      .mockResolvedValueOnce(survivorLead())
      .mockResolvedValueOnce(duplicateLead());

    await expect(
      LeadService.mergeLeads(LEAD_A, LEAD_B, ORG, EXEC, 'SALES_EXECUTIVE')
    ).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
    expect(prisma.__tx.lead.delete).not.toHaveBeenCalled();
  });

  it('service-level ownership defense: restricted role can merge their own leads', async () => {
    prisma.__tx.lead.findFirst
      .mockResolvedValueOnce(survivorLead({ assignedToId: EXEC }))
      .mockResolvedValueOnce(duplicateLead({ assignedToId: EXEC }));
    prisma.__tx.lead.update.mockResolvedValue({});
    prisma.__tx.leadActivity.updateMany.mockResolvedValue({});
    prisma.__tx.leadInterest.findMany.mockResolvedValue([]);
    prisma.__tx.leadInterest.deleteMany.mockResolvedValue({});
    prisma.__tx.lead.delete.mockResolvedValue({});
    prisma.__tx.leadActivity.create.mockResolvedValue({});

    const result = await LeadService.mergeLeads(LEAD_A, LEAD_B, ORG, EXEC, 'SALES_EXECUTIVE');

    expect(result).toEqual({ success: true, survivingLeadId: LEAD_A });
    expect(prisma.__tx.lead.delete).toHaveBeenCalledWith({ where: { id: LEAD_B } });
  });

  it('returns 404 for out-of-org leads even when called directly by a restricted role', async () => {
    prisma.__tx.lead.findFirst
      .mockResolvedValueOnce(survivorLead())
      .mockResolvedValueOnce(null);

    await expect(
      LeadService.mergeLeads(LEAD_A, LEAD_B, ORG, EXEC, 'SALES_EXECUTIVE')
    ).rejects.toMatchObject({ statusCode: 404, code: 'NOT_FOUND' });
  });
});
