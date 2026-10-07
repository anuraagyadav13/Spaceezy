const request = require('supertest');
const app = require('../src/app');

jest.mock('../src/db/prisma', () => {
  const mock = {
    session: { findUnique: jest.fn() },
    user: { findFirst: jest.fn(), findMany: jest.fn(), findUnique: jest.fn() },
    lead: { findFirst: jest.fn(), findMany: jest.fn(), count: jest.fn(), update: jest.fn(), create: jest.fn() },
    leadActivity: { create: jest.fn(), findMany: jest.fn() },
    leadInterest: { findMany: jest.fn(), create: jest.fn(), deleteMany: jest.fn() },
    leadPreferredLocation: { deleteMany: jest.fn(), createMany: jest.fn(), count: jest.fn() },
    project: { findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn(), count: jest.fn() },
    property: { findFirst: jest.fn(), findMany: jest.fn() },
    locationState: { findFirst: jest.fn(), findMany: jest.fn() },
    locationDistrict: { findFirst: jest.fn(), findMany: jest.fn() },
    locationRegion: { findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
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
const EXEC = '55555555-5555-4555-8555-555555555555';
const ST_MH = 'eeeeeee1-eeee-4eee-8eee-eeeeeeeeeeee';
const ST_HR = 'eeeeeee2-eeee-4eee-8eee-eeeeeeeeeeee';
const DIS_PUNE = 'ddddddd1-dddd-4ddd-8ddd-ddddddddddd1';
const REG_KOTHRUD = 'fffffff1-ffff-4fff-8fff-fffffffffff1';
const REG_BANER = 'fffffff2-ffff-4fff-8fff-fffffffffff2';
const UNIT_A = 'bbbbbbb1-bbbb-4bbb-8bbb-bbbbbbbbbbb1';
const UNIT_B = 'bbbbbbb2-bbbb-4bbb-8bbb-bbbbbbbbbbb2';
const UNIT_C = 'bbbbbbb3-bbbb-4bbb-8bbb-bbbbbbbbbbb3';
const UNIT_D = 'bbbbbbb4-bbbb-4bbb-8bbb-bbbbbbbbbbb4';
const UNIT_E = 'bbbbbbb5-bbbb-4bbb-8bbb-bbbbbbbbbbb5';
const PROJ = 'ccccccc1-cccc-4ccc-8ccc-ccccccccccc1';

const cookie = 'spaceezy_session=admin-token';

const mockSession = (role = 'ADMIN', userId = 'admin-user') => {
  prisma.session.findUnique.mockResolvedValue({
    expiresAt: new Date(Date.now() + 60_000),
    user: { id: userId, organizationId: ORG, role, status: 'ACTIVE' },
  });
};

beforeEach(() => {
  jest.resetAllMocks();
  prisma.$transaction.mockImplementation(async (fn) => fn(prisma));
  prisma.auditLog.create.mockResolvedValue({ id: 'audit-1' });
  prisma.locationState.findMany.mockResolvedValue([]);
  prisma.locationDistrict.findMany.mockResolvedValue([]);
  prisma.locationRegion.findMany.mockResolvedValue([]);
  mockSession();
});

describe('Phase 7: canonical location master APIs', () => {
  it('requires auth for /api/v1/locations/states', async () => {
    const response = await request(app).get('/api/v1/locations/states');
    expect(response.status).toBe(401);
  });

  it('lists states from the master', async () => {
    prisma.locationState.findMany.mockResolvedValue([
      { id: ST_MH, code: 'MH', name: 'Maharashtra' },
      { id: ST_HR, code: 'HR', name: 'Haryana' },
    ]);

    const response = await request(app)
      .get('/api/v1/locations/states')
      .set('Cookie', cookie);

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(2);
    expect(prisma.locationState.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { name: 'asc' } })
    );
  });

  it('lists districts for a state and 404s for unknown state', async () => {
    prisma.locationState.findFirst.mockResolvedValue({ id: ST_MH });
    prisma.locationDistrict.findMany.mockResolvedValue([
      { id: DIS_PUNE, name: 'Pune', stateId: ST_MH },
    ]);

    const ok = await request(app)
      .get(`/api/v1/locations/states/${ST_MH}/districts`)
      .set('Cookie', cookie);
    expect(ok.status).toBe(200);
    expect(ok.body.data).toHaveLength(1);

    prisma.locationState.findFirst.mockResolvedValue(null);
    const missing = await request(app)
      .get('/api/v1/locations/states/eeeeeee9-eeee-4eee-8eee-eeeeeeeeeeee/districts')
      .set('Cookie', cookie);
    expect(missing.status).toBe(404);
  });

  it('rejects a non-uuid district param', async () => {
    const response = await request(app)
      .get('/api/v1/locations/districts/not-a-uuid/regions')
      .set('Cookie', cookie);
    expect(response.status).toBe(400);
  });

  it('filters states by ?q= server-side and treats an empty q as no filter', async () => {
    prisma.locationState.findMany.mockResolvedValue([{ id: ST_MH, code: 'MH', name: 'Maharashtra' }]);

    const filtered = await request(app)
      .get('/api/v1/locations/states?q=mah')
      .set('Cookie', cookie);
    expect(filtered.status).toBe(200);
    expect(prisma.locationState.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { name: { contains: 'mah', mode: 'insensitive' } },
        orderBy: { name: 'asc' },
      })
    );

    const unfiltered = await request(app)
      .get('/api/v1/locations/states?q=')
      .set('Cookie', cookie);
    expect(unfiltered.status).toBe(200);
    expect(prisma.locationState.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: {} })
    );
  });

  it('filters districts and regions by ?q= within their parent scope', async () => {
    prisma.locationState.findFirst.mockResolvedValue({ id: ST_MH });
    prisma.locationDistrict.findMany.mockResolvedValue([]);

    await request(app)
      .get(`/api/v1/locations/states/${ST_MH}/districts?q=pun`)
      .set('Cookie', cookie);
    expect(prisma.locationDistrict.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { stateId: ST_MH, name: { contains: 'pun', mode: 'insensitive' } },
      })
    );

    prisma.locationDistrict.findFirst.mockResolvedValue({ id: DIS_PUNE });
    await request(app)
      .get(`/api/v1/locations/districts/${DIS_PUNE}/regions?q=kot`)
      .set('Cookie', cookie);
    expect(prisma.locationRegion.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { districtId: DIS_PUNE, name: { contains: 'kot', mode: 'insensitive' } },
      })
    );
  });
});

