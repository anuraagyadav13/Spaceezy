const request = require('supertest');
const app = require('../src/app');
const prisma = require('../src/db/prisma');
const PropertyService = require('../src/services/propertyService');
const ProjectService = require('../src/services/projectService');

const txPropertyCreate = jest.fn();

jest.mock('../src/db/prisma', () => ({
  session: { findUnique: jest.fn() },
  project: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  configuration: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  property: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    groupBy: jest.fn(),
  },
  booking: { count: jest.fn() },
  $transaction: jest.fn(),
}));

const ORG = '11111111-1111-4111-8111-111111111111';
const PROJECT = '88888888-8888-4888-8888-888888888888';
const PROJECT_OTHER = '99999999-9999-4999-8999-999999999999';
const CONFIG = '22222222-2222-4222-8222-222222222222';
const CONFIG_OTHER = '33333333-3333-4333-8333-333333333333';
const PROP = '77777777-7777-4777-8777-777777777777';
const EXEC = '55555555-5555-4555-8555-555555555555';
const MANAGER = '66666666-6666-4666-8666-666666666666';

const mockSession = (role, userId) => {
  prisma.session.findUnique.mockResolvedValue({
    expiresAt: new Date(Date.now() + 60_000),
    user: { id: userId, organizationId: ORG, role, status: 'ACTIVE' },
  });
};

const project = (overrides = {}) => ({
  id: PROJECT,
  organizationId: ORG,
  name: 'Skyline Heights',
  ...overrides,
});

const configuration = (overrides = {}) => ({
  id: CONFIG,
  organizationId: ORG,
  projectId: PROJECT,
  name: '2 BHK',
  bhk: 2,
  areaSaleable: 950,
  basePrice: 4500000,
  active: true,
  ...overrides,
});

const property = (overrides = {}) => ({
  id: PROP,
  organizationId: ORG,
  projectId: PROJECT,
  title: 'A-101',
  unitNumber: 'A-101',
  status: 'AVAILABLE',
  version: 1,
  ...overrides,
});

const admin = () => mockSession('ADMIN', 'admin-user');
const exec = () => mockSession('SALES_EXECUTIVE', EXEC);
const manager = () => mockSession('SALES_MANAGER', MANAGER);

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.SESSION_COOKIE_NAME;
});

