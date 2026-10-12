const request = require('supertest');
const app = require('../src/app');
const prisma = require('../src/db/prisma');

jest.mock('../src/db/prisma', () => {
  const mock = {
    session: { findUnique: jest.fn() },
    organization: { findFirst: jest.fn() },
    project: {
      findFirst: jest.fn(), findMany: jest.fn(), count: jest.fn(),
      create: jest.fn(), update: jest.fn(),
    },
    configuration: {
      findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn(),
      update: jest.fn(), updateMany: jest.fn(), count: jest.fn(), delete: jest.fn(),
    },
    property: {
      findFirst: jest.fn(), findMany: jest.fn(), count: jest.fn(),
      create: jest.fn(), update: jest.fn(), groupBy: jest.fn(),
    },
    lead: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    leadActivity: { create: jest.fn() },
    booking: {
      findFirst: jest.fn(), findMany: jest.fn(), count: jest.fn(),
      create: jest.fn(), update: jest.fn(), updateMany: jest.fn(), groupBy: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  mock.$transaction.mockImplementation(async (fn) => fn(mock));
  return mock;
});

const ORG = '11111111-1111-4111-8111-111111111111';
const PROJECT = '88888888-8888-4888-8888-888888888888';
const PROJECT_OTHER = '99999999-9999-4999-8999-999999999999';
const CONFIG = '22222222-2222-4222-8222-222222222222';
const CONFIG_OTHER = '33333333-3333-4333-8333-333333333333';
const PROP = '77777777-7777-4777-8777-777777777777';
const LEAD = 'aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const EXEC = '55555555-5555-4555-8555-555555555555';

const mockSession = (role, userId) => {
  prisma.session.findUnique.mockResolvedValue({
    expiresAt: new Date(Date.now() + 60_000),
    user: { id: userId, organizationId: ORG, role, status: 'ACTIVE' },
  });
};

const admin = () => mockSession('ADMIN', 'admin-user');
const exec = () => mockSession('SALES_EXECUTIVE', EXEC);

const project = (overrides = {}) => ({
  id: PROJECT,
  organizationId: ORG,
  name: 'Aurora Heights',
  ...overrides,
});

const configuration = (overrides = {}) => ({
  id: CONFIG,
  organizationId: ORG,
  projectId: PROJECT,
  name: '1 BHK',
  bhk: 1,
  areaSaleable: 600,
  basePrice: 3000000,
  active: true,
  totalUnits: null,
  availableUnits: null,
  inventoryVersion: 0,
  areaMin: null,
  areaMax: null,
  priceMin: null,
  priceMax: null,
  ...overrides,
});

const bulkConfiguration = (overrides = {}) => configuration({
  totalUnits: 18,
  availableUnits: 15,
  ...overrides,
});

const property = (overrides = {}) => ({
  id: PROP,
  organizationId: ORG,
  projectId: PROJECT,
  title: 'A-101',
  unitNumber: 'A-101',
  status: 'AVAILABLE',
  configurationId: null,
  configuration: '2 BHK',
  price: 4500000,
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.SESSION_COOKIE_NAME;
  prisma.organization.findFirst.mockResolvedValue({ id: ORG });
});

describe('Phase 8: Bulk configuration creation and validation', () => {
  it('creates a bulk configuration and defaults available to total (201)', async () => {
    admin();
    prisma.project.findFirst.mockResolvedValue(project());
    prisma.configuration.findFirst.mockResolvedValue(null);
    prisma.configuration.create.mockResolvedValue(bulkConfiguration({ availableUnits: 18 }));

    const response = await request(app)
      .post(`/api/v1/projects/${PROJECT}/configurations`)
      .set('Cookie', 'spaceezy_session=admin-token')
      .send({ name: '1 BHK', bhk: 1, areaSaleable: 600, basePrice: 3000000, totalUnits: 18 });

    expect(response.status).toBe(201);
    expect(prisma.configuration.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          projectId: PROJECT, organizationId: ORG, name: '1 BHK',
          basePrice: 3000000, totalUnits: 18, availableUnits: 18,
        }),
      })
    );
  });

  it('creates a unit-tracked configuration when counters are omitted (backward compatible)', async () => {
    admin();
    prisma.project.findFirst.mockResolvedValue(project());
    prisma.configuration.findFirst.mockResolvedValue(null);
    prisma.configuration.create.mockResolvedValue(configuration());

    const response = await request(app)
      .post(`/api/v1/projects/${PROJECT}/configurations`)
      .set('Cookie', 'spaceezy_session=admin-token')
      .send({ name: '2 BHK', bhk: 2 });

    expect(response.status).toBe(201);
    expect(prisma.configuration.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ totalUnits: null, availableUnits: null }),
      })
    );
  });

  it('rejects available > total, available-without-total, and negative counts (400)', async () => {
    admin();
    prisma.project.findFirst.mockResolvedValue(project());
    prisma.configuration.findFirst.mockResolvedValue(null);

    const over = await request(app)
      .post(`/api/v1/projects/${PROJECT}/configurations`)
      .set('Cookie', 'spaceezy_session=admin-token')
      .send({ name: '1 BHK', totalUnits: 18, availableUnits: 20 });
    expect(over.status).toBe(400);

    const orphan = await request(app)
      .post(`/api/v1/projects/${PROJECT}/configurations`)
      .set('Cookie', 'spaceezy_session=admin-token')
      .send({ name: '1 BHK', availableUnits: 5 });
    expect(orphan.status).toBe(400);

    const negative = await request(app)
      .post(`/api/v1/projects/${PROJECT}/configurations`)
      .set('Cookie', 'spaceezy_session=admin-token')
      .send({ name: '1 BHK', totalUnits: -1 });
    expect(negative.status).toBe(400);

    expect(prisma.configuration.create).not.toHaveBeenCalled();
  });

  it('rejects inverted area and price ranges (400)', async () => {
    admin();
    prisma.project.findFirst.mockResolvedValue(project());
    prisma.configuration.findFirst.mockResolvedValue(null);

    const area = await request(app)
      .post(`/api/v1/projects/${PROJECT}/configurations`)
      .set('Cookie', 'spaceezy_session=admin-token')
      .send({ name: '1 BHK', areaMin: 700, areaMax: 600 });
    expect(area.status).toBe(400);

    const price = await request(app)
      .post(`/api/v1/projects/${PROJECT}/configurations`)
      .set('Cookie', 'spaceezy_session=admin-token')
      .send({ name: '1 BHK', priceMin: 5000000, priceMax: 4000000 });
    expect(price.status).toBe(400);

    expect(prisma.configuration.create).not.toHaveBeenCalled();
  });
});

