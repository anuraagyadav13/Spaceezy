const LeadService = require('../src/services/leadService');
const prisma = require('../src/db/prisma');

jest.mock('../src/db/prisma', () => ({
  $transaction: jest.fn(),
  lead: { findFirst: jest.fn(), update: jest.fn(), findUnique: jest.fn(), findMany: jest.fn(), count: jest.fn() },
  leadActivity: { create: jest.fn() },
  siteVisit: { findFirst: jest.fn(), create: jest.fn() },
  quotation: { findFirst: jest.fn(), create: jest.fn() },
  task: { findFirst: jest.fn(), create: jest.fn(), findMany: jest.fn(), update: jest.fn() },
}));

const ORG = 'org-1';
const USER = 'user-1';
const LEAD_ID = 'lead-1';

describe('LeadService.buildLeadScope', () => {
  it('SALES_EXECUTIVE is forced to assignedToId = userId', () => {
    const scope = LeadService.buildLeadScope('SALES_EXECUTIVE', USER, {});
    expect(scope.assignedToId).toBe(USER);
  });

  it('CHANNEL_PARTNER is forced to assignedToId = userId', () => {
    const scope = LeadService.buildLeadScope('CHANNEL_PARTNER', USER, {});
    expect(scope.assignedToId).toBe(USER);
  });

  it('ADMIN is not forced to a specific assignee', () => {
    const scope = LeadService.buildLeadScope('ADMIN', USER, {});
    expect(scope.assignedToId).toBeUndefined();
  });

  it('ADMIN can filter by assignedTo', () => {
    const scope = LeadService.buildLeadScope('ADMIN', USER, { assignedTo: 'user-9' });
    expect(scope.assignedToId).toBe('user-9');
  });

  it('SALES_EXECUTIVE ignores assignedTo filter (forced to self)', () => {
    const scope = LeadService.buildLeadScope('SALES_EXECUTIVE', USER, { assignedTo: 'user-9' });
    expect(scope.assignedToId).toBe(USER);
  });

  it('maps stage filter to status group (FOLLOW_UP includes legacy INTERESTED/QUALIFIED)', () => {
    const scope = LeadService.buildLeadScope('ADMIN', USER, { stage: 'FOLLOW_UP' });
    expect(scope.status).toEqual({ in: ['FOLLOW_UP', 'INTERESTED', 'QUALIFIED'] });
  });

  it('maps stage filter to status group (QUOTATION includes legacy NEGOTIATION)', () => {
    const scope = LeadService.buildLeadScope('ADMIN', USER, { stage: 'QUOTATION' });
    expect(scope.status).toEqual({ in: ['QUOTATION', 'NEGOTIATION'] });
  });

  it('maps stage filter to status group (NEW)', () => {
    const scope = LeadService.buildLeadScope('ADMIN', USER, { stage: 'NEW' });
    expect(scope.status).toEqual({ in: ['NEW'] });
  });

  it('applies projectId, source, and date range filters', () => {
    const scope = LeadService.buildLeadScope('ADMIN', USER, {
      projectId: 'proj-1',
      source: 'Website',
      from: '2026-10-01T00:00:00Z',
      to: '2026-10-31T00:00:00Z',
    });
    expect(scope.projectId).toBe('proj-1');
    expect(scope.source).toBe('Website');
    expect(scope.createdAt).toEqual({ gte: new Date('2026-10-01T00:00:00Z'), lt: new Date('2026-10-31T00:00:00Z') });
  });

  it('combines role scope with filters', () => {
    const scope = LeadService.buildLeadScope('SALES_EXECUTIVE', USER, { projectId: 'proj-1', source: 'Website' });
    expect(scope.assignedToId).toBe(USER);
    expect(scope.projectId).toBe('proj-1');
    expect(scope.source).toBe('Website');
  });

  it('builds OR search across name, phone, and email', () => {
    const scope = LeadService.buildLeadScope('ADMIN', USER, { search: 'rohit' });
    expect(scope.OR).toEqual([
      { name: { contains: 'rohit', mode: 'insensitive' } },
      { phone: { contains: 'rohit' } },
      { email: { contains: 'rohit', mode: 'insensitive' } }
    ]);
  });

  it('ignores blank search terms', () => {
    const scope = LeadService.buildLeadScope('ADMIN', USER, { search: '   ' });
    expect(scope.OR).toBeUndefined();
  });
});

