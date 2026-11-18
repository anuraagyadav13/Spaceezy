const LeadService = require('../src/services/leadService');
const prisma = require('../src/db/prisma');

jest.mock('../src/db/prisma', () => ({
  $transaction: jest.fn(),
  lead: { findFirst: jest.fn(), update: jest.fn(), findUnique: jest.fn() },
  leadActivity: { create: jest.fn() },
  project: { findFirst: jest.fn() },
  property: { findFirst: jest.fn() },
  configuration: { findFirst: jest.fn() },
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
    project: { findFirst: jest.fn().mockResolvedValue(overrides.project || { id: 'proj-1', organizationId: ORG }) },
    property: { findFirst: jest.fn().mockResolvedValue(overrides.property || null) },
    configuration: { findFirst: jest.fn().mockResolvedValue(overrides.configuration || null) },
    user: { findFirst: jest.fn().mockResolvedValue({ id: USER, organizationId: ORG, status: 'ACTIVE' }) },
  };
  prisma.$transaction.mockImplementation(async (callback) => callback(tx));
  prisma.lead.findFirst.mockResolvedValue(lead);
  prisma.lead.update.mockImplementation(async ({ data }) => ({ ...lead, ...data }));
  return tx;
}

describe('discardLead status guard', () => {
  beforeEach(() => jest.clearAllMocks());

  it('rejects BOOKED leads with LEAD_NOT_DISCARDABLE (409)', async () => {
    const lead = { id: LEAD_ID, status: 'BOOKED', assignedToId: USER, organizationId: ORG };
    setupTx(lead);
    await expect(LeadService.discardLead(LEAD_ID, 'no', ORG, 'ADMIN', USER)).rejects.toMatchObject({ statusCode: 409, code: 'LEAD_NOT_DISCARDABLE' });
  });

  it('rejects CLOSED leads with LEAD_NOT_DISCARDABLE (409)', async () => {
    const lead = { id: LEAD_ID, status: 'CLOSED', assignedToId: USER, organizationId: ORG };
    setupTx(lead);
    await expect(LeadService.discardLead(LEAD_ID, 'no', ORG, 'ADMIN', USER)).rejects.toMatchObject({ statusCode: 409, code: 'LEAD_NOT_DISCARDABLE' });
  });

  it('allows discarding a NEW lead and sets junk metadata', async () => {
    const lead = { id: LEAD_ID, status: 'NEW', assignedToId: USER, organizationId: ORG, junkedAt: null };
    const tx = setupTx(lead);
    const result = await LeadService.discardLead(LEAD_ID, 'not interested', ORG, 'ADMIN', USER);
    expect(result.status).toBe('LOST');
    expect(result.junkedAt).toBeTruthy();
    expect(result.junkReason).toBe('not interested');
    expect(result.purgeAfter).toBeTruthy();
    expect(prisma.leadActivity.create).toHaveBeenCalled();
  });

  it('is idempotent when already discarded', async () => {
    const lead = { id: LEAD_ID, status: 'LOST', assignedToId: USER, organizationId: ORG, junkedAt: new Date() };
    setupTx(lead);
    const result = await LeadService.discardLead(LEAD_ID, 'x', ORG, 'ADMIN', USER);
    expect(result.junkedAt).toBeTruthy();
  });
});

describe('originalProjectId preservation', () => {
  beforeEach(() => jest.clearAllMocks());

  it('sets originalProjectId on first project assignment via updateLead', async () => {
    const lead = { id: LEAD_ID, status: 'NEW', assignedToId: USER, organizationId: ORG, projectId: null, originalProjectId: null, propertyId: null, configurationId: null };
    setupTx(lead, { project: { id: 'proj-2', organizationId: ORG } });
    prisma.project.findFirst.mockResolvedValue({ id: 'proj-2', organizationId: ORG });
    // updateLead calls resolveInventoryRefs which uses prisma (not tx) for project lookup
    const result = await LeadService.updateLead(LEAD_ID, { projectId: 'proj-2' }, ORG, 'ADMIN', USER);
    // originalProjectId should be set to proj-2
    expect(result.originalProjectId).toBe('proj-2');
  });

  it('never overwrites an existing originalProjectId', async () => {
    const lead = { id: LEAD_ID, status: 'NEW', assignedToId: USER, organizationId: ORG, projectId: 'proj-1', originalProjectId: 'proj-orig', propertyId: null, configurationId: null };
    setupTx(lead, { project: { id: 'proj-2', organizationId: ORG } });
    prisma.project.findFirst.mockResolvedValue({ id: 'proj-2', organizationId: ORG });
    const result = await LeadService.updateLead(LEAD_ID, { projectId: 'proj-2' }, ORG, 'ADMIN', USER);
    expect(result.originalProjectId).toBe('proj-orig');
  });
});
