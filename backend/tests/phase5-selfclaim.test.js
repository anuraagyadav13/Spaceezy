const request = require('supertest');
const app = require('../src/app');

jest.mock('../src/db/prisma', () => {
  const mock = {
    session: { findUnique: jest.fn() },
    user: { findFirst: jest.fn(), findMany: jest.fn(), findUnique: jest.fn(), count: jest.fn(), update: jest.fn(), create: jest.fn() },
    lead: { findFirst: jest.fn(), findMany: jest.fn(), count: jest.fn(), update: jest.fn(), updateMany: jest.fn(), create: jest.fn() },
    leadActivity: { create: jest.fn(), findMany: jest.fn() },
    customer: { findMany: jest.fn() },
    siteVisit: { findMany: jest.fn() },
    booking: { findMany: jest.fn() },
    project: { findFirst: jest.fn() },
    property: { findFirst: jest.fn(), findMany: jest.fn() },
    auditLog: { create: jest.fn() },
    $queryRaw: jest.fn(),
    $transaction: jest.fn(),
  };
  mock.$transaction.mockImplementation(async (fn) => fn(mock));
  return mock;
});

const prisma = require('../src/db/prisma');

const ORG = '11111111-1111-4111-8111-111111111111';
const LEAD = 'aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const LEAD_OTHER = 'aaaaaaa2-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const EXEC = '55555555-5555-4555-8555-555555555555';
const EXEC_OTHER = '44444444-4444-4444-8444-444444444444';
const PHONE = '+919000012345';

const mockSession = (role, userId) => {
  prisma.session.findUnique.mockResolvedValue({
    expiresAt: new Date(Date.now() + 60_000),
    user: { id: userId, organizationId: ORG, role, status: 'ACTIVE' },
  });
};
const exec = (userId = EXEC) => mockSession('SALES_EXECUTIVE', userId);
const admin = () => mockSession('ADMIN', 'admin-user');
const manager = () => mockSession('SALES_MANAGER', 'manager-user');

const lead = (overrides = {}) => ({
  id: LEAD,
  organizationId: ORG,
  name: 'Rohit Sharma',
  phone: PHONE,
  email: 'rohit@example.com',
  status: 'NEW',
  assignedToId: null,
  assignedTo: { name: 'Emp One' },
  project: { id: 'pppppppp-1111-4111-8111-111111111111', name: 'Skyline' },
  property: null,
  createdAt: new Date('2026-10-01T10:00:00Z'),
  ...overrides,
});

beforeEach(() => {
  jest.resetAllMocks();
  prisma.$transaction.mockImplementation(async (fn) => fn(prisma));
  prisma.auditLog.create.mockResolvedValue({ id: 'audit-1' });
});

describe('Phase 5: employee leads (root cause of employee:view error)', () => {
  it('keeps employee:view off SALES_EXECUTIVE (GET /users stays 403)', async () => {
    exec();

    const response = await request(app)
      .get('/api/v1/users')
      .set('Cookie', 'spaceezy_session=exec-token');

    expect(response.status).toBe(403);
    expect(response.body.message).toContain('employee:view');
  });

  it('SALES_EXECUTIVE can load leads (backend scopes to own leads)', async () => {
    exec();
    prisma.lead.findMany.mockResolvedValue([lead({ assignedToId: EXEC })]);
    prisma.lead.count.mockResolvedValue(1);

    const response = await request(app)
      .get('/api/v1/leads')
      .set('Cookie', 'spaceezy_session=exec-token');

    expect(response.status).toBe(200);
    expect(response.body.data.leads).toHaveLength(1);
    expect(prisma.lead.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ assignedToId: EXEC }) })
    );
  });

  it('SALES_EXECUTIVE sees own lead in GET /leads/:id but gets 403 for a foreign lead', async () => {
    exec();
    prisma.lead.findFirst.mockResolvedValueOnce(lead({ assignedToId: EXEC }));

    const own = await request(app)
      .get(`/api/v1/leads/${LEAD}`)
      .set('Cookie', 'spaceezy_session=exec-token');
    expect(own.status).toBe(200);

    exec();
    prisma.lead.findFirst.mockResolvedValueOnce(lead({ assignedToId: EXEC_OTHER }));

    const foreign = await request(app)
      .get(`/api/v1/leads/${LEAD}`)
      .set('Cookie', 'spaceezy_session=exec-token');
    expect(foreign.status).toBe(403);
  });

  it('SALES_EXECUTIVE cannot open a foreign lead via matching or interested-properties (403)', async () => {
    exec();
    prisma.lead.findFirst.mockResolvedValueOnce(lead({ assignedToId: EXEC_OTHER }));

    const matching = await request(app)
      .get(`/api/v1/leads/${LEAD}/matching`)
      .set('Cookie', 'spaceezy_session=exec-token');
    expect(matching.status).toBe(403);

    exec();
    prisma.lead.findFirst.mockResolvedValueOnce(lead({ assignedToId: EXEC_OTHER }));

    const interest = await request(app)
      .post(`/api/v1/leads/${LEAD}/interested-properties`)
      .set('Cookie', 'spaceezy_session=exec-token')
      .send({ propertyId: '66666666-6666-4666-8666-666666666666' });
    expect(interest.status).toBe(403);
    expect(prisma.property.findFirst).not.toHaveBeenCalled();
  });
});

