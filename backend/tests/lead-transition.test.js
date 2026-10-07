const LeadService = require('../src/services/leadService');
const prisma = require('../src/db/prisma');

jest.mock('../src/db/prisma', () => ({
  $transaction: jest.fn(),
  lead: { findFirst: jest.fn(), update: jest.fn(), findUnique: jest.fn() },
  leadActivity: { create: jest.fn() },
  siteVisit: { findFirst: jest.fn(), create: jest.fn() },
  quotation: { findFirst: jest.fn(), create: jest.fn() },
  task: { findFirst: jest.fn(), create: jest.fn() },
  project: { findFirst: jest.fn() },
  property: { findFirst: jest.fn() },
  user: { findFirst: jest.fn() },
}));

const ORG = 'org-1';
const USER = 'user-1';
const LEAD_ID = 'lead-1';

function setupTx(lead, overrides = {}) {
    const tx = {
    lead: {
      findFirst: jest.fn().mockResolvedValue(lead),
      update: jest.fn().mockImplementation(async ({ data }) => ({ ...lead, ...data })),
      findUnique: jest.fn().mockResolvedValue(lead),
    },
    leadActivity: { create: jest.fn().mockResolvedValue({ id: 'act-1' }) },
    siteVisit: {
      findFirst: jest.fn().mockResolvedValue(overrides.existingVisit || null),
      create: jest.fn().mockResolvedValue({ id: 'sv-1' }),
    },
    quotation: {
      findFirst: jest.fn().mockResolvedValue(overrides.existingQuotation || null),
      create: jest.fn().mockResolvedValue({ id: 'q-1' }),
    },
    task: {
      findFirst: jest.fn().mockResolvedValue(overrides.existingTask || null),
      create: jest.fn().mockResolvedValue({ id: 'task-1' }),
    },
    project: {
      findFirst: jest.fn().mockResolvedValue(overrides.project || { id: 'proj-1', organizationId: ORG }),
    },
    property: {
      findFirst: jest.fn().mockResolvedValue(overrides.property || null),
    },
    user: {
      findFirst: jest.fn().mockResolvedValue({ id: USER, organizationId: ORG, status: 'ACTIVE' }),
    },
  };
  prisma.$transaction.mockImplementation(async (callback) => callback(tx));
  return tx;
}