describe('Phase 7: admin region management', () => {
  it('creates a region after district and duplicate checks', async () => {
    prisma.locationDistrict.findFirst.mockResolvedValue({ id: DIS_PUNE });
    prisma.locationRegion.findFirst.mockResolvedValue(null);
    prisma.locationRegion.create.mockResolvedValue({ id: REG_BANER, name: 'Baner', districtId: DIS_PUNE });

    const response = await request(app)
      .post('/api/v1/locations/regions')
      .set('Cookie', cookie)
      .send({ districtId: DIS_PUNE, name: '  Baner  ' });

    expect(response.status).toBe(201);
    expect(response.body.data).toEqual({ id: REG_BANER, name: 'Baner', districtId: DIS_PUNE });
    expect(prisma.locationRegion.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: { districtId: DIS_PUNE, name: 'Baner' } })
    );
  });

  it('404s for an unknown district and 409s for a duplicate name', async () => {
    prisma.locationDistrict.findFirst.mockResolvedValue(null);
    const missing = await request(app)
      .post('/api/v1/locations/regions')
      .set('Cookie', cookie)
      .send({ districtId: DIS_PUNE, name: 'New Area' });
    expect(missing.status).toBe(404);

    prisma.locationDistrict.findFirst.mockResolvedValue({ id: DIS_PUNE });
    prisma.locationRegion.findFirst.mockResolvedValue({ id: REG_KOTHRUD });
    const duplicate = await request(app)
      .post('/api/v1/locations/regions')
      .set('Cookie', cookie)
      .send({ districtId: DIS_PUNE, name: 'kothrud' });
    expect(duplicate.status).toBe(409);
    expect(prisma.locationRegion.create).not.toHaveBeenCalled();
  });

  it('rejects region payloads that fail validation', async () => {
    const shortName = await request(app)
      .post('/api/v1/locations/regions')
      .set('Cookie', cookie)
      .send({ districtId: DIS_PUNE, name: 'x' });
    expect(shortName.status).toBe(400);

    const badDistrict = await request(app)
      .post('/api/v1/locations/regions')
      .set('Cookie', cookie)
      .send({ districtId: 'not-a-uuid', name: 'Valid Name' });
    expect(badDistrict.status).toBe(400);
  });

  it('blocks non-admin roles from managing regions', async () => {
    mockSession('SALES_EXECUTIVE', EXEC);
    prisma.locationDistrict.findFirst.mockResolvedValue({ id: DIS_PUNE });

    const response = await request(app)
      .post('/api/v1/locations/regions')
      .set('Cookie', cookie)
      .send({ districtId: DIS_PUNE, name: 'New Area' });

    expect(response.status).toBe(403);
    expect(prisma.locationRegion.create).not.toHaveBeenCalled();
  });

  it('renames a region with duplicate protection', async () => {
    prisma.locationRegion.findFirst
      .mockResolvedValueOnce({ id: REG_KOTHRUD, districtId: DIS_PUNE })
      .mockResolvedValueOnce(null);
    prisma.locationRegion.update.mockResolvedValue({ id: REG_KOTHRUD, name: 'Kothrud West', districtId: DIS_PUNE });

    const response = await request(app)
      .patch(`/api/v1/locations/regions/${REG_KOTHRUD}`)
      .set('Cookie', cookie)
      .send({ name: 'Kothrud West' });

    expect(response.status).toBe(200);
    expect(prisma.locationRegion.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: REG_KOTHRUD }, data: { name: 'Kothrud West' } })
    );
  });

  it('refuses to delete a region referenced by leads or projects', async () => {
    prisma.locationRegion.findFirst.mockResolvedValue({ id: REG_KOTHRUD, name: 'Kothrud' });
    prisma.leadPreferredLocation.count.mockResolvedValue(2);
    prisma.project.count.mockResolvedValue(1);

    const response = await request(app)
      .delete(`/api/v1/locations/regions/${REG_KOTHRUD}`)
      .set('Cookie', cookie);

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('REGION_IN_USE');
    expect(prisma.locationRegion.delete).not.toHaveBeenCalled();
  });

  it('deletes a region that nothing references', async () => {
    prisma.locationRegion.findFirst.mockResolvedValue({ id: REG_KOTHRUD, name: 'Kothrud' });
    prisma.leadPreferredLocation.count.mockResolvedValue(0);
    prisma.project.count.mockResolvedValue(0);

    const response = await request(app)
      .delete(`/api/v1/locations/regions/${REG_KOTHRUD}`)
      .set('Cookie', cookie);

    expect(response.status).toBe(200);
    expect(prisma.locationRegion.delete).toHaveBeenCalledWith({ where: { id: REG_KOTHRUD } });
  });
});