describe('Phase 5: New Leads visibility (GET /leads/claimable)', () => {
  it('returns unassigned eligible leads with claim stats', async () => {
    exec();
    prisma.lead.findMany.mockResolvedValue([lead()]);
    prisma.lead.count.mockResolvedValue(1);
    prisma.user.findUnique.mockResolvedValue({ selfClaimLimit: 5 });
    prisma.$queryRaw.mockResolvedValue([{ count: 2 }]);

    const response = await request(app)
      .get('/api/v1/leads/claimable')
      .set('Cookie', 'spaceezy_session=exec-token');

    expect(response.status).toBe(200);
    expect(response.body.data.leads).toHaveLength(1);
    expect(response.body.data.claim).toEqual({ limit: 5, claimed: 2, remaining: 3, canClaim: true });
    expect(prisma.lead.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: ORG,
          assignedToId: null,
          status: { notIn: ['BOOKED', 'LOST', 'CLOSED'] },
        }),
      })
    );
  });

  it('masks phone PII for SALES_EXECUTIVE', async () => {
    exec();
    prisma.lead.findMany.mockResolvedValue([lead()]);
    prisma.lead.count.mockResolvedValue(1);
    prisma.user.findUnique.mockResolvedValue({ selfClaimLimit: 5 });
    prisma.$queryRaw.mockResolvedValue([{ count: 0 }]);

    const response = await request(app)
      .get('/api/v1/leads/claimable')
      .set('Cookie', 'spaceezy_session=exec-token');

    expect(response.status).toBe(200);
    expect(response.body.data.leads[0].phone).not.toBe(PHONE);
    expect(response.body.data.leads[0].phone).toContain('*');
  });

  it('reports canClaim=false when claim limit is not configured (null => 0)', async () => {
    exec();
    prisma.lead.findMany.mockResolvedValue([lead()]);
    prisma.lead.count.mockResolvedValue(1);
    prisma.user.findUnique.mockResolvedValue({ selfClaimLimit: null });
    prisma.$queryRaw.mockResolvedValue([{ count: 0 }]);

    const response = await request(app)
      .get('/api/v1/leads/claimable')
      .set('Cookie', 'spaceezy_session=exec-token');

    expect(response.status).toBe(200);
    expect(response.body.data.claim).toEqual({ limit: 0, claimed: 0, remaining: 0, canClaim: false });
  });

  it('is forbidden for non SALES_EXECUTIVE roles', async () => {
    admin();

    const response = await request(app)
      .get('/api/v1/leads/claimable')
      .set('Cookie', 'spaceezy_session=admin-token');

    expect(response.status).toBe(403);
  });
});