describe('Phase 1: Configuration CRUD', () => {
  it('creates a configuration under a project (ADMIN, 201)', async () => {
    admin();
    prisma.project.findFirst.mockResolvedValue(project());
    prisma.configuration.findFirst.mockResolvedValue(null);
    prisma.configuration.create.mockResolvedValue(configuration());

    const response = await request(app)
      .post(`/api/v1/projects/${PROJECT}/configurations`)
      .set('Cookie', 'spaceezy_session=admin-token')
      .send({ name: '2 BHK', bhk: 2, areaSaleable: 950, basePrice: 4500000 });

    expect(response.status).toBe(201);
    expect(response.body.data.name).toBe('2 BHK');
    expect(prisma.configuration.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ projectId: PROJECT, organizationId: ORG, name: '2 BHK' }),
      })
    );
  });

  it('rejects duplicate configuration names with 409', async () => {
    admin();
    prisma.project.findFirst.mockResolvedValue(project());
    prisma.configuration.findFirst.mockResolvedValue(configuration());

    const response = await request(app)
      .post(`/api/v1/projects/${PROJECT}/configurations`)
      .set('Cookie', 'spaceezy_session=admin-token')
      .send({ name: '2 BHK' });

    expect(response.status).toBe(409);
    expect(prisma.configuration.create).not.toHaveBeenCalled();
  });

  it('returns 404 for configuration creation under a project outside the org', async () => {
    admin();
    prisma.project.findFirst.mockResolvedValue(null);

    const response = await request(app)
      .post(`/api/v1/projects/${PROJECT}/configurations`)
      .set('Cookie', 'spaceezy_session=admin-token')
      .send({ name: '2 BHK' });

    expect(response.status).toBe(404);
    expect(prisma.configuration.create).not.toHaveBeenCalled();
  });

  it('lists configurations for a project', async () => {
    admin();
    prisma.project.findFirst.mockResolvedValue(project());
    prisma.configuration.findMany.mockResolvedValue([configuration()]);

    const response = await request(app)
      .get(`/api/v1/projects/${PROJECT}/configurations`)
      .set('Cookie', 'spaceezy_session=admin-token');

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
  });

  it('blocks deleting a configuration that units reference (409) and deletes free ones', async () => {
    admin();

    prisma.configuration.findFirst.mockResolvedValue(configuration({ _count: { properties: 3 } }));
    const inUse = await request(app)
      .delete(`/api/v1/projects/${PROJECT}/configurations/${CONFIG}`)
      .set('Cookie', 'spaceezy_session=admin-token');
    expect(inUse.status).toBe(409);
    expect(prisma.configuration.delete).not.toHaveBeenCalled();

    prisma.configuration.findFirst.mockResolvedValue(configuration({ _count: { properties: 0 } }));
    const freed = await request(app)
      .delete(`/api/v1/projects/${PROJECT}/configurations/${CONFIG}`)
      .set('Cookie', 'spaceezy_session=admin-token');
    expect(freed.status).toBe(200);
    expect(prisma.configuration.delete).toHaveBeenCalledWith({ where: { id: CONFIG } });
  });

  it('SALES_EXECUTIVE can view but not create configurations (200 / 403)', async () => {
    exec();
    prisma.project.findFirst.mockResolvedValue(project());
    prisma.configuration.findMany.mockResolvedValue([]);

    const create = await request(app)
      .post(`/api/v1/projects/${PROJECT}/configurations`)
      .set('Cookie', 'spaceezy_session=exec-token')
      .send({ name: '2 BHK' });
    expect(create.status).toBe(403);

    const remove = await request(app)
      .delete(`/api/v1/projects/${PROJECT}/configurations/${CONFIG}`)
      .set('Cookie', 'spaceezy_session=exec-token');
    expect(remove.status).toBe(403);

    const list = await request(app)
      .get(`/api/v1/projects/${PROJECT}/configurations`)
      .set('Cookie', 'spaceezy_session=exec-token');
    expect(list.status).toBe(200);
  });

  it('SALES_MANAGER can view but not create configurations', async () => {
    manager();

    const create = await request(app)
      .post(`/api/v1/projects/${PROJECT}/configurations`)
      .set('Cookie', 'spaceezy_session=manager-token')
      .send({ name: '2 BHK' });
    expect(create.status).toBe(403);
    expect(prisma.configuration.create).not.toHaveBeenCalled();
  });

  it('rejects malformed project/config UUIDs with 400', async () => {
    admin();

    const badProject = await request(app)
      .get('/api/v1/projects/not-a-uuid/configurations')
      .set('Cookie', 'spaceezy_session=admin-token');
    expect(badProject.status).toBe(400);

    const badConfig = await request(app)
      .delete(`/api/v1/projects/${PROJECT}/configurations/not-a-uuid`)
      .set('Cookie', 'spaceezy_session=admin-token');
    expect(badConfig.status).toBe(400);
  });
});

