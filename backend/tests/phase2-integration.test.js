const request = require('supertest');
const app = require('../src/app');

jest.mock('../src/db/prisma', () => {
  const mock = {
    session: { findUnique: jest.fn() },
    lead: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    leadActivity: { create: jest.fn() },
    project: { findFirst: jest.fn(), findMany: jest.fn(), count: jest.fn() },
    property: { findFirst: jest.fn(), findMany: jest.fn(), count: jest.fn() },
    siteVisit: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    quotation: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    user: { findFirst: jest.fn() },
    $transaction: jest.fn(),
  };
  mock.$transaction.mockImplementation(async (fn) => fn(mock));
  return mock;
});

const prisma = require('../src/db/prisma');

const ORG = '11111111-1111-4111-8111-111111111111';
const PROJECT = '88888888-8888-4888-8888-888888888888';
const PROJECT_OTHER = '99999999-9999-4999-8999-999999999999';
const PROP = '77777777-7777-4777-8777-777777777777';
const PROP_OTHER = '66666666-6666-4666-8666-666666666666';
const LEAD = 'aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const LEAD_OTHER = 'aaaaaaa2-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const VISIT = 'bbbbbbb1-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const QUOTE = 'ccccccc1-cccc-4ccc-8ccc-cccccccccccc';
const EXEC = '55555555-5555-4555-8555-555555555555';
const EXEC_OTHER = '44444444-4444-4444-8444-444444444444';

const mockSession = (role, userId) => {
  prisma.session.findUnique.mockResolvedValue({
    expiresAt: new Date(Date.now() + 60_000),
    user: { id: userId, organizationId: ORG, role, status: 'ACTIVE' },
  });
};

const admin = () => mockSession('ADMIN', 'admin-user');
const exec = (userId = EXEC) => mockSession('SALES_EXECUTIVE', userId);

const lead = (overrides = {}) => ({
  id: LEAD,
  organizationId: ORG,
  name: 'Test Lead',
  phone: '+91 90000 00000',
  status: 'NEW',
  projectId: null,
  propertyId: null,
  assignedToId: EXEC,
  ...overrides,
});

const siteVisit = (overrides = {}) => ({
  id: VISIT,
  organizationId: ORG,
  leadId: LEAD,
  assignedToId: EXEC,
  projectId: null,
  propertyId: null,
  date: new Date('2026-10-10T00:00:00.000Z'),
  time: '11:00',
  status: 'SCHEDULED',
  ...overrides,
});

const quotation = (overrides = {}) => ({
  id: QUOTE,
  organizationId: ORG,
  leadId: LEAD,
  projectId: PROJECT,
  status: 'SENT',
  totalAmount: 4500000,
  lead: { assignedToId: EXEC },
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.SESSION_COOKIE_NAME;
});