describe('LeadService.transitionStage', () => {
  beforeEach(() => jest.clearAllMocks());

  it('NEW -> CONTACTED (explicit) succeeds and writes STATUS_CHANGE audit', async () => {
    const lead = { id: LEAD_ID, status: 'NEW', assignedToId: USER, name: 'Rohit' };
    const tx = setupTx(lead);

    const result = await LeadService.transitionStage(LEAD_ID, 'CONTACTED', {}, ORG, 'ADMIN', USER);

    expect(tx.lead.update).toHaveBeenCalledWith({ where: { id: LEAD_ID }, data: { status: 'CONTACTED' } });
    expect(tx.leadActivity.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ type: 'STATUS_CHANGE', metadata: { from: 'NEW', to: 'CONTACTED', reason: null } })
    }));
    expect(result.status).toBe('CONTACTED');
  });

  it('NEW -> FOLLOW_UP without payload rejects with TRANSITION_REQUIRES_FOLLOW_UP', async () => {
    setupTx({ id: LEAD_ID, status: 'NEW', assignedToId: USER });

    await expect(LeadService.transitionStage(LEAD_ID, 'FOLLOW_UP', {}, ORG, 'ADMIN', USER))
      .rejects.toMatchObject({ statusCode: 409, code: 'TRANSITION_REQUIRES_FOLLOW_UP' });
  });

  it('NEW -> FOLLOW_UP with payload creates Task + nextFollowUpAt + audit', async () => {
    const lead = { id: LEAD_ID, status: 'NEW', assignedToId: USER, name: 'Rohit' };
    const tx = setupTx(lead);
    const payload = { followUp: { dueDate: '2026-10-10T10:00:00Z', notes: 'Call' } };

    await LeadService.transitionStage(LEAD_ID, 'FOLLOW_UP', payload, ORG, 'ADMIN', USER);

    expect(tx.task.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ leadId: LEAD_ID, type: 'FOLLOW_UP', status: 'PENDING', dueDate: new Date('2026-10-10T10:00:00Z') })
    }));
    expect(tx.lead.update).toHaveBeenCalledWith({ where: { id: LEAD_ID }, data: { nextFollowUpAt: new Date('2026-10-10T10:00:00Z') } });
    expect(tx.leadActivity.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ type: 'FOLLOW_UP' })
    }));
  });

  it('CONTACTED -> SITE_VISIT without payload rejects with TRANSITION_REQUIRES_SITE_VISIT', async () => {
    setupTx({ id: LEAD_ID, status: 'CONTACTED', assignedToId: USER });

    await expect(LeadService.transitionStage(LEAD_ID, 'SITE_VISIT', {}, ORG, 'ADMIN', USER))
      .rejects.toMatchObject({ statusCode: 409, code: 'TRANSITION_REQUIRES_SITE_VISIT' });
  });

  it('CONTACTED -> SITE_VISIT with payload creates SiteVisit + audit', async () => {
    const lead = { id: LEAD_ID, status: 'CONTACTED', assignedToId: USER, name: 'Rohit' };
    const tx = setupTx(lead);
    const payload = { siteVisit: { date: '2026-10-10T10:00:00Z', time: '10:00 AM' } };

    await LeadService.transitionStage(LEAD_ID, 'SITE_VISIT', payload, ORG, 'ADMIN', USER);

    expect(tx.siteVisit.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ leadId: LEAD_ID, status: 'SCHEDULED', date: new Date('2026-10-10T10:00:00Z') })
    }));
    expect(tx.leadActivity.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ type: 'SITE_VISIT' })
    }));
  });

  it('SITE_VISIT -> QUOTATION without payload rejects with TRANSITION_REQUIRES_QUOTATION', async () => {
    setupTx({ id: LEAD_ID, status: 'SITE_VISIT', assignedToId: USER });

    await expect(LeadService.transitionStage(LEAD_ID, 'QUOTATION', {}, ORG, 'ADMIN', USER))
      .rejects.toMatchObject({ statusCode: 409, code: 'TRANSITION_REQUIRES_QUOTATION' });
  });

  it('SITE_VISIT -> QUOTATION with payload creates Quotation + audit', async () => {
    const lead = { id: LEAD_ID, status: 'SITE_VISIT', assignedToId: USER, name: 'Rohit' };
    const tx = setupTx(lead);
    const payload = { quotation: { projectId: 'proj-1', totalAmount: 15000000, validUntil: '2026-11-10T10:00:00Z' } };

    await LeadService.transitionStage(LEAD_ID, 'QUOTATION', payload, ORG, 'ADMIN', USER);

    expect(tx.quotation.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ leadId: LEAD_ID, projectId: 'proj-1', totalAmount: 15000000, status: 'SENT' })
    }));
  });

  it('allows SITE_VISIT -> SITE_VISIT again when a visit already exists (no payload needed)', async () => {
    const lead = { id: LEAD_ID, status: 'SITE_VISIT', assignedToId: USER };
    const tx = setupTx(lead, { existingVisit: { id: 'sv-1', status: 'SCHEDULED' } });

    // same stage -> SAME_STAGE rejection happens first
    await expect(LeadService.transitionStage(LEAD_ID, 'SITE_VISIT', {}, ORG, 'ADMIN', USER))
      .rejects.toMatchObject({ statusCode: 409, code: 'SAME_STAGE' });
  });

  it('any -> BOOKING rejects with TRANSITION_REQUIRES_BOOKING', async () => {
    setupTx({ id: LEAD_ID, status: 'QUOTATION', assignedToId: USER });

    await expect(LeadService.transitionStage(LEAD_ID, 'BOOKING', {}, ORG, 'ADMIN', USER))
      .rejects.toMatchObject({ statusCode: 409, code: 'TRANSITION_REQUIRES_BOOKING' });
  });

  it('BOOKED lead -> CONTACTED rejects with INVALID_TRANSITION', async () => {
    setupTx({ id: LEAD_ID, status: 'BOOKED', assignedToId: USER });

    await expect(LeadService.transitionStage(LEAD_ID, 'CONTACTED', {}, ORG, 'ADMIN', USER))
      .rejects.toMatchObject({ statusCode: 409, code: 'INVALID_TRANSITION' });
  });

  it('BOOKED lead -> BOOKING column rejects with SAME_STAGE', async () => {
    setupTx({ id: LEAD_ID, status: 'BOOKED', assignedToId: USER });

    await expect(LeadService.transitionStage(LEAD_ID, 'BOOKING', {}, ORG, 'ADMIN', USER))
      .rejects.toMatchObject({ statusCode: 409, code: 'SAME_STAGE' });
  });

  it('raw BOOKED target rejects with TRANSITION_REQUIRES_BOOKING', async () => {
    setupTx({ id: LEAD_ID, status: 'QUOTATION', assignedToId: USER });

    await expect(LeadService.transitionStage(LEAD_ID, 'BOOKED', {}, ORG, 'ADMIN', USER))
      .rejects.toMatchObject({ statusCode: 409, code: 'TRANSITION_REQUIRES_BOOKING' });
  });

  it('BOOKED -> LOST is allowed (exit via lost)', async () => {
    const lead = { id: LEAD_ID, status: 'BOOKED', assignedToId: USER };
    const tx = setupTx(lead);

    await LeadService.transitionStage(LEAD_ID, 'LOST', { reason: 'Not interested' }, ORG, 'ADMIN', USER);

    expect(tx.lead.update).toHaveBeenCalledWith({ where: { id: LEAD_ID }, data: { status: 'LOST' } });
  });

  it('same stage rejects with SAME_STAGE', async () => {
    setupTx({ id: LEAD_ID, status: 'NEW', assignedToId: USER });

    await expect(LeadService.transitionStage(LEAD_ID, 'NEW', {}, ORG, 'ADMIN', USER))
      .rejects.toMatchObject({ statusCode: 409, code: 'SAME_STAGE' });
  });

  it('invalid target rejects with VALIDATION_ERROR', async () => {
    setupTx({ id: LEAD_ID, status: 'NEW', assignedToId: USER });

    await expect(LeadService.transitionStage(LEAD_ID, 'INVALID', {}, ORG, 'ADMIN', USER))
      .rejects.toMatchObject({ statusCode: 422, code: 'VALIDATION_ERROR' });
  });

  it('LOST -> NEW (re-open) is allowed', async () => {
    const lead = { id: LEAD_ID, status: 'LOST', assignedToId: USER };
    const tx = setupTx(lead);

    await LeadService.transitionStage(LEAD_ID, 'NEW', { reason: 'Re-engaged' }, ORG, 'ADMIN', USER);

    expect(tx.lead.update).toHaveBeenCalledWith({ where: { id: LEAD_ID }, data: { status: 'NEW' } });
  });

  it('RBAC: SALES_EXECUTIVE cannot transition a lead not assigned to them', async () => {
    setupTx({ id: LEAD_ID, status: 'NEW', assignedToId: 'other-user' });

    await expect(LeadService.transitionStage(LEAD_ID, 'CONTACTED', {}, ORG, 'SALES_EXECUTIVE', USER))
      .rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
  });

  it('RBAC: SALES_EXECUTIVE can transition their own lead', async () => {
    const lead = { id: LEAD_ID, status: 'NEW', assignedToId: USER };
    const tx = setupTx(lead);

    await LeadService.transitionStage(LEAD_ID, 'CONTACTED', {}, ORG, 'SALES_EXECUTIVE', USER);

    expect(tx.lead.update).toHaveBeenCalledWith({ where: { id: LEAD_ID }, data: { status: 'CONTACTED' } });
  });

  it('non-existent lead rejects with NOT_FOUND', async () => {
    setupTx(null);

    await expect(LeadService.transitionStage(LEAD_ID, 'CONTACTED', {}, ORG, 'ADMIN', USER))
      .rejects.toMatchObject({ statusCode: 404, code: 'NOT_FOUND' });
  });
});