describe('Phase 7: lead requirement payload', () => {
  const createLeadBody = (overrides = {}) => ({
    name: 'Riya Verma',
    phone: '+919000099999',
    propertyType: 'Residential',
    configurations: ['2 BHK', '3 BHK'],
    budgetMin: 5000000,
    budgetMax: 15000000,
    preferredLocations: [{ stateId: ST_MH, districtId: DIS_PUNE, regionId: REG_KOTHRUD }],
    ...overrides,
  });

  const mockLocations = () => {
    prisma.locationState.findMany.mockResolvedValue([{ id: ST_MH, name: 'Maharashtra' }]);
    prisma.locationDistrict.findMany.mockResolvedValue([{ id: DIS_PUNE, name: 'Pune', stateId: ST_MH }]);
    prisma.locationRegion.findMany.mockResolvedValue([
      { id: REG_KOTHRUD, name: 'Kothrud', districtId: DIS_PUNE },
      { id: REG_BANER, name: 'Baner', districtId: DIS_PUNE },
    ]);
  };

  it('creates a lead with requirement fields, synced legacy budget and location rows', async () => {
    mockLocations();
    prisma.lead.create.mockResolvedValue({ id: LEAD });
    prisma.leadPreferredLocation.createMany.mockResolvedValue({ count: 1 });

    const response = await request(app)
      .post('/api/v1/leads')
      .set('Cookie', cookie)
      .send(createLeadBody());

    expect(response.status).toBe(201);
    expect(prisma.lead.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          propertyType: 'Residential',
          configurations: ['2 BHK', '3 BHK'],
          budgetMin: 5000000,
          budgetMax: 15000000,
          budget: 15000000,
          organizationId: ORG,
        }),
      })
    );
    expect(prisma.leadPreferredLocation.createMany).toHaveBeenCalledWith({
      data: [
        {
          leadId: LEAD,
          stateId: ST_MH,
          districtId: DIS_PUNE,
          regionId: REG_KOTHRUD,
        },
      ],
    });
  });

  it('rejects configurations without a property type', async () => {
    const response = await request(app)
      .post('/api/v1/leads')
      .set('Cookie', cookie)
      .send(createLeadBody({ propertyType: undefined, configurations: ['2 BHK'] }));
    expect(response.status).toBe(400);
    expect(prisma.lead.create).not.toHaveBeenCalled();
  });

  it('rejects a configuration that does not belong to the property type', async () => {
    const response = await request(app)
      .post('/api/v1/leads')
      .set('Cookie', cookie)
      .send(createLeadBody({ configurations: ['Office'] }));
    expect(response.status).toBe(400);
  });

  it('rejects budgetMin greater than budgetMax', async () => {
    const response = await request(app)
      .post('/api/v1/leads')
      .set('Cookie', cookie)
      .send(createLeadBody({ budgetMin: 9000000, budgetMax: 1000000 }));
    expect(response.status).toBe(400);
  });

  it('rejects a region selection that does not belong to the district', async () => {
    mockLocations();
    const response = await request(app)
      .post('/api/v1/leads')
      .set('Cookie', cookie)
      .send(createLeadBody({ preferredLocations: [{ stateId: ST_MH, districtId: DIS_PUNE, regionId: ST_HR }] }));
    expect(response.status).toBe(400);
    expect(prisma.lead.create).not.toHaveBeenCalled();
  });

  it('replaces preferred locations on update and leaves them alone when absent', async () => {
    mockLocations();
    prisma.lead.findFirst.mockResolvedValue({ id: LEAD, organizationId: ORG, assignedToId: null, status: 'NEW', budgetMin: null, budgetMax: null, budget: null });
    prisma.lead.update.mockResolvedValue({ id: LEAD });
    prisma.leadPreferredLocation.deleteMany.mockResolvedValue({ count: 2 });
    prisma.leadPreferredLocation.createMany.mockResolvedValue({ count: 1 });

    const replace = await request(app)
      .patch(`/api/v1/leads/${LEAD}`)
      .set('Cookie', cookie)
      .send({ preferredLocations: [{ stateId: ST_MH, districtId: null, regionId: null }] });
    expect(replace.status).toBe(200);
    expect(prisma.leadPreferredLocation.deleteMany).toHaveBeenCalledWith({ where: { leadId: LEAD } });
    expect(prisma.leadPreferredLocation.createMany).toHaveBeenCalledWith({
      data: [{ leadId: LEAD, stateId: ST_MH, districtId: null, regionId: null }],
    });

    jest.clearAllMocks();
    prisma.$transaction.mockImplementation(async (fn) => fn(prisma));
    mockSession();
    prisma.lead.findFirst.mockResolvedValue({ id: LEAD, organizationId: ORG, assignedToId: null, status: 'NEW' });
    prisma.lead.update.mockResolvedValue({ id: LEAD });

    const noLocations = await request(app)
      .patch(`/api/v1/leads/${LEAD}`)
      .set('Cookie', cookie)
      .send({ message: 'updated' });
    expect(noLocations.status).toBe(200);
    expect(prisma.leadPreferredLocation.deleteMany).not.toHaveBeenCalled();
    expect(prisma.leadPreferredLocation.createMany).not.toHaveBeenCalled();
  });
});