describe('Phase 2: Lead inventory references', () => {
  it('creates a lead with project and unit references (201)', async () => {
    admin();
    prisma.property.findFirst.mockResolvedValue({ id: PROP, projectId: PROJECT });
    prisma.project.findFirst.mockResolvedValue({ id: PROJECT });
    prisma.lead.create.mockResolvedValue(lead({ projectId: PROJECT, propertyId: PROP }));
    prisma.leadActivity.create.mockResolvedValue({});

    const response = await request(app)
      .post('/api/v1/leads')
      .set('Cookie', 'spaceezy_session=admin-token')
      .send({ name: 'Ref Lead', phone: '+91 91111 11111', projectId: PROJECT, propertyId: PROP });

    expect(response.status).toBe(201);
    const created = prisma.lead.create.mock.calls[0][0].data;
    expect(created.projectId).toBe(PROJECT);
    expect(created.propertyId).toBe(PROP);
  });

  it('rejects a unit from a different project with 400 CROSS_PROJECT_REFERENCE', async () => {
    admin();
    prisma.property.findFirst.mockResolvedValue({ id: PROP_OTHER, projectId: PROJECT_OTHER });

    const response = await request(app)
      .post('/api/v1/leads')
      .set('Cookie', 'spaceezy_session=admin-token')
      .send({ name: 'Cross', phone: '+91 91111 22222', projectId: PROJECT, propertyId: PROP_OTHER });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('CROSS_PROJECT_REFERENCE');
    expect(prisma.lead.create).not.toHaveBeenCalled();
  });

  it('returns 404 for a unit outside the organization', async () => {
    admin();
    prisma.property.findFirst.mockResolvedValue(null);

    const response = await request(app)
      .post('/api/v1/leads')
      .set('Cookie', 'spaceezy_session=admin-token')
      .send({ name: 'Foreign', phone: '+91 91111 33333', propertyId: PROP });

    expect(response.status).toBe(404);
    expect(prisma.lead.create).not.toHaveBeenCalled();
  });

  it('returns 404 for a project outside the organization', async () => {
    admin();
    prisma.project.findFirst.mockResolvedValue(null);

    const response = await request(app)
      .post('/api/v1/leads')
      .set('Cookie', 'spaceezy_session=admin-token')
      .send({ name: 'NoProject', phone: '+91 91111 44444', projectId: PROJECT });

    expect(response.status).toBe(404);
    expect(prisma.lead.create).not.toHaveBeenCalled();
  });

  it('rejects malformed reference UUIDs with 400 (not Prisma 500)', async () => {
    admin();

    const badProject = await request(app)
      .post('/api/v1/leads')
      .set('Cookie', 'spaceezy_session=admin-token')
      .send({ name: 'Bad', phone: '+91 91111 55555', projectId: 'not-a-uuid' });
    expect(badProject.status).toBe(400);
    expect(badProject.body.code).toBe('VALIDATION_ERROR');

    const badParam = await request(app)
      .get('/api/v1/leads/not-a-uuid')
      .set('Cookie', 'spaceezy_session=admin-token');
    expect(badParam.status).toBe(400);

    expect(prisma.lead.create).not.toHaveBeenCalled();
  });

  it('validates projectId/stage/from filters on the lead list (400, previously stripped)', async () => {
    admin();
    prisma.lead.findMany.mockResolvedValue([]);
    prisma.lead.count.mockResolvedValue(0);

    const ok = await request(app)
      .get(`/api/v1/leads?projectId=${PROJECT}&stage=SITE_VISIT`)
      .set('Cookie', 'spaceezy_session=admin-token');
    expect(ok.status).toBe(200);
    expect(prisma.lead.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ projectId: PROJECT }),
      })
    );

    const badUuid = await request(app)
      .get('/api/v1/leads?projectId=not-a-uuid')
      .set('Cookie', 'spaceezy_session=admin-token');
    expect(badUuid.status).toBe(400);

    const badStage = await request(app)
      .get('/api/v1/leads?stage=NOT_A_STAGE')
      .set('Cookie', 'spaceezy_session=admin-token');
    expect(badStage.status).toBe(400);

    const badDate = await request(app)
      .get('/api/v1/leads?from=notadate')
      .set('Cookie', 'spaceezy_session=admin-token');
    expect(badDate.status).toBe(400);
  });

  it('updates a lead and clears the unit when the project changes', async () => {
    admin();
    prisma.lead.findFirst.mockResolvedValue(lead({ projectId: PROJECT, propertyId: PROP }));
    prisma.project.findFirst.mockResolvedValue({ id: PROJECT_OTHER });
    prisma.lead.update.mockResolvedValue(lead({ projectId: PROJECT_OTHER, propertyId: null }));

    const response = await request(app)
      .patch(`/api/v1/leads/${LEAD}`)
      .set('Cookie', 'spaceezy_session=admin-token')
      .send({ projectId: PROJECT_OTHER });

    expect(response.status).toBe(200);
    const data = prisma.lead.update.mock.calls[0][0].data;
    expect(data.projectId).toBe(PROJECT_OTHER);
    expect(data.propertyId).toBeNull();
  });

  it('rejects updating a lead to a unit outside the organization (404)', async () => {
    admin();
    prisma.lead.findFirst.mockResolvedValue(lead({ projectId: PROJECT }));
    prisma.property.findFirst.mockResolvedValue(null);

    const response = await request(app)
      .patch(`/api/v1/leads/${LEAD}`)
      .set('Cookie', 'spaceezy_session=admin-token')
      .send({ propertyId: PROP_OTHER });

    expect(response.status).toBe(404);
    expect(prisma.lead.update).not.toHaveBeenCalled();
  });
});