describe('Phase 1: Unit (Property) CRUD and relations', () => {
  it('creates a unit forced to AVAILABLE and syncs fields from configuration', async () => {
    admin();
    prisma.project.findFirst.mockResolvedValue(project());
    prisma.configuration.findFirst.mockResolvedValue(configuration());
    prisma.property.findFirst.mockResolvedValue(null);
    prisma.property.create.mockResolvedValue(property({ configurationId: CONFIG }));

    const response = await request(app)
      .post('/api/v1/properties')
      .set('Cookie', 'spaceezy_session=admin-token')
      .send({
        projectId: PROJECT,
        title: 'A-101',
        unitNumber: 'A-101',
        configurationId: CONFIG,
        tower: 'A',
        floor: 4,
        status: 'AVAILABLE',
      });

    expect(response.status).toBe(201);
    const data = prisma.property.create.mock.calls[0][0].data;
    expect(data.status).toBe('AVAILABLE');
    expect(data.configuration).toBe('2 BHK');
    expect(data.bhk).toBe(2);
    expect(data.areaSaleable).toBe(950);
    expect(data.price).toBe(4500000); // base price fallback
    expect(data.tower).toBe('A');
    expect(data.organizationId).toBe(ORG);
  });

  it('rejects unit creation with a non-AVAILABLE status (400)', async () => {
    admin();

    const response = await request(app)
      .post('/api/v1/properties')
      .set('Cookie', 'spaceezy_session=admin-token')
      .send({ projectId: PROJECT, title: 'A-102', unitNumber: 'A-102', price: 1000000, status: 'RESERVED' });

    expect(response.status).toBe(400);
    expect(prisma.property.create).not.toHaveBeenCalled();
  });

  it('rejects duplicate unit numbers within a project with 409', async () => {
    admin();
    prisma.project.findFirst.mockResolvedValue(project());
    prisma.property.findFirst.mockResolvedValue(property());

    const response = await request(app)
      .post('/api/v1/properties')
      .set('Cookie', 'spaceezy_session=admin-token')
      .send({ projectId: PROJECT, title: 'A-101', unitNumber: 'A-101', price: 1000000 });

    expect(response.status).toBe(409);
    expect(prisma.property.create).not.toHaveBeenCalled();
  });

  it('rejects a configuration from a different project with 400', async () => {
    admin();
    prisma.project.findFirst.mockResolvedValue(project());
    prisma.configuration.findFirst.mockResolvedValue(null);

    const response = await request(app)
      .post('/api/v1/properties')
      .set('Cookie', 'spaceezy_session=admin-token')
      .send({
        projectId: PROJECT,
        title: 'A-103',
        unitNumber: 'A-103',
        configurationId: CONFIG_OTHER,
        price: 1000000,
      });

    expect(response.status).toBe(400);
    expect(response.body.message).toMatch(/does not belong/);
    expect(prisma.property.create).not.toHaveBeenCalled();
  });

  it('rejects unit creation without price and without a priced configuration (400)', async () => {
    admin();
    prisma.project.findFirst.mockResolvedValue(project());

    const response = await request(app)
      .post('/api/v1/properties')
      .set('Cookie', 'spaceezy_session=admin-token')
      .send({ projectId: PROJECT, title: 'A-104', unitNumber: 'A-104' });

    expect(response.status).toBe(400);
    expect(prisma.property.create).not.toHaveBeenCalled();
  });

  it('updates unit fields (tower, purpose, price) via whitelisted PATCH', async () => {
    admin();
    prisma.property.findFirst
      .mockResolvedValueOnce(property())
      .mockResolvedValue(null);
    prisma.property.update.mockResolvedValue(property());

    const response = await request(app)
      .patch(`/api/v1/properties/${PROP}`)
      .set('Cookie', 'spaceezy_session=admin-token')
      .send({ tower: 'B', purpose: 'Sale', price: 5100000 });

    expect(response.status).toBe(200);
    expect(prisma.property.update).toHaveBeenCalledWith({
      where: { id: PROP },
      data: { tower: 'B', purpose: 'Sale', price: 5100000, version: { increment: 1 } },
    });
  });

  it('ignores projectId on update (units cannot move across projects)', async () => {
    admin();
    prisma.property.findFirst
      .mockResolvedValueOnce(property())
      .mockResolvedValue(null);
    prisma.property.update.mockResolvedValue(property());

    const response = await request(app)
      .patch(`/api/v1/properties/${PROP}`)
      .set('Cookie', 'spaceezy_session=admin-token')
      .send({ title: 'Renamed', projectId: PROJECT_OTHER });

    expect(response.status).toBe(200);
    const data = prisma.property.update.mock.calls[0][0].data;
    expect(data).not.toHaveProperty('projectId');
    expect(data.title).toBe('Renamed');
  });

  it('rejects configuration reassignment to a foreign project (400)', async () => {
    admin();
    prisma.property.findFirst.mockResolvedValue(property());
    prisma.configuration.findFirst.mockResolvedValue(null);

    const response = await request(app)
      .patch(`/api/v1/properties/${PROP}`)
      .set('Cookie', 'spaceezy_session=admin-token')
      .send({ configurationId: CONFIG_OTHER });

    expect(response.status).toBe(400);
    expect(prisma.property.update).not.toHaveBeenCalled();
  });

  it('deletes an available unit with no bookings/interests', async () => {
    admin();
    prisma.property.findFirst.mockResolvedValue(
      property({ _count: { bookings: 0, interestedBy: 0, quotations: 0 } })
    );
    prisma.property.delete.mockResolvedValue({});

    const response = await request(app)
      .delete(`/api/v1/properties/${PROP}`)
      .set('Cookie', 'spaceezy_session=admin-token');

    expect(response.status).toBe(200);
    expect(prisma.property.delete).toHaveBeenCalledWith({ where: { id: PROP } });
  });

  it('blocks deleting a unit that has bookings (409)', async () => {
    admin();
    prisma.property.findFirst.mockResolvedValue(
      property({ _count: { bookings: 1, interestedBy: 0, quotations: 0 } })
    );

    const response = await request(app)
      .delete(`/api/v1/properties/${PROP}`)
      .set('Cookie', 'spaceezy_session=admin-token');

    expect(response.status).toBe(409);
    expect(prisma.property.delete).not.toHaveBeenCalled();
  });
});