describe('LeadService.logContact', () => {
  beforeEach(() => jest.clearAllMocks());

  function setupTx(lead) {
    const tx = {
      lead: {
        findFirst: jest.fn().mockResolvedValue(lead),
        update: jest.fn().mockResolvedValue({ ...lead, status: 'CONTACTED' }),
        findUnique: jest.fn().mockResolvedValue({ ...lead, status: 'CONTACTED' }),
      },
      leadActivity: { create: jest.fn().mockResolvedValue({ id: 'act-1' }) },
    };
    prisma.$transaction.mockImplementation(async (callback) => callback(tx));
    return tx;
  }

  it('NEW lead + contact advances to CONTACTED in same transaction', async () => {
    const lead = { id: LEAD_ID, status: 'NEW', assignedToId: USER, name: 'Rohit' };
    const tx = setupTx(lead);

    await LeadService.logContact(LEAD_ID, { channel: 'CALL', notes: 'Spoke' }, ORG, 'ADMIN', USER);

    expect(tx.leadActivity.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ type: 'CALL', metadata: expect.objectContaining({ channel: 'CALL', notes: 'Spoke' }) })
    }));
    expect(tx.lead.update).toHaveBeenCalledWith({ where: { id: LEAD_ID }, data: { status: 'CONTACTED' } });
    expect(tx.leadActivity.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ type: 'STATUS_CHANGE', metadata: expect.objectContaining({ from: 'NEW', to: 'CONTACTED' }) })
    }));
  });

  it('CONTACTED lead + contact does NOT change status (no backward move)', async () => {
    const lead = { id: LEAD_ID, status: 'CONTACTED', assignedToId: USER, name: 'Rohit' };
    const tx = setupTx(lead);

    await LeadService.logContact(LEAD_ID, { channel: 'WHATSAPP', notes: 'Sent brochure' }, ORG, 'ADMIN', USER);

    expect(tx.leadActivity.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ type: 'NOTE', metadata: expect.objectContaining({ channel: 'WHATSAPP' }) })
    }));
    expect(tx.lead.update).not.toHaveBeenCalledWith({ where: { id: LEAD_ID }, data: { status: 'CONTACTED' } });
  });

  it('SITE_VISIT lead + contact logs activity but keeps stage', async () => {
    const lead = { id: LEAD_ID, status: 'SITE_VISIT', assignedToId: USER, name: 'Rohit' };
    const tx = setupTx(lead);

    await LeadService.logContact(LEAD_ID, { channel: 'EMAIL' }, ORG, 'ADMIN', USER);

    expect(tx.leadActivity.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ type: 'EMAIL' })
    }));
    expect(tx.lead.update).not.toHaveBeenCalled();
  });

  it('RBAC: executive cannot log contact on unassigned lead', async () => {
    setupTx({ id: LEAD_ID, status: 'NEW', assignedToId: 'other' });

    await expect(LeadService.logContact(LEAD_ID, { channel: 'CALL' }, ORG, 'SALES_EXECUTIVE', USER))
      .rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
  });
});

describe('LeadService.scheduleFollowUp', () => {
  beforeEach(() => jest.clearAllMocks());

  function setupTx(lead) {
    const tx = {
      lead: {
        findFirst: jest.fn().mockResolvedValue(lead),
        update: jest.fn().mockResolvedValue(lead),
      },
      leadActivity: { create: jest.fn().mockResolvedValue({ id: 'act-1' }) },
      task: { create: jest.fn().mockResolvedValue({ id: 'task-1' }) },
    };
    prisma.$transaction.mockImplementation(async (callback) => callback(tx));
    return tx;
  }

  it('creates Task + sets nextFollowUpAt + advances NEW -> FOLLOW_UP', async () => {
    const lead = { id: LEAD_ID, status: 'NEW', assignedToId: USER, name: 'Rohit' };
    const tx = setupTx(lead);

    await LeadService.scheduleFollowUp(LEAD_ID, { dueDate: '2026-10-10T10:00:00Z', notes: 'Call' }, ORG, 'ADMIN', USER);

    expect(tx.task.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ leadId: LEAD_ID, type: 'FOLLOW_UP', status: 'PENDING', dueDate: new Date('2026-10-10T10:00:00Z') })
    }));
    expect(tx.lead.update).toHaveBeenCalledWith({ where: { id: LEAD_ID }, data: { nextFollowUpAt: new Date('2026-10-10T10:00:00Z') } });
    expect(tx.lead.update).toHaveBeenCalledWith({ where: { id: LEAD_ID }, data: { status: 'FOLLOW_UP' } });
  });

  it('requires dueDate', async () => {
    setupTx({ id: LEAD_ID, status: 'NEW', assignedToId: USER });

    await expect(LeadService.scheduleFollowUp(LEAD_ID, {}, ORG, 'ADMIN', USER))
      .rejects.toMatchObject({ statusCode: 422, code: 'VALIDATION_ERROR' });
  });
});

describe('LeadService.getFollowups (Task-based)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('queries FOLLOW_UP tasks and computes dueBucket', async () => {
    const tasks = [
      { id: 't1', type: 'FOLLOW_UP', status: 'PENDING', dueDate: new Date('2020-01-01'), title: 'Call', description: null, lead: { name: 'Rohit' }, assignedTo: { name: 'John' } },
      { id: 't2', type: 'FOLLOW_UP', status: 'PENDING', dueDate: new Date(), title: 'Visit', description: null, lead: { name: 'Neha' }, assignedTo: null },
      { id: 't3', type: 'FOLLOW_UP', status: 'COMPLETED', dueDate: new Date('2020-01-01'), title: 'Done', description: null, lead: { name: 'Vikram' }, assignedTo: null },
    ];
    prisma.task.findMany = jest.fn().mockResolvedValue(tasks);

    const result = await LeadService.getFollowups(ORG, {}, 'ADMIN', USER);

    expect(prisma.task.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ organizationId: ORG, type: 'FOLLOW_UP' })
    }));
    expect(result).toHaveLength(3);
    expect(result[0].dueBucket).toBe('OVERDUE');
    expect(result[0].refName).toBe('Rohit');
    expect(result[1].dueBucket).toBe('DUE_TODAY');
    expect(result[2].dueBucket).toBe('COMPLETED');
  });

  it('scopes follow-ups to the executive own leads', async () => {
    prisma.task.findMany = jest.fn().mockResolvedValue([]);

    await LeadService.getFollowups(ORG, {}, 'SALES_EXECUTIVE', USER);

    expect(prisma.task.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ assignedToId: USER })
    }));
  });
});