describe('Phase 8: Base update never touches inventory counters', () => {
  it('rejects counter fields on the generic PATCH with USE_INVENTORY_ENDPOINT (400)', async () => {
    admin();
    prisma.configuration.findFirst.mockResolvedValue(configuration({ _count: { properties: 0 } }));

    const response = await request(app)
      .patch(`/api/v1/projects/${PROJECT}/configurations/${CONFIG}`)
      .set('Cookie', 'spaceezy_session=admin-token')
      .send({ totalUnits: 18 });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('USE_INVENTORY_ENDPOINT');
    expect(prisma.configuration.update).not.toHaveBeenCalled();
  });

  it('allows unrelated edits without modifying counters', async () => {
    admin();
    prisma.configuration.findFirst
      .mockResolvedValueOnce(configuration({ _count: { properties: 0 } }))
      .mockResolvedValueOnce(null);
    prisma.configuration.update.mockResolvedValue(configuration({ name: '1 BHK Plus', active: true }));

    const response = await request(app)
      .patch(`/api/v1/projects/${PROJECT}/configurations/${CONFIG}`)
      .set('Cookie', 'spaceezy_session=admin-token')
      .send({ name: '1 BHK Plus', active: true });

    expect(response.status).toBe(200);
    expect(prisma.configuration.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.not.objectContaining({ totalUnits: expect.anything(), availableUnits: expect.anything() }),
      })
    );
  });
});