describe('Phase 7: property matching against the requirement', () => {
  const matchingLead = (overrides = {}) => ({
    id: LEAD,
    organizationId: ORG,
    name: 'Riya Verma',
    assignedToId: null,
    projectId: null,
    propertyId: null,
    budget: 15000000,
    budgetMin: 5000000,
    budgetMax: 15000000,
    propertyType: 'Residential',
    configurations: ['2 BHK', '3 BHK'],
    preferredLocations: [
      {
        stateId: ST_MH,
        districtId: DIS_PUNE,
        regionId: REG_KOTHRUD,
        state: { name: 'Maharashtra' },
        district: { name: 'Pune' },
        region: { name: 'Kothrud' },
      },
    ],
    ...overrides,
  });

  const unit = (id, overrides = {}) => ({
    id,
    organizationId: ORG,
    status: 'AVAILABLE',
    price: 8000000,
    tower: 'A',
    unitNumber: '101',
    configuration: '2 BHK',
    bhk: 2,
    type: null,
    areaSaleable: 950,
    project: {
      id: PROJ,
      name: 'Skyline Towers',
      address: 'Kothrud, Pune',
      locality: 'Kothrud',
      city: 'Pune',
      state: 'Maharashtra',
      projectType: 'Residential',
      stateId: ST_MH,
      districtId: DIS_PUNE,
      regionId: REG_KOTHRUD,
      locationState: { name: 'Maharashtra' },
      locationDistrict: { name: 'Pune' },
      locationRegion: { name: 'Kothrud' },
    },
    config: null,
    ...overrides,
  });

  it('pushes budget, type and availability filters into the database query', async () => {
    prisma.lead.findFirst.mockResolvedValue(matchingLead());
    prisma.property.findMany.mockResolvedValue([]);
    prisma.leadInterest.findMany.mockResolvedValue([]);

    const response = await request(app)
      .get(`/api/v1/leads/${LEAD}/matching`)
      .set('Cookie', cookie);

    expect(response.status).toBe(200);
    expect(prisma.property.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: ORG,
          status: 'AVAILABLE',
          price: { gte: 5000000, lte: 15000000 },
          OR: [
            { type: { in: ['Residential', 'Mixed_Use'] } },
            { type: null, project: { projectType: { in: ['Residential', 'Mixed_Use'] } } },
          ],
        }),
        orderBy: { price: 'asc' },
      })
    );
  });

  it('falls back to legacy budget as a maximum when the range is absent', async () => {
    prisma.lead.findFirst.mockResolvedValue(
      matchingLead({ budgetMin: null, budgetMax: null, budget: 9000000, propertyType: null, configurations: [], preferredLocations: [] })
    );
    prisma.property.findMany.mockResolvedValue([]);
    prisma.leadInterest.findMany.mockResolvedValue([]);

    await request(app)
      .get(`/api/v1/leads/${LEAD}/matching`)
      .set('Cookie', cookie);

    expect(prisma.property.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ price: { lte: 9000000 } }) })
    );
    const where = prisma.property.findMany.mock.calls[0][0].where;
    expect(where.price.gte).toBeUndefined();
    expect(where.OR).toBeUndefined();
  });

  it('filters units by configuration label or numeric BHK equivalence', async () => {
    prisma.lead.findFirst.mockResolvedValue(matchingLead());
    prisma.property.findMany.mockResolvedValue([
      unit(UNIT_A, { configuration: '2 BHK', price: 8000000 }),
      unit(UNIT_B, { configuration: '3 BHK', price: 12000000 }),
      unit(UNIT_D, { configuration: '1 BHK', bhk: 1, price: 6000000 }),
      unit(UNIT_E, { configuration: null, bhk: 3, price: 12000000 }),
    ]);
    prisma.leadInterest.findMany.mockResolvedValue([]);

    const response = await request(app)
      .get(`/api/v1/leads/${LEAD}/matching`)
      .set('Cookie', cookie);

    expect(response.status).toBe(200);
    const ids = response.body.data.map((p) => p.id);
    expect(ids).toContain(UNIT_A);
    expect(ids).toContain(UNIT_B);
    expect(ids).toContain(UNIT_E); // bhk 3 matches "3 BHK"
    expect(ids).not.toContain(UNIT_D);
  });

  it('filters by the deepest selected location level with legacy text fallback', async () => {
    // Region-level preference + project with canonical FKs matches
    prisma.lead.findFirst.mockResolvedValue(matchingLead());
    prisma.property.findMany.mockResolvedValue([
      unit(UNIT_A),
      unit(UNIT_B, {
        project: {
          ...unit(UNIT_B).project,
          regionId: null,
          locationRegion: null,
          locality: 'Hinjewadi', // legacy text does not equal Kothrud
        },
      }),
    ]);
    prisma.leadInterest.findMany.mockResolvedValue([]);

    const regionLevel = await request(app)
      .get(`/api/v1/leads/${LEAD}/matching`)
      .set('Cookie', cookie);
    const regionIds = regionLevel.body.data.map((p) => p.id);
    expect(regionIds).toContain(UNIT_A);
    expect(regionIds).not.toContain(UNIT_B);

    // District-level preference + project without district FK falls back to city text
    prisma.lead.findFirst.mockResolvedValue(
      matchingLead({
        preferredLocations: [
          {
            stateId: ST_MH,
            districtId: DIS_PUNE,
            regionId: null,
            state: { name: 'Maharashtra' },
            district: { name: 'Pune' },
            region: null,
          },
        ],
      })
    );
    prisma.property.findMany.mockResolvedValue([
      unit(UNIT_C, {
        project: { ...unit(UNIT_C).project, districtId: null, city: 'Pune' },
      }),
      unit(UNIT_D, {
        project: { ...unit(UNIT_D).project, districtId: null, city: 'Mumbai' },
      }),
    ]);

    const districtLevel = await request(app)
      .get(`/api/v1/leads/${LEAD}/matching`)
      .set('Cookie', cookie);
    const districtIds = districtLevel.body.data.map((p) => p.id);
    expect(districtIds).toContain(UNIT_C);
    expect(districtIds).not.toContain(UNIT_D);
  });

  it('applies the property-type requirement in the query and flags interested units', async () => {
    prisma.lead.findFirst.mockResolvedValue(matchingLead({ configurations: [], budgetMin: null, budgetMax: null, budget: null }));
    prisma.property.findMany.mockResolvedValue([
      unit(UNIT_A),
      unit(UNIT_C, {
        type: 'Commercial',
        project: { ...unit(UNIT_C).project, projectType: 'Commercial' },
      }),
      unit(UNIT_D, { project: { ...unit(UNIT_D).project, projectType: 'Mixed_Use' } }),
    ]);
    prisma.leadInterest.findMany.mockResolvedValue([{ propertyId: UNIT_A }]);

    const response = await request(app)
      .get(`/api/v1/leads/${LEAD}/matching`)
      .set('Cookie', cookie);

    expect(response.status).toBe(200);
    const where = prisma.property.findMany.mock.calls[0][0].where;
    expect(where.OR).toEqual([
      { type: { in: ['Residential', 'Mixed_Use'] } },
      { type: null, project: { projectType: { in: ['Residential', 'Mixed_Use'] } } },
    ]);

    const interested = response.body.data.find((p) => p.id === UNIT_A);
    const notInterested = response.body.data.find((p) => p.id === UNIT_D);
    expect(interested.isInterested).toBe(true);
    expect(notInterested.isInterested).toBe(false);
  });
});