describe('Phase 2: Stage transition payload validation', () => {
  it('rejects an invalid target stage with 422 (not 500)', async () => {
    admin();

    const response = await request(app)
      .post(`/api/v1/leads/${LEAD}/stage`)
      .set('Cookie', 'spaceezy_session=admin-token')
      .send({ target: 'NOT_A_STAGE' });

    expect(response.status).toBe(422);
    expect(response.body.code).toBe('VALIDATION_ERROR');
  });

  it('rejects a site visit payload with an unparseable date (400)', async () => {
    admin();

    const response = await request(app)
      .post(`/api/v1/leads/${LEAD}/stage`)
      .set('Cookie', 'spaceezy_session=admin-token')
      .send({ target: 'SITE_VISIT', siteVisit: { date: 'garbage-date', time: '11:00' } });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('VALIDATION_ERROR');
    expect(prisma.siteVisit.create).not.toHaveBeenCalled();
  });

  it('rejects a quotation payload with a non-numeric amount (400)', async () => {
    admin();

    const response = await request(app)
      .post(`/api/v1/leads/${LEAD}/stage`)
      .set('Cookie', 'spaceezy_session=admin-token')
      .send({ target: 'QUOTATION', quotation: { projectId: PROJECT, totalAmount: 'lots' } });

    expect(response.status).toBe(400);
    expect(prisma.quotation.create).not.toHaveBeenCalled();
  });

  it('creates the visit when transitioning to SITE_VISIT with a valid payload (201)', async () => {
    admin();
    prisma.lead.findFirst.mockResolvedValue(lead({ status: 'CONTACTED' }));
    prisma.siteVisit.findFirst.mockResolvedValue(null);
    prisma.project.findFirst.mockResolvedValue({ id: PROJECT });
    prisma.siteVisit.create.mockResolvedValue(siteVisit());
    prisma.lead.update.mockResolvedValue(lead({ status: 'SITE_VISIT' }));
    prisma.leadActivity.create.mockResolvedValue({});

    const response = await request(app)
      .post(`/api/v1/leads/${LEAD}/stage`)
      .set('Cookie', 'spaceezy_session=admin-token')
      .send({ target: 'SITE_VISIT', siteVisit: { date: '2026-10-10', time: '11:00', projectId: PROJECT } });

    expect(response.status).toBe(200);
    expect(prisma.siteVisit.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ leadId: LEAD, projectId: PROJECT, status: 'SCHEDULED' }),
      })
    );
    expect(prisma.lead.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'SITE_VISIT' } })
    );
  });
});