describe('Phase 8: Inventory endpoint with optimistic concurrency', () => {
  it('switches a unit-free configuration to bulk mode and bumps the version (200)', async () => {
    admin();
    prisma.configuration.findFirst
      .mockResolvedValueOnce(configuration({ _count: { properties: 0 }, inventoryVersion: 3 }))
      .mockResolvedValueOnce(bulkConfiguration({ inventoryVersion: 4 }));
    prisma.property.count.mockResolvedValue(0);
    prisma.configuration.updateMany.mockResolvedValue({ count: 1 });

    const response = await request(app)
      .patch(`/api/v1/projects/${PROJECT}/configurations/${CONFIG}/inventory`)
      .set('Cookie', 'spaceezy_session=admin-token')
      .send({ totalUnits: 18, availableUnits: 15, expectedInventoryVersion: 3 });

    expect(response.status).toBe(200);
    expect(response.body.data.inventoryVersion).toBe(4);
    expect(prisma.configuration.updateMany).toHaveBeenCalledWith({
      where: { id: CONFIG, projectId: PROJECT, organizationId: ORG, inventoryVersion: 3 },
      data: { totalUnits: 18, availableUnits: 15, inventoryVersion: { increment: 1 } },
    });
  });

  it('blocks switching to bulk mode while linked units exist (409 MIXED_MODE)', async () => {
    admin();
    prisma.configuration.findFirst.mockResolvedValue(configuration({ _count: { properties: 4 } }));

    const response = await request(app)
      .patch(`/api/v1/projects/${PROJECT}/configurations/${CONFIG}/inventory`)
      .set('Cookie', 'spaceezy_session=admin-token')
      .send({ totalUnits: 18, availableUnits: 18, expectedInventoryVersion: 0 });

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('MIXED_MODE');
    expect(prisma.property.count).not.toHaveBeenCalled();
    expect(prisma.configuration.updateMany).not.toHaveBeenCalled();
  });

  it('blocks switching when stray same-label unit rows exist (409 MIXED_MODE)', async () => {
    admin();
    prisma.configuration.findFirst.mockResolvedValue(configuration({ _count: { properties: 0 } }));
    prisma.property.count.mockResolvedValue(2);

    const response = await request(app)
      .patch(`/api/v1/projects/${PROJECT}/configurations/${CONFIG}/inventory`)
      .set('Cookie', 'spaceezy_session=admin-token')
      .send({ totalUnits: 18, availableUnits: 18, expectedInventoryVersion: 0 });

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('MIXED_MODE');
    expect(prisma.configuration.updateMany).not.toHaveBeenCalled();
  });

  it('returns 409 INVENTORY_CONFLICT on a stale version instead of overwriting', async () => {
    admin();
    prisma.configuration.findFirst
      .mockResolvedValueOnce(configuration({ _count: { properties: 0 }, inventoryVersion: 7 }))
      .mockResolvedValueOnce(bulkConfiguration({ inventoryVersion: 8 }));
    prisma.property.count.mockResolvedValue(0);
    prisma.configuration.updateMany.mockResolvedValue({ count: 0 });

    const response = await request(app)
      .patch(`/api/v1/projects/${PROJECT}/configurations/${CONFIG}/inventory`)
      .set('Cookie', 'spaceezy_session=admin-token')
      .send({ totalUnits: 10, availableUnits: 10, expectedInventoryVersion: 7 });

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('INVENTORY_CONFLICT');
  });

  it('rejects one-sided and inverted counter updates (400)', async () => {
    admin();

    const onesided = await request(app)
      .patch(`/api/v1/projects/${PROJECT}/configurations/${CONFIG}/inventory`)
      .set('Cookie', 'spaceezy_session=admin-token')
      .send({ totalUnits: 10, availableUnits: null, expectedInventoryVersion: 0 });
    expect(onesided.status).toBe(400);

    const inverted = await request(app)
      .patch(`/api/v1/projects/${PROJECT}/configurations/${CONFIG}/inventory`)
      .set('Cookie', 'spaceezy_session=admin-token')
      .send({ totalUnits: 10, availableUnits: 12, expectedInventoryVersion: 0 });
    expect(inverted.status).toBe(400);

    expect(prisma.configuration.updateMany).not.toHaveBeenCalled();
  });

  it('clears both counters back to unit-tracked mode (200)', async () => {
    admin();
    prisma.configuration.findFirst
      .mockResolvedValueOnce(bulkConfiguration({ _count: { properties: 0 } }))
      .mockResolvedValueOnce(configuration({ inventoryVersion: 5 }));
    prisma.configuration.updateMany.mockResolvedValue({ count: 1 });

    const response = await request(app)
      .patch(`/api/v1/projects/${PROJECT}/configurations/${CONFIG}/inventory`)
      .set('Cookie', 'spaceezy_session=admin-token')
      .send({ totalUnits: null, availableUnits: null, expectedInventoryVersion: 4 });

    expect(response.status).toBe(200);
    expect(prisma.configuration.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ totalUnits: null, availableUnits: null }) })
    );
  });

  it('forbids inventory adjustment for SALES_EXECUTIVE (403)', async () => {
    exec();

    const response = await request(app)
      .patch(`/api/v1/projects/${PROJECT}/configurations/${CONFIG}/inventory`)
      .set('Cookie', 'spaceezy_session=exec-token')
      .send({ totalUnits: 10, availableUnits: 10, expectedInventoryVersion: 0 });

    expect(response.status).toBe(403);
    expect(prisma.configuration.updateMany).not.toHaveBeenCalled();
  });
});