describe('Phase 7: proposal message from authoritative data', () => {
  it('builds the WhatsApp proposal from database values', async () => {
    prisma.lead.findFirst.mockResolvedValue({ id: LEAD, name: 'Riya Verma', assignedToId: null });
    prisma.property.findMany.mockResolvedValue([
      {
        id: UNIT_A,
        price: 8000000,
        status: 'AVAILABLE',
        tower: 'A',
        unitNumber: 'A-101',
        configuration: '2 BHK',
        bhk: 2,
        areaSaleable: 950,
        config: null,
        project: {
          name: 'Skyline Towers',
          address: 'Kothrud, Pune',
          locality: null,
          city: null,
          state: null,
          locationState: { name: 'Maharashtra' },
          locationDistrict: { name: 'Pune' },
          locationRegion: { name: 'Kothrud' },
        },
      },
    ]);

    const response = await request(app)
      .post(`/api/v1/leads/${LEAD}/proposal`)
      .set('Cookie', cookie)
      .send({ propertyIds: [UNIT_A] });

    expect(response.status).toBe(200);
    const body = response.body.data.body;
    expect(body).toContain('Riya Verma');
    expect(body).toContain('Skyline Towers');
    expect(body).toContain('A-101');
    expect(body).toContain('2 BHK');
    expect(body).toContain('Kothrud, Pune, Maharashtra');
    expect(body).toContain('950 sq.ft');
    expect(body).toContain(`${String.fromCharCode(0x20b9)}80,00,000`);
    expect(response.body.data.unitCount).toBe(1);
  });

  it('404s when a selected unit no longer exists and 400s for empty selection', async () => {
    prisma.lead.findFirst.mockResolvedValue({ id: LEAD, name: 'Riya Verma', assignedToId: null });
    prisma.property.findMany.mockResolvedValue([]);

    const missing = await request(app)
      .post(`/api/v1/leads/${LEAD}/proposal`)
      .set('Cookie', cookie)
      .send({ propertyIds: [UNIT_A] });
    expect(missing.status).toBe(404);

    const empty = await request(app)
      .post(`/api/v1/leads/${LEAD}/proposal`)
      .set('Cookie', cookie)
      .send({ propertyIds: [] });
    expect(empty.status).toBe(400);
  });

  it('blocks proposal generation for a foreign lead (SALES_EXECUTIVE)', async () => {
    prisma.session.findUnique.mockResolvedValue({
      expiresAt: new Date(Date.now() + 60_000),
      user: { id: EXEC, organizationId: ORG, role: 'SALES_EXECUTIVE', status: 'ACTIVE' },
    });
    prisma.lead.findFirst.mockResolvedValue({ id: LEAD, assignedToId: 'another-user' });

    const response = await request(app)
      .post(`/api/v1/leads/${LEAD}/proposal`)
      .set('Cookie', cookie)
      .send({ propertyIds: [UNIT_A] });

    expect(response.status).toBe(403);
  });
});