describe('Phase 1: status transitions with booking guard', () => {
  it('blocks RESERVED -> AVAILABLE when active bookings exist (409)', async () => {
    prisma.property.findFirst.mockResolvedValue(property({ status: 'RESERVED' }));
    prisma.booking.count.mockResolvedValue(1);

    await expect(
      PropertyService.updateProperty(PROP, { status: 'AVAILABLE' }, ORG)
    ).rejects.toMatchObject({ statusCode: 409, code: 'CONFLICT' });
    expect(prisma.property.update).not.toHaveBeenCalled();
  });

  it('allows RESERVED -> SOLD even with active bookings (close-out)', async () => {
    prisma.property.findFirst.mockResolvedValue(property({ status: 'RESERVED' }));
    prisma.property.update.mockResolvedValue(property({ status: 'SOLD' }));

    await PropertyService.updateProperty(PROP, { status: 'SOLD' }, ORG);
    expect(prisma.property.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'SOLD' }) })
    );
  });
});

describe('Phase 1: Bulk import', () => {
  const validRow = (unitNumber, overrides = {}) => ({
    unitNumber,
    configuration: '2 BHK',
    price: 4500000,
    tower: 'A',
    floor: 3,
    ...overrides,
  });

  it('imports valid rows in one transaction (ADMIN, 201)', async () => {
    admin();
    prisma.project.findFirst.mockResolvedValue(project());
    prisma.configuration.findMany.mockResolvedValue([configuration()]);
    prisma.property.findMany.mockResolvedValue([]);
    prisma.$transaction.mockImplementation(async (fn) =>
      fn({ property: { create: txPropertyCreate } })
    );

    const response = await request(app)
      .post('/api/v1/properties/bulk-import')
      .set('Cookie', 'spaceezy_session=admin-token')
      .send({ projectId: PROJECT, rows: [validRow('B-101'), validRow('B-102', { price: 4700000 })] });

    expect(response.status).toBe(201);
    expect(response.body.data.created).toBe(2);
    expect(response.body.data.failed).toHaveLength(0);
    expect(txPropertyCreate).toHaveBeenCalledTimes(2);
    expect(txPropertyCreate.mock.calls[0][0].data.status).toBe('AVAILABLE');
    expect(txPropertyCreate.mock.calls[0][0].data.configurationId).toBe(CONFIG);
  });

  it('reports per-row failures for duplicates, unknown configurations and missing prices', async () => {
    admin();
    prisma.project.findFirst.mockResolvedValue(project());
    prisma.configuration.findMany.mockResolvedValue([configuration()]);
    prisma.property.findMany.mockResolvedValue([]);

    const response = await request(app)
      .post('/api/v1/properties/bulk-import')
      .set('Cookie', 'spaceezy_session=admin-token')
      .send({
        projectId: PROJECT,
        rows: [
          { unitNumber: 'B-201' }, // missing price
          validRow('B-201'), // duplicate of row 1 (even though row 1 failed)
          validRow('B-202', { configuration: '4 BHK Penthouse' }), // unknown config
          { unitNumber: 'B-203' }, // missing price
        ],
      });

    expect(response.status).toBe(201);
    expect(response.body.data.created).toBe(0);
    expect(response.body.data.failed).toHaveLength(4);
    expect(response.body.data.failed.map((f) => f.row)).toEqual([1, 2, 3, 4]);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('detects duplicates against existing project units', async () => {
    admin();
    prisma.project.findFirst.mockResolvedValue(project());
    prisma.configuration.findMany.mockResolvedValue([configuration()]);
    prisma.property.findMany.mockResolvedValue([{ unitNumber: 'B-301' }]);

    const response = await request(app)
      .post('/api/v1/properties/bulk-import')
      .set('Cookie', 'spaceezy_session=admin-token')
      .send({ projectId: PROJECT, rows: [validRow('B-301')] });

    expect(response.body.data.failed[0].errors[0]).toMatch(/already exists/);
  });

  it('dryRun validates without writing (200, no transaction)', async () => {
    admin();
    prisma.project.findFirst.mockResolvedValue(project());
    prisma.configuration.findMany.mockResolvedValue([configuration()]);
    prisma.property.findMany.mockResolvedValue([]);

    const response = await request(app)
      .post('/api/v1/properties/bulk-import')
      .set('Cookie', 'spaceezy_session=admin-token')
      .send({ projectId: PROJECT, dryRun: true, rows: [validRow('B-401')] });

    expect(response.status).toBe(200);
    expect(response.body.data.dryRun).toBe(true);
    expect(response.body.data.created).toBe(0);
    expect(response.body.data.failed).toHaveLength(0);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('SALES_EXECUTIVE cannot import (403)', async () => {
    exec();

    const response = await request(app)
      .post('/api/v1/properties/bulk-import')
      .set('Cookie', 'spaceezy_session=exec-token')
      .send({ projectId: PROJECT, rows: [validRow('B-501')] });

    expect(response.status).toBe(403);
    expect(prisma.property.create).not.toHaveBeenCalled();
  });

  it('rejects empty rows and out-of-scope project (400 / 404)', async () => {
    admin();

    const empty = await request(app)
      .post('/api/v1/properties/bulk-import')
      .set('Cookie', 'spaceezy_session=admin-token')
      .send({ projectId: PROJECT, rows: [] });
    expect(empty.status).toBe(400);

    prisma.project.findFirst.mockResolvedValue(null);
    const noProject = await request(app)
      .post('/api/v1/properties/bulk-import')
      .set('Cookie', 'spaceezy_session=admin-token')
      .send({ projectId: PROJECT, rows: [validRow('B-601')] });
    expect(noProject.status).toBe(404);
  });
});

describe('Phase 1: Project mass-assignment defense', () => {
  it('service-level create strips unknown fields (assignedTo, image)', async () => {
    prisma.project.create.mockResolvedValue({});

    await ProjectService.createProject(
      {
        name: 'Park View',
        assignedTo: 'user-1',
        image: 'cover.png',
        owner: 'someone',
        type: 'Commercial',
      },
      ORG
    );

    const data = prisma.project.create.mock.calls[0][0].data;
    expect(data).not.toHaveProperty('assignedTo');
    expect(data).not.toHaveProperty('image');
    expect(data).not.toHaveProperty('owner');
    expect(data.projectType).toBe('Commercial');
    expect(data.address).toBe('Park View'); // default address from name
  });

  it('ADMIN project create ignores unknown fields at the route level too', async () => {
    admin();
    prisma.project.create.mockResolvedValue({ id: PROJECT, name: 'Park View' });

    const response = await request(app)
      .post('/api/v1/projects')
      .set('Cookie', 'spaceezy_session=admin-token')
      .send({ name: 'Park View', assignedTo: 'user-1', image: 'cover.png' });

    expect(response.status).toBe(201);
    const data = prisma.project.create.mock.calls[0][0].data;
    expect(data).not.toHaveProperty('assignedTo');
    expect(data).not.toHaveProperty('image');
  });
});

describe('Phase 1: Project RBAC', () => {
  it('SALES_EXECUTIVE can list but not create projects (200 / 403)', async () => {
    exec();
    prisma.project.findMany.mockResolvedValue([]);
    prisma.project.count.mockResolvedValue(0);

    const list = await request(app)
      .get('/api/v1/projects')
      .set('Cookie', 'spaceezy_session=exec-token');
    expect(list.status).toBe(200);

    const create = await request(app)
      .post('/api/v1/projects')
      .set('Cookie', 'spaceezy_session=exec-token')
      .send({ name: 'Nope Tower' });
    expect(create.status).toBe(403);
    expect(prisma.project.create).not.toHaveBeenCalled();
  });

  it('SALES_MANAGER can view but not create projects', async () => {
    manager();

    const create = await request(app)
      .post('/api/v1/projects')
      .set('Cookie', 'spaceezy_session=manager-token')
      .send({ name: 'Nope Tower' });
    expect(create.status).toBe(403);
  });

  it('rejects invalid project list status filter with 400 (not Prisma 500)', async () => {
    admin();

    const response = await request(app)
      .get('/api/v1/projects?status=NOT_A_STATUS')
      .set('Cookie', 'spaceezy_session=admin-token');
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('VALIDATION_ERROR');
  });
});

describe('Phase 1: Inventory list filters and pricing permissions', () => {
  it('supports tower/floor/configurationId filters on the unit list', async () => {
    admin();
    prisma.property.findMany.mockResolvedValue([]);
    prisma.property.count.mockResolvedValue(0);

    const response = await request(app)
      .get(`/api/v1/properties?tower=A&floor=4&configurationId=${CONFIG}&status=AVAILABLE`)
      .set('Cookie', 'spaceezy_session=admin-token');

    expect(response.status).toBe(200);
    expect(prisma.property.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tower: { equals: 'A', mode: 'insensitive' },
          floor: 4,
          configurationId: CONFIG,
          status: 'AVAILABLE',
        }),
      })
    );
  });

  it('SALES_EXECUTIVE can view inventory but not change price (200 / 403)', async () => {
    exec();
    prisma.property.findMany.mockResolvedValue([]);
    prisma.property.count.mockResolvedValue(0);

    const list = await request(app)
      .get('/api/v1/properties')
      .set('Cookie', 'spaceezy_session=exec-token');
    expect(list.status).toBe(200);

    const priceChange = await request(app)
      .patch(`/api/v1/properties/${PROP}`)
      .set('Cookie', 'spaceezy_session=exec-token')
      .send({ price: 9999999 });
    expect(priceChange.status).toBe(403);
    expect(prisma.property.update).not.toHaveBeenCalled();
  });
});