describe('Phase 8: Mixed-mode prevention on unit writes', () => {
  it('rejects creating a unit under a bulk-mode configuration (409)', async () => {
    admin();
    prisma.project.findFirst.mockResolvedValue(project());
    prisma.configuration.findFirst.mockResolvedValue(bulkConfiguration());

    const response = await request(app)
      .post('/api/v1/properties')
      .set('Cookie', 'spaceezy_session=admin-token')
      .send({
        projectId: PROJECT, title: 'A-101', unitNumber: 'A-101',
        configurationId: CONFIG, price: 3000000,
      });

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('BULK_MODE_CONFIGURATION');
    expect(prisma.property.create).not.toHaveBeenCalled();
  });

  it('rejects reassigning a unit onto a bulk-mode configuration (409)', async () => {
    admin();
    prisma.property.findFirst.mockResolvedValue(property());
    prisma.configuration.findFirst.mockResolvedValue(bulkConfiguration());

    const response = await request(app)
      .patch(`/api/v1/properties/${PROP}`)
      .set('Cookie', 'spaceezy_session=admin-token')
      .send({ configurationId: CONFIG });

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('BULK_MODE_CONFIGURATION');
    expect(prisma.property.update).not.toHaveBeenCalled();
  });

  it('fails bulk-import rows that target a bulk-mode configuration', async () => {
    admin();
    prisma.project.findFirst.mockResolvedValue(project());
    prisma.configuration.findMany.mockResolvedValue([
      { id: CONFIG, name: '1 BHK', bhk: 1, areaSaleable: 600, basePrice: 3000000, totalUnits: 18, availableUnits: 18 },
    ]);
    prisma.property.findMany.mockResolvedValue([]);

    const response = await request(app)
      .post('/api/v1/properties/bulk-import')
      .set('Cookie', 'spaceezy_session=admin-token')
      .send({ projectId: PROJECT, dryRun: true, rows: [{ unitNumber: 'A-101', configuration: '1 BHK', price: 3000000 }] });

    expect(response.status).toBe(200);
    expect(response.body.data.failed).toHaveLength(1);
    expect(response.body.data.failed[0].errors.join(' ')).toMatch(/bulk inventory/);
  });
});