describe('Phase 7: project canonical location', () => {
  const mockLocations = () => {
    prisma.locationState.findMany.mockResolvedValue([{ id: ST_MH, name: 'Maharashtra' }]);
    prisma.locationDistrict.findMany.mockResolvedValue([{ id: DIS_PUNE, name: 'Pune', stateId: ST_MH }]);
    prisma.locationRegion.findMany.mockResolvedValue([
      { id: REG_KOTHRUD, name: 'Kothrud', districtId: DIS_PUNE },
    ]);
  };

  it('stores location FKs and denormalizes names into legacy columns', async () => {
    mockLocations();
    prisma.project.create.mockResolvedValue({ id: PROJ });

    const response = await request(app)
      .post('/api/v1/projects')
      .set('Cookie', cookie)
      .send({
        name: 'Skyline Towers',
        address: 'Kothrud, Pune',
        stateId: ST_MH,
        districtId: DIS_PUNE,
        regionId: REG_KOTHRUD,
      });

    expect(response.status).toBe(201);
    expect(prisma.project.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          stateId: ST_MH,
          districtId: DIS_PUNE,
          regionId: REG_KOTHRUD,
          state: 'Maharashtra',
          city: 'Pune',
          locality: 'Kothrud',
          organizationId: ORG,
        }),
      })
    );
  });

  it('rejects a district that belongs to another state', async () => {
    prisma.locationState.findMany.mockResolvedValue([{ id: ST_MH, name: 'Maharashtra' }]);
    prisma.locationDistrict.findMany.mockResolvedValue([
      { id: 'ddddddd2-dddd-4ddd-8ddd-ddddddddddd2', name: 'Gurugram', stateId: ST_HR },
    ]);

    const response = await request(app)
      .post('/api/v1/projects')
      .set('Cookie', cookie)
      .send({
        name: 'Bad Location Project',
        address: 'x',
        stateId: ST_MH,
        districtId: 'ddddddd2-dddd-4ddd-8ddd-ddddddddddd2',
      });

    expect(response.status).toBe(400);
    expect(prisma.project.create).not.toHaveBeenCalled();
  });

  it('rejects a region without a district', async () => {
    prisma.locationState.findMany.mockResolvedValue([{ id: ST_MH, name: 'Maharashtra' }]);

    const response = await request(app)
      .post('/api/v1/projects')
      .set('Cookie', cookie)
      .send({
        name: 'Region Without District',
        address: 'x',
        stateId: ST_MH,
        regionId: REG_KOTHRUD,
      });

    expect(response.status).toBe(400);
    expect(prisma.project.create).not.toHaveBeenCalled();
  });
});