describe('Phase 2: Site visit relations and conflicts', () => {
  it('creates a linked site visit and advances the lead (201)', async () => {
    admin();
    prisma.lead.findFirst.mockResolvedValue(lead({ status: 'CONTACTED' }));
    prisma.project.findFirst.mockResolvedValue({ id: PROJECT });
    prisma.property.findFirst.mockResolvedValue({ id: PROP, projectId: PROJECT, title: 'A-101', unitNumber: 'A-101' });
    prisma.user.findFirst.mockResolvedValue({ id: EXEC, status: 'ACTIVE' });
    prisma.siteVisit.findMany.mockResolvedValue([]);
    prisma.siteVisit.create.mockResolvedValue(siteVisit({ projectId: PROJECT, propertyId: PROP }));
    prisma.lead.update.mockResolvedValue(lead({ status: 'SITE_VISIT' }));
    prisma.leadActivity.create.mockResolvedValue({});

    const response = await request(app)
      .post('/api/v1/site-visits')
      .set('Cookie', 'spaceezy_session=admin-token')
      .send({
        leadId: LEAD,
        projectId: PROJECT,
        propertyId: PROP,
        date: '2026-10-10',
        time: '11:00',
        assignedToId: EXEC,
      });

    expect(response.status).toBe(201);
    const created = prisma.siteVisit.create.mock.calls[0][0].data;
    expect(created.leadId).toBe(LEAD);
    expect(created.projectId).toBe(PROJECT);
    expect(created.propertyId).toBe(PROP);
    expect(created.leadName).toBe('Test Lead');
    expect(created.propertyName).toBe('A-101');
    expect(prisma.lead.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'SITE_VISIT' }) })
    );
  });

  it('returns 404 when the lead is not in the organization', async () => {
    admin();
    prisma.lead.findFirst.mockResolvedValue(null);

    const response = await request(app)
      .post('/api/v1/site-visits')
      .set('Cookie', 'spaceezy_session=admin-token')
      .send({ leadId: LEAD_OTHER, date: '2026-10-10', time: '11:00' });

    expect(response.status).toBe(404);
    expect(prisma.siteVisit.create).not.toHaveBeenCalled();
  });

  it('rejects a visit project that does not match the lead project (400)', async () => {
    admin();
    prisma.lead.findFirst.mockResolvedValue(lead({ projectId: PROJECT }));
    prisma.project.findFirst.mockResolvedValue({ id: PROJECT_OTHER });

    const response = await request(app)
      .post('/api/v1/site-visits')
      .set('Cookie', 'spaceezy_session=admin-token')
      .send({ leadId: LEAD, projectId: PROJECT_OTHER, date: '2026-10-10', time: '11:00' });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('CROSS_PROJECT_REFERENCE');
    expect(prisma.siteVisit.create).not.toHaveBeenCalled();
  });

  it('rejects a duplicate slot for the same lead with 409 DUPLICATE_VISIT', async () => {
    admin();
    prisma.lead.findFirst.mockResolvedValue(lead());
    prisma.siteVisit.findMany.mockResolvedValue([{ id: VISIT, time: '11:00' }]);

    const response = await request(app)
      .post('/api/v1/site-visits')
      .set('Cookie', 'spaceezy_session=admin-token')
      .send({ leadId: LEAD, date: '2026-10-10', time: '11:00' });

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('DUPLICATE_VISIT');
    expect(prisma.siteVisit.create).not.toHaveBeenCalled();
  });

  it('rejects an assignee slot conflict with 409 SLOT_CONFLICT', async () => {
    admin();
    prisma.lead.findFirst.mockResolvedValue(lead());
    prisma.user.findFirst.mockResolvedValue({ id: EXEC, status: 'ACTIVE' });
    prisma.siteVisit.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'other-visit', time: '14:00' }]);

    const response = await request(app)
      .post('/api/v1/site-visits')
      .set('Cookie', 'spaceezy_session=admin-token')
      .send({ leadId: LEAD, date: '2026-10-10', time: '14:00', assignedToId: EXEC });

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('SLOT_CONFLICT');
    expect(prisma.siteVisit.create).not.toHaveBeenCalled();
  });

  it('rejects a lowercase status on the status route with 400 (not Prisma 500)', async () => {
    admin();

    const response = await request(app)
      .patch(`/api/v1/site-visits/${VISIT}/status`)
      .set('Cookie', 'spaceezy_session=admin-token')
      .send({ status: 'Completed' });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('VALIDATION_ERROR');
    expect(prisma.siteVisit.update).not.toHaveBeenCalled();
  });

  it('rejects changing a final site visit with 409 VISIT_ALREADY_FINAL', async () => {
    admin();
    prisma.siteVisit.findFirst.mockResolvedValue(siteVisit({ status: 'COMPLETED' }));

    const response = await request(app)
      .patch(`/api/v1/site-visits/${VISIT}/status`)
      .set('Cookie', 'spaceezy_session=admin-token')
      .send({ status: 'CANCELLED' });

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('VISIT_ALREADY_FINAL');
    expect(prisma.siteVisit.update).not.toHaveBeenCalled();
  });

  it('completing a visit logs activity and advances the lead stage', async () => {
    admin();
    prisma.siteVisit.findFirst.mockResolvedValue(siteVisit());
    prisma.lead.findFirst.mockResolvedValue(lead({ status: 'NEW' }));
    prisma.siteVisit.update.mockResolvedValue(siteVisit({ status: 'COMPLETED' }));
    prisma.leadActivity.create.mockResolvedValue({});
    prisma.lead.update.mockResolvedValue(lead({ status: 'SITE_VISIT' }));

    const response = await request(app)
      .patch(`/api/v1/site-visits/${VISIT}/status`)
      .set('Cookie', 'spaceezy_session=admin-token')
      .send({ status: 'COMPLETED' });

    expect(response.status).toBe(200);
    expect(prisma.siteVisit.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'COMPLETED' } })
    );
    expect(prisma.lead.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'SITE_VISIT' } })
    );
    const activityTypes = prisma.leadActivity.create.mock.calls.map((c) => c[0].data.type);
    expect(activityTypes).toContain('SITE_VISIT');
    expect(activityTypes).toContain('STATUS_CHANGE');
  });

  it('blocks a SALES_EXECUTIVE from updating a visit assigned to someone else (403)', async () => {
    exec(EXEC);
    prisma.siteVisit.findFirst.mockResolvedValue(siteVisit({ assignedToId: EXEC_OTHER }));

    const response = await request(app)
      .patch(`/api/v1/site-visits/${VISIT}/status`)
      .set('Cookie', 'spaceezy_session=exec-token')
      .send({ status: 'COMPLETED' });

    expect(response.status).toBe(403);
    expect(prisma.siteVisit.update).not.toHaveBeenCalled();
  });

  it('returns 404 for a visit outside the organization', async () => {
    admin();
    prisma.siteVisit.findFirst.mockResolvedValue(null);

    const response = await request(app)
      .patch(`/api/v1/site-visits/${VISIT}/status`)
      .set('Cookie', 'spaceezy_session=admin-token')
      .send({ status: 'COMPLETED' });

    expect(response.status).toBe(404);
  });

  it('filters the visit list by projectId', async () => {
    admin();
    prisma.siteVisit.findMany.mockResolvedValue([]);
    prisma.siteVisit.count.mockResolvedValue(0);

    const response = await request(app)
      .get(`/api/v1/site-visits?projectId=${PROJECT}&status=SCHEDULED`)
      .set('Cookie', 'spaceezy_session=admin-token');

    expect(response.status).toBe(200);
    expect(prisma.siteVisit.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ projectId: PROJECT, status: 'SCHEDULED' }),
      })
    );

    const bad = await request(app)
      .get('/api/v1/site-visits?status=scheduled')
      .set('Cookie', 'spaceezy_session=admin-token');
    expect(bad.status).toBe(400);
  });
});