describe('Phase 5: atomic self-claim', () => {
  beforeEach(() => {
    // $queryRaw call #1 = row lock on the claimant, call #2 = active self-claim count
    prisma.$queryRaw
      .mockResolvedValueOnce([{ id: EXEC, name: 'Emp One', status: 'ACTIVE', selfClaimLimit: 5 }])
      .mockResolvedValueOnce([{ count: 2 }]);
    prisma.lead.findFirst
      .mockResolvedValueOnce({ id: LEAD, assignedToId: null, status: 'NEW' })
      .mockResolvedValueOnce(lead({ assignedToId: EXEC }));
    prisma.lead.updateMany.mockResolvedValue({ count: 1 });
    prisma.leadActivity.create.mockResolvedValue({ id: 'act-1' });
  });

  it('claims an unassigned lead atomically and records SELF_CLAIMED activity', async () => {
    exec();

    const response = await request(app)
      .post(`/api/v1/leads/${LEAD}/claim`)
      .set('Cookie', 'spaceezy_session=exec-token');

    expect(response.status).toBe(200);
    expect(response.body.data.assignedToId).toBe(EXEC);

    expect(prisma.lead.updateMany).toHaveBeenCalledWith({
      where: { id: LEAD, organizationId: ORG, assignedToId: null, status: { notIn: ['BOOKED', 'LOST', 'CLOSED'] } },
      data: { assignedToId: EXEC },
    });
    expect(prisma.leadActivity.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        leadId: LEAD,
        type: 'ASSIGNMENT',
        performedById: EXEC,
        metadata: { source: 'SELF_CLAIMED', previousAssignedToId: null },
      }),
    });
  });

  it('locks the claimant row and counts only SELF_CLAIMED leads for the cap', async () => {
    exec();

    await request(app)
      .post(`/api/v1/leads/${LEAD}/claim`)
      .set('Cookie', 'spaceezy_session=exec-token');

    const lockQuery = prisma.$queryRaw.mock.calls[0][0].join('');
    expect(lockQuery).toContain('FOR UPDATE');

    const countQuery = prisma.$queryRaw.mock.calls[1][0].join('');
    expect(countQuery).toContain('"assignedToId"');
    expect(countQuery).toContain("'SELF_CLAIMED'");
    expect(prisma.$queryRaw.mock.calls[1]).toContain(EXEC);
  });

  it('returns 409 ALREADY_CLAIMED when the lead is already assigned', async () => {
    exec();
    prisma.lead.findFirst.mockReset();
    prisma.lead.findFirst.mockResolvedValue({ id: LEAD, assignedToId: EXEC_OTHER, status: 'NEW' });

    const response = await request(app)
      .post(`/api/v1/leads/${LEAD}/claim`)
      .set('Cookie', 'spaceezy_session=exec-token');

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('ALREADY_CLAIMED');
    expect(response.body.message).toBe('Lead was already claimed by another employee.');
    expect(prisma.lead.updateMany).not.toHaveBeenCalled();
    expect(prisma.leadActivity.create).not.toHaveBeenCalled();
  });

  it('returns 409 ALREADY_CLAIMED when a concurrent claim wins the race (updateMany count 0)', async () => {
    exec();
    prisma.lead.findFirst
      .mockReset()
      .mockResolvedValueOnce({ id: LEAD, assignedToId: null, status: 'NEW' });
    prisma.lead.updateMany.mockResolvedValue({ count: 0 });

    const response = await request(app)
      .post(`/api/v1/leads/${LEAD}/claim`)
      .set('Cookie', 'spaceezy_session=exec-token');

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('ALREADY_CLAIMED');
    expect(prisma.leadActivity.create).not.toHaveBeenCalled();
  });

  it('returns 409 SELF_CLAIM_LIMIT_REACHED when the cap is used up', async () => {
    exec();
    prisma.$queryRaw
      .mockReset()
      .mockResolvedValueOnce([{ id: EXEC, name: 'Emp One', status: 'ACTIVE', selfClaimLimit: 2 }])
      .mockResolvedValueOnce([{ count: 2 }]);

    const response = await request(app)
      .post(`/api/v1/leads/${LEAD}/claim`)
      .set('Cookie', 'spaceezy_session=exec-token');

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('SELF_CLAIM_LIMIT_REACHED');
    expect(response.body.message).toBe('Self-claim limit reached (2/2).');
    expect(prisma.lead.updateMany).not.toHaveBeenCalled();
  });

  it('returns 403 SELF_CLAIM_NOT_ENABLED when no limit is configured', async () => {
    exec();
    prisma.$queryRaw.mockReset().mockResolvedValueOnce([{ id: EXEC, name: 'Emp One', status: 'ACTIVE', selfClaimLimit: null }]);

    const response = await request(app)
      .post(`/api/v1/leads/${LEAD}/claim`)
      .set('Cookie', 'spaceezy_session=exec-token');

    expect(response.status).toBe(403);
    expect(response.body.code).toBe('SELF_CLAIM_NOT_ENABLED');
  });

  it('returns 404 for a lead outside the organization', async () => {
    exec();
    prisma.lead.findFirst.mockReset().mockResolvedValue(null);

    const response = await request(app)
      .post(`/api/v1/leads/${LEAD_OTHER}/claim`)
      .set('Cookie', 'spaceezy_session=exec-token');

    expect(response.status).toBe(404);
    expect(prisma.lead.updateMany).not.toHaveBeenCalled();
  });

  it('is forbidden for non SALES_EXECUTIVE roles', async () => {
    admin();

    const response = await request(app)
      .post(`/api/v1/leads/${LEAD}/claim`)
      .set('Cookie', 'spaceezy_session=admin-token');

    expect(response.status).toBe(403);
    expect(prisma.lead.updateMany).not.toHaveBeenCalled();
  });
});