describe('Phase 8: Project rollups combine unit and bulk inventory', () => {
  it('merges bulk counters into project detail inventory without double-counting', async () => {
    admin();
    const unitConfig = configuration({ id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', name: '2 BHK' });
    prisma.project.findFirst.mockResolvedValue(project({
      configurations: [bulkConfiguration(), unitConfig],
      properties: [
        property({ id: 'p1', configurationId: unitConfig.id, configuration: '2 BHK', status: 'AVAILABLE' }),
        property({ id: 'p2', configurationId: unitConfig.id, configuration: '2 BHK', status: 'SOLD' }),
      ],
    }));
    prisma.property.groupBy.mockImplementation(({ by }) => {
      if (by.includes('configuration')) {
        return [{ configuration: '2 BHK', _count: { configuration: 2 }, _min: { price: 4500000 }, _max: { price: 4500000 } }];
      }
      return [
        { status: 'AVAILABLE', _count: { status: 1 } },
        { status: 'SOLD', _count: { status: 1 } },
      ];
    });

    const response = await request(app)
      .get(`/api/v1/projects/${PROJECT}`)
      .set('Cookie', 'spaceezy_session=admin-token');

    expect(response.status).toBe(200);
    // 2 unit rows + 18 bulk = 20 total; 1 available unit + 15 bulk = 16
    expect(response.body.data.inventory).toMatchObject({ total: 20, available: 16, reserved: 0, sold: 1 });
    const summary = response.body.data.configurationSummary;
    const bulk = summary.find((s) => s.mode === 'bulk');
    expect(bulk).toMatchObject({ configuration: '1 BHK', count: 18, availableUnits: 15 });
    const units = summary.find((s) => s.mode === 'units');
    expect(units).toMatchObject({ configuration: '2 BHK', count: 2, availableUnits: 1 });
  });

  it('folds bulk counters into the project list inventory', async () => {
    admin();
    prisma.project.findMany.mockResolvedValue([project({ _count: { properties: 1, leads: 0, bookings: 0 } })]);
    prisma.project.count.mockResolvedValue(1);
    prisma.property.groupBy.mockResolvedValue([{ status: 'AVAILABLE', _count: { status: 1 } }]);
    prisma.configuration.findMany.mockResolvedValue([{ projectId: PROJECT, totalUnits: 18, availableUnits: 15 }]);

    const response = await request(app)
      .get('/api/v1/projects')
      .set('Cookie', 'spaceezy_session=admin-token');

    expect(response.status).toBe(200);
    expect(response.body.data.projects[0].inventory).toMatchObject({ total: 19, available: 16 });
  });
});

describe('Phase 8: Public DTOs expose only safe bulk aggregates', () => {
  const published = () => ({
    id: PROJECT,
    organizationId: ORG,
    name: 'Aurora Heights',
    publicSlug: 'aurora-heights-abc123',
    isPublic: true,
    status: 'UNDER_CONSTRUCTION',
    projectType: 'Residential',
    address: 'Link Road',
    locality: 'Andheri West',
    city: 'Mumbai',
    state: 'Maharashtra',
    developer: 'Aurora Builders',
    description: 'Premium residences',
    shortDescription: null,
    images: [],
    amenities: [],
    connectivity: null,
    startingPrice: null,
    maximumPrice: null,
    pricePerSqFt: null,
    totalUnits: null,
    availableUnits: null,
    reraRegistered: false,
    reraNumber: null,
    reraAuthority: null,
    launchDate: null,
    expectedCompletionDate: null,
    possessionDate: null,
    pincode: null,
    landmark: null,
    mapUrl: null,
    latitude: null,
    longitude: null,
    locationState: null,
    locationDistrict: null,
    locationRegion: null,
    configurations: [bulkConfiguration({ areaMin: 550, areaMax: 650, priceMin: 2800000, priceMax: 3200000 })],
  });

  it('serves bulk aggregates on the project DTO with no internal fields', async () => {
    prisma.project.findFirst.mockResolvedValue(published());
    prisma.property.groupBy.mockResolvedValue([]);
    prisma.configuration.findMany.mockResolvedValue([
      { projectId: PROJECT, totalUnits: 18, availableUnits: 15, priceMin: 2800000, priceMax: 3200000 },
    ]);
    prisma.property.findMany.mockResolvedValue([]);

    const response = await request(app).get('/api/v1/public/projects/aurora-heights-abc123');

    expect(response.status).toBe(200);
    const dto = response.body.data;
    expect(dto.availability).toMatchObject({ totalUnits: 18, availableUnits: 15 });
    expect(dto.configurations).toHaveLength(1);
    const entry = dto.configurations[0];
    expect(entry).toMatchObject({
      name: '1 BHK', totalUnits: 18, availableUnits: 15,
      areaMin: 550, areaMax: 650, priceMin: 2800000, priceMax: 3200000,
    });
    expect(Object.keys(entry).sort()).toEqual([
      'areaMax', 'areaMin', 'areaSaleable', 'availableUnits', 'basePrice',
      'bhk', 'name', 'priceMax', 'priceMin', 'totalUnits',
    ]);
  });
});

describe('Phase 8: Enquiry attribution to configurations', () => {
  it('resolves a configuration label to configurationId on public enquiries (201)', async () => {
    prisma.lead.findFirst.mockResolvedValue(null);
    prisma.project.findFirst.mockResolvedValue({ id: PROJECT });
    prisma.configuration.findFirst.mockResolvedValue({ id: CONFIG });
    prisma.lead.create.mockResolvedValue({ id: LEAD });
    prisma.leadActivity.create.mockResolvedValue({});

    const response = await request(app)
      .post('/api/v1/public/enquiries')
      .send({ name: 'Buyer', phone: '9876543210', projectSlug: 'aurora-heights-abc123', configuration: '1 BHK' });

    expect(response.status).toBe(201);
    expect(prisma.lead.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ configurationId: CONFIG }) })
    );
  });

  it('drops unknown configuration labels instead of failing (201, null ref)', async () => {
    prisma.lead.findFirst.mockResolvedValue(null);
    prisma.project.findFirst.mockResolvedValue({ id: PROJECT });
    prisma.configuration.findFirst.mockResolvedValue(null);
    prisma.lead.create.mockResolvedValue({ id: LEAD });
    prisma.leadActivity.create.mockResolvedValue({});

    const response = await request(app)
      .post('/api/v1/public/enquiries')
      .send({ name: 'Buyer', phone: '9876543211', projectSlug: 'aurora-heights-abc123', configuration: 'No Such BHK' });

    expect(response.status).toBe(201);
    expect(prisma.lead.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ configurationId: null }) })
    );
  });

  it('attributes the visitor-selected unit type as a fallback (201)', async () => {
    prisma.lead.findFirst.mockResolvedValue(null);
    prisma.project.findFirst.mockResolvedValue({ id: PROJECT });
    prisma.configuration.findFirst.mockResolvedValue({ id: CONFIG });
    prisma.lead.create.mockResolvedValue({ id: LEAD });
    prisma.leadActivity.create.mockResolvedValue({});

    const response = await request(app)
      .post('/api/v1/public/enquiries')
      .send({ name: 'Buyer', phone: '9876543212', projectSlug: 'aurora-heights-abc123', interestedUnitType: '1 BHK' });

    expect(response.status).toBe(201);
    expect(prisma.lead.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ configurationId: CONFIG }) })
    );
  });

  it('rejects cross-project configuration references on CRM leads (400)', async () => {
    admin();
    prisma.configuration.findFirst.mockResolvedValue({ id: CONFIG_OTHER, projectId: PROJECT_OTHER });

    const response = await request(app)
      .post('/api/v1/leads')
      .set('Cookie', 'spaceezy_session=admin-token')
      .send({ name: 'Lead', phone: '9876543213', projectId: PROJECT, configurationId: CONFIG_OTHER });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('CROSS_PROJECT_REFERENCE');
    expect(prisma.lead.create).not.toHaveBeenCalled();
  });

  it('rejects a property paired with a different configuration (400)', async () => {
    admin();
    prisma.property.findFirst.mockResolvedValue(
      property({ configurationId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' })
    );

    const response = await request(app)
      .post('/api/v1/leads')
      .set('Cookie', 'spaceezy_session=admin-token')
      .send({ name: 'Lead', phone: '9876543214', projectId: PROJECT, propertyId: PROP, configurationId: CONFIG });

    expect(response.status).toBe(400);
    expect(prisma.lead.create).not.toHaveBeenCalled();
  });

  it('inherits the configuration from a linked property (201)', async () => {
    admin();
    const unitConfig = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    prisma.property.findFirst.mockResolvedValue(property({ configurationId: unitConfig }));
    prisma.configuration.findFirst.mockResolvedValue({ id: unitConfig, projectId: PROJECT });
    prisma.project.findFirst.mockResolvedValue(project());
    prisma.lead.create.mockResolvedValue({ id: LEAD });

    const response = await request(app)
      .post('/api/v1/leads')
      .set('Cookie', 'spaceezy_session=admin-token')
      .send({ name: 'Lead', phone: '9876543215', projectId: PROJECT, propertyId: PROP });

    expect(response.status).toBe(201);
    expect(prisma.lead.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ configurationId: unitConfig }) })
    );
  });
});