describe('Phase 2: Quotation business rules', () => {
  it('creates a quotation linked to lead, project and unit (201)', async () => {
    admin();
    prisma.lead.findFirst.mockResolvedValue(lead({ projectId: PROJECT }));
    prisma.project.findFirst.mockResolvedValue({ id: PROJECT });
    prisma.property.findFirst.mockResolvedValue({ id: PROP, projectId: PROJECT, status: 'AVAILABLE', price: 4500000 });
    prisma.quotation.create.mockResolvedValue(quotation({ status: 'DRAFT' }));
    prisma.leadActivity.create.mockResolvedValue({});

    const response = await request(app)
      .post('/api/v1/quotations')
      .set('Cookie', 'spaceezy_session=admin-token')
      .send({
        leadId: LEAD,
        projectId: PROJECT,
        propertyId: PROP,
        totalAmount: 4500000,
        status: 'DRAFT',
        notes: 'Festive offer',
      });

    expect(response.status).toBe(201);
    const created = prisma.quotation.create.mock.calls[0][0].data;
    expect(created.leadId).toBe(LEAD);
    expect(created.projectId).toBe(PROJECT);
    expect(created.propertyId).toBe(PROP);
    expect(created.totalAmount).toBe(4500000);
  });

  it('rejects a quotation whose unit belongs to another project (400)', async () => {
    admin();
    prisma.lead.findFirst.mockResolvedValue(lead({ projectId: PROJECT }));
    prisma.project.findFirst.mockResolvedValue({ id: PROJECT });
    prisma.property.findFirst.mockResolvedValue({ id: PROP_OTHER, projectId: PROJECT_OTHER, status: 'AVAILABLE', price: 4500000 });

    const response = await request(app)
      .post('/api/v1/quotations')
      .set('Cookie', 'spaceezy_session=admin-token')
      .send({ leadId: LEAD, projectId: PROJECT, propertyId: PROP_OTHER, totalAmount: 4500000 });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('CROSS_PROJECT_REFERENCE');
    expect(prisma.quotation.create).not.toHaveBeenCalled();
  });

  it('rejects a quotation whose project does not match the lead project (400)', async () => {
    admin();
    prisma.lead.findFirst.mockResolvedValue(lead({ projectId: PROJECT }));
    prisma.project.findFirst.mockResolvedValue({ id: PROJECT_OTHER });

    const response = await request(app)
      .post('/api/v1/quotations')
      .set('Cookie', 'spaceezy_session=admin-token')
      .send({ leadId: LEAD, projectId: PROJECT_OTHER, totalAmount: 4500000 });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('CROSS_PROJECT_REFERENCE');
    expect(prisma.quotation.create).not.toHaveBeenCalled();
  });

  it('rejects a quotation for a SOLD unit with 409 UNIT_SOLD', async () => {
    admin();
    prisma.lead.findFirst.mockResolvedValue(lead({ projectId: PROJECT }));
    prisma.project.findFirst.mockResolvedValue({ id: PROJECT });
    prisma.property.findFirst.mockResolvedValue({ id: PROP, projectId: PROJECT, status: 'SOLD', price: 4500000 });

    const response = await request(app)
      .post('/api/v1/quotations')
      .set('Cookie', 'spaceezy_session=admin-token')
      .send({ leadId: LEAD, projectId: PROJECT, propertyId: PROP, totalAmount: 4500000 });

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('UNIT_SOLD');
    expect(prisma.quotation.create).not.toHaveBeenCalled();
  });

  it('rejects amounts outside the price sanity band (400 PRICE_OUT_OF_RANGE)', async () => {
    admin();
    prisma.lead.findFirst.mockResolvedValue(lead({ projectId: PROJECT }));
    prisma.project.findFirst.mockResolvedValue({ id: PROJECT });
    prisma.property.findFirst.mockResolvedValue({ id: PROP, projectId: PROJECT, status: 'AVAILABLE', price: 4500000 });

    const tooLow = await request(app)
      .post('/api/v1/quotations')
      .set('Cookie', 'spaceezy_session=admin-token')
      .send({ leadId: LEAD, projectId: PROJECT, propertyId: PROP, totalAmount: 400000 });
    expect(tooLow.status).toBe(400);
    expect(tooLow.body.code).toBe('PRICE_OUT_OF_RANGE');

    const tooHigh = await request(app)
      .post('/api/v1/quotations')
      .set('Cookie', 'spaceezy_session=admin-token')
      .send({ leadId: LEAD, projectId: PROJECT, propertyId: PROP, totalAmount: 50000000 });
    expect(tooHigh.status).toBe(400);
    expect(tooHigh.body.code).toBe('PRICE_OUT_OF_RANGE');

    expect(prisma.quotation.create).not.toHaveBeenCalled();
  });

  it('blocks a SALES_EXECUTIVE from quoting a lead assigned to someone else (403)', async () => {
    exec(EXEC);
    prisma.lead.findFirst.mockResolvedValue(lead({ projectId: PROJECT, assignedToId: EXEC_OTHER }));
    prisma.project.findFirst.mockResolvedValue({ id: PROJECT });

    const response = await request(app)
      .post('/api/v1/quotations')
      .set('Cookie', 'spaceezy_session=exec-token')
      .send({ leadId: LEAD, projectId: PROJECT, totalAmount: 4500000 });

    expect(response.status).toBe(403);
    expect(prisma.quotation.create).not.toHaveBeenCalled();
  });

  it('returns 404 for a lead outside the organization', async () => {
    admin();
    prisma.lead.findFirst.mockResolvedValue(null);

    const response = await request(app)
      .post('/api/v1/quotations')
      .set('Cookie', 'spaceezy_session=admin-token')
      .send({ leadId: LEAD_OTHER, projectId: PROJECT, totalAmount: 4500000 });

    expect(response.status).toBe(404);
    expect(prisma.quotation.create).not.toHaveBeenCalled();
  });

  it('rejects a non-numeric or non-positive totalAmount with 400 (not Prisma 500)', async () => {
    admin();

    const badType = await request(app)
      .post('/api/v1/quotations')
      .set('Cookie', 'spaceezy_session=admin-token')
      .send({ leadId: LEAD, projectId: PROJECT, totalAmount: '4500000' });
    expect(badType.status).toBe(400);

    const negative = await request(app)
      .post('/api/v1/quotations')
      .set('Cookie', 'spaceezy_session=admin-token')
      .send({ leadId: LEAD, projectId: PROJECT, totalAmount: -1 });
    expect(negative.status).toBe(400);

    expect(prisma.quotation.create).not.toHaveBeenCalled();
  });

  it('rejects an invalid status transition with 409 INVALID_STATUS_TRANSITION', async () => {
    admin();
    prisma.quotation.findFirst.mockResolvedValue(quotation({ status: 'DRAFT' }));

    const response = await request(app)
      .patch(`/api/v1/quotations/${QUOTE}`)
      .set('Cookie', 'spaceezy_session=admin-token')
      .send({ status: 'ACCEPTED' });

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('INVALID_STATUS_TRANSITION');
    expect(prisma.quotation.update).not.toHaveBeenCalled();
  });

  it('allows SENT -> ACCEPTED and logs the activity (200)', async () => {
    admin();
    prisma.quotation.findFirst.mockResolvedValue(quotation({ status: 'SENT' }));
    prisma.quotation.update.mockResolvedValue(quotation({ status: 'ACCEPTED' }));
    prisma.leadActivity.create.mockResolvedValue({});

    const response = await request(app)
      .patch(`/api/v1/quotations/${QUOTE}`)
      .set('Cookie', 'spaceezy_session=admin-token')
      .send({ status: 'ACCEPTED' });

    expect(response.status).toBe(200);
    expect(prisma.quotation.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'ACCEPTED' } })
    );
    expect(prisma.leadActivity.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: 'NOTE', description: 'Quotation accepted' }),
      })
    );
  });

  it('advances the lead to QUOTATION when a draft becomes SENT', async () => {
    admin();
    prisma.quotation.findFirst.mockResolvedValue(quotation({ status: 'DRAFT' }));
    prisma.quotation.update.mockResolvedValue(quotation({ status: 'SENT' }));
    prisma.leadActivity.create.mockResolvedValue({});
    prisma.lead.findFirst.mockResolvedValue(lead({ status: 'SITE_VISIT' }));
    prisma.lead.update.mockResolvedValue(lead({ status: 'QUOTATION' }));

    const response = await request(app)
      .patch(`/api/v1/quotations/${QUOTE}`)
      .set('Cookie', 'spaceezy_session=admin-token')
      .send({ status: 'SENT' });

    expect(response.status).toBe(200);
    expect(prisma.lead.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'QUOTATION' } })
    );
    const activityTypes = prisma.leadActivity.create.mock.calls.map((c) => c[0].data.type);
    expect(activityTypes).toContain('STATUS_CHANGE');
  });

  it('blocks a SALES_EXECUTIVE from updating a quotation for a foreign lead (403)', async () => {
    exec(EXEC);
    prisma.quotation.findFirst.mockResolvedValue(
      quotation({ lead: { assignedToId: EXEC_OTHER } })
    );

    const response = await request(app)
      .patch(`/api/v1/quotations/${QUOTE}`)
      .set('Cookie', 'spaceezy_session=exec-token')
      .send({ status: 'REJECTED' });

    expect(response.status).toBe(403);
    expect(prisma.quotation.update).not.toHaveBeenCalled();
  });

  it('validates quotation list filters (400 for bad status, 200 for projectId)', async () => {
    admin();
    prisma.quotation.findMany.mockResolvedValue([]);
    prisma.quotation.count.mockResolvedValue(0);

    const bad = await request(app)
      .get('/api/v1/quotations?status=NOT_A_STATUS')
      .set('Cookie', 'spaceezy_session=admin-token');
    expect(bad.status).toBe(400);

    const ok = await request(app)
      .get(`/api/v1/quotations?projectId=${PROJECT}`)
      .set('Cookie', 'spaceezy_session=admin-token');
    expect(ok.status).toBe(200);
    expect(prisma.quotation.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ projectId: PROJECT }) })
    );
  });

  it('rejects a past validUntil with 400', async () => {
    admin();

    const response = await request(app)
      .post('/api/v1/quotations')
      .set('Cookie', 'spaceezy_session=admin-token')
      .send({
        leadId: LEAD,
        projectId: PROJECT,
        totalAmount: 4500000,
        validUntil: '2020-01-01T00:00:00.000Z',
      });

    expect(response.status).toBe(400);
    expect(prisma.quotation.create).not.toHaveBeenCalled();
  });
});

describe('Phase 2: RBAC on new permissions', () => {
  it('requires site_visit:create to schedule a visit', async () => {
    exec(EXEC);

    const response = await request(app)
      .post('/api/v1/site-visits')
      .set('Cookie', 'spaceezy_session=exec-token')
      .send({ date: '2026-10-10', time: '11:00' });

    // EXEC has site_visit:create, so it passes permission and fails on validation instead
    expect(response.status).not.toBe(403);
  });

  it('rejects unauthenticated access to the new endpoints (401)', async () => {
    const visits = await request(app)
      .post('/api/v1/site-visits')
      .send({ date: '2026-10-10', time: '11:00' });
    expect(visits.status).toBe(401);

    const quotations = await request(app)
      .post('/api/v1/quotations')
      .send({ leadId: LEAD, projectId: PROJECT, totalAmount: 1 });
    expect(quotations.status).toBe(401);
  });
});