describe('Phase 5: assignment source tracking', () => {
  it('bulk assign as ADMIN records ADMIN_ASSIGNED source', async () => {
    admin();
    prisma.user.findFirst.mockResolvedValue({ id: 'assignee-1', organizationId: ORG, name: 'Emp Two', status: 'ACTIVE' });
    prisma.lead.findMany.mockResolvedValue([{ id: LEAD, assignedToId: null }]);
    prisma.lead.updateMany.mockResolvedValue({ count: 1 });
    prisma.leadActivity.create.mockResolvedValue({ id: 'act-1' });

    const response = await request(app)
      .patch('/api/v1/leads/bulk-assign')
      .set('Cookie', 'spaceezy_session=admin-token')
      .send({ leadIds: [LEAD], assignedToId: EXEC });

    expect(response.status).toBe(200);
    expect(prisma.leadActivity.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ metadata: { source: 'ADMIN_ASSIGNED' } }),
    });
  });

  it('bulk assign as SALES_MANAGER records MANAGER_ASSIGNED source', async () => {
    manager();
    prisma.user.findFirst.mockResolvedValue({ id: 'assignee-1', organizationId: ORG, name: 'Emp Two', status: 'ACTIVE' });
    prisma.lead.findMany.mockResolvedValue([{ id: LEAD, assignedToId: null }]);
    prisma.lead.updateMany.mockResolvedValue({ count: 1 });
    prisma.leadActivity.create.mockResolvedValue({ id: 'act-1' });

    const response = await request(app)
      .patch('/api/v1/leads/bulk-assign')
      .set('Cookie', 'spaceezy_session=manager-token')
      .send({ leadIds: [LEAD], assignedToId: EXEC });

    expect(response.status).toBe(200);
    expect(prisma.leadActivity.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ metadata: { source: 'MANAGER_ASSIGNED' } }),
    });
  });

  it('admin PATCH /users/:id can set selfClaimLimit without touching leads', async () => {
    admin();
    prisma.user.findFirst.mockResolvedValue({ id: EXEC, organizationId: ORG });
    prisma.user.update.mockResolvedValue({ id: EXEC, selfClaimLimit: 7 });

    const response = await request(app)
      .patch(`/api/v1/users/${EXEC}`)
      .set('Cookie', 'spaceezy_session=admin-token')
      .send({ selfClaimLimit: 7 });

    expect(response.status).toBe(200);
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ selfClaimLimit: 7 }) })
    );
    expect(prisma.lead.updateMany).not.toHaveBeenCalled();
  });

  it('rejects invalid selfClaimLimit values (negative, non-integer, above max)', async () => {
    admin();

    for (const bad of [-1, 1.5, 1001]) {
      const response = await request(app)
        .patch(`/api/v1/users/${EXEC}`)
        .set('Cookie', 'spaceezy_session=admin-token')
        .send({ selfClaimLimit: bad });

      expect(response.status).toBe(400);
      expect(response.body.code).toBe('VALIDATION_ERROR');
      expect(prisma.user.update).not.toHaveBeenCalled();
    }
  });

  it('GET /users/:id/profile exposes claim stats', async () => {
    admin();
    prisma.user.findFirst.mockResolvedValue({ id: EXEC, organizationId: ORG, name: 'Emp One', role: 'SALES_EXECUTIVE', status: 'ACTIVE', selfClaimLimit: 5, createdAt: new Date() });
    prisma.lead.findMany.mockResolvedValue([]);
    prisma.customer.findMany.mockResolvedValue([]);
    prisma.siteVisit.findMany.mockResolvedValue([]);
    prisma.booking.findMany.mockResolvedValue([]);
    prisma.leadActivity.findMany.mockResolvedValue([]);
    prisma.$queryRaw.mockResolvedValue([{ count: 3 }]);

    const response = await request(app)
      .get(`/api/v1/users/${EXEC}/profile`)
      .set('Cookie', 'spaceezy_session=admin-token');

    expect(response.status).toBe(200);
    expect(response.body.data.selfClaimLimit).toBe(5);
    expect(response.body.data.selfClaimedActive).toBe(3);
    expect(response.body.data.selfClaimRemaining).toBe(2);
  });
});
