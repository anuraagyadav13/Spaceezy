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
      create: jest.fn(), update: jest.fn(), updateMany: jest.fn(), groupBy: jest.fn(),
    },
    booking: {
      findFirst: jest.fn(), findMany: jest.fn(), count: jest.fn(),
      create: jest.fn(), update: jest.fn(), updateMany: jest.fn(), groupBy: jest.fn(),
    },
    customer: { findFirst: jest.fn(), create: jest.fn() },
    lead: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    leadActivity: { create: jest.fn() },
    quotation: { findFirst: jest.fn() },
    $transaction: jest.fn(),
  };
  mock.$transaction.mockImplementation(async (fn) => fn(mock));
  return mock;
});

const ORG = '11111111-1111-4111-8111-111111111111';
const PROJECT = '88888888-8888-4888-8888-888888888888';
const CONFIG = '22222222-2222-4222-8222-222222222222';
const BOOKING = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const LEAD = 'aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const mockSession = (role, userId) => {
  prisma.session.findUnique.mockResolvedValue({
    expiresAt: new Date(Date.now() + 60_000),
    user: { id: userId, organizationId: ORG, role, status: 'ACTIVE' },
  });
};

const admin = () => mockSession('ADMIN', 'admin-user');

const bulkConfiguration = (overrides = {}) => ({
  id: CONFIG,
  organizationId: ORG,
  projectId: PROJECT,
  name: '1 BHK',
  bhk: 1,
  areaSaleable: 600,
  basePrice: 3000000,
  active: true,
  totalUnits: 18,
  availableUnits: 5,
  inventoryVersion: 2,
  areaMin: null,
  areaMax: null,
  priceMin: null,
  priceMax: null,
  ...overrides,
});

const booking = (overrides = {}) => ({
  id: BOOKING,
  organizationId: ORG,
  customerId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  projectId: PROJECT,
  propertyId: null,
  configurationId: null,
  amount: 3000000,
  paymentStatus: 'PENDING',
  leadId: null,
  quotationId: null,
  assignedToId: 'admin-user',
  ...overrides,
});

const lead = (overrides = {}) => ({
  id: LEAD,
  organizationId: ORG,
  name: 'Buyer',
  phone: '9876543210',
  status: 'NEW',
  projectId: PROJECT,
  propertyId: null,
  configurationId: null,
  assignedToId: null,
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.SESSION_COOKIE_NAME;
  prisma.organization.findFirst.mockResolvedValue({ id: ORG });
});

describe('Phase 9: Bulk booking creation', () => {
  it('books one unit atomically, bumps the version, and records the config (201)', async () => {
    admin();
    prisma.configuration.findFirst.mockResolvedValue(bulkConfiguration());
    prisma.customer.findFirst.mockResolvedValue(null);
    prisma.customer.create.mockResolvedValue({ id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' });
    prisma.configuration.updateMany.mockResolvedValue({ count: 1 });
    prisma.booking.create.mockResolvedValue(booking({ configurationId: CONFIG }));

    const response = await request(app)
      .post('/api/v1/bookings')
      .set('Cookie', 'spaceezy_session=admin-token')
      .send({ configurationId: CONFIG, amount: 3000000, customer: { name: 'Buyer', phone: '9876543210' } });

    expect(response.status).toBe(201);
    expect(prisma.configuration.updateMany).toHaveBeenCalledWith({
      where: { id: CONFIG, organizationId: ORG, availableUnits: { gt: 0 } },
      data: { availableUnits: { decrement: 1 }, inventoryVersion: { increment: 1 } },
    });
    expect(prisma.booking.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ configurationId: CONFIG, propertyId: null, projectId: PROJECT, amount: 3000000 }),
      })
    );
    expect(prisma.property.updateMany).not.toHaveBeenCalled();
  });

  it('returns 409 BULK_SOLD_OUT when the last unit is gone (no overwrite)', async () => {
    admin();
    prisma.configuration.findFirst.mockResolvedValue(bulkConfiguration({ availableUnits: 0 }));
    prisma.customer.findFirst.mockResolvedValue(null);
    prisma.customer.create.mockResolvedValue({ id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' });
    prisma.configuration.updateMany.mockResolvedValue({ count: 0 });

    const response = await request(app)
      .post('/api/v1/bookings')
      .set('Cookie', 'spaceezy_session=admin-token')
      .send({ configurationId: CONFIG, amount: 3000000, customer: { name: 'Buyer', phone: '9876543210' } });

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('BULK_SOLD_OUT');
    expect(prisma.booking.create).not.toHaveBeenCalled();
  });

  it('rejects booking a unit-tracked configuration (400)', async () => {
    admin();
    prisma.configuration.findFirst.mockResolvedValue(bulkConfiguration({ totalUnits: null, availableUnits: null }));

    const response = await request(app)
      .post('/api/v1/bookings')
      .set('Cookie', 'spaceezy_session=admin-token')
      .send({ configurationId: CONFIG, amount: 3000000, customer: { name: 'Buyer', phone: '9876543210' } });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('UNIT_TRACKED_CONFIGURATION');
    expect(prisma.configuration.updateMany).not.toHaveBeenCalled();
    expect(prisma.booking.create).not.toHaveBeenCalled();
  });

  it('rejects unknown configurations (404)', async () => {
    admin();
    prisma.configuration.findFirst.mockResolvedValue(null);

    const response = await request(app)
      .post('/api/v1/bookings')
      .set('Cookie', 'spaceezy_session=admin-token')
      .send({ configurationId: CONFIG, amount: 3000000, customer: { name: 'Buyer', phone: '9876543210' } });

    expect(response.status).toBe(404);
    expect(prisma.booking.create).not.toHaveBeenCalled();
  });

  it('rejects ambiguous and incomplete bulk payloads (400)', async () => {
    admin();

    const both = await request(app)
      .post('/api/v1/bookings')
      .set('Cookie', 'spaceezy_session=admin-token')
      .send({ propertyId: '77777777-7777-4777-8777-777777777777', configurationId: CONFIG, amount: 3000000, customer: { name: 'B', phone: '1' } });
    expect(both.status).toBe(400);

    const neither = await request(app)
      .post('/api/v1/bookings')
      .set('Cookie', 'spaceezy_session=admin-token')
      .send({ amount: 3000000, customer: { name: 'B', phone: '1' } });
    expect(neither.status).toBe(400);

    const noAmount = await request(app)
      .post('/api/v1/bookings')
      .set('Cookie', 'spaceezy_session=admin-token')
      .send({ configurationId: CONFIG, customer: { name: 'B', phone: '1' } });
    expect(noAmount.status).toBe(400);

    const quoted = await request(app)
      .post('/api/v1/bookings')
      .set('Cookie', 'spaceezy_session=admin-token')
      .send({ configurationId: CONFIG, amount: 3000000, leadId: LEAD, quotationId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', customer: { name: 'B', phone: '1' } });
    expect(quoted.status).toBe(400);

    expect(prisma.booking.create).not.toHaveBeenCalled();
  });

  it('rejects a lead from another project (400 CROSS_PROJECT_REFERENCE)', async () => {
    admin();
    prisma.configuration.findFirst.mockResolvedValue(bulkConfiguration());
    prisma.lead.findFirst.mockResolvedValue(lead({ projectId: '99999999-9999-4999-8999-999999999999' }));

    const response = await request(app)
      .post('/api/v1/bookings')
      .set('Cookie', 'spaceezy_session=admin-token')
      .send({ configurationId: CONFIG, amount: 3000000, leadId: LEAD });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('CROSS_PROJECT_REFERENCE');
    expect(prisma.booking.create).not.toHaveBeenCalled();
  });

  it('converts a lead into a bulk booking with write-back (201)', async () => {
    admin();
    prisma.lead.findFirst.mockResolvedValue(lead());
    prisma.configuration.findFirst.mockResolvedValue(bulkConfiguration());
    prisma.booking.findFirst.mockResolvedValue(null);
    prisma.customer.findFirst.mockResolvedValue(null);
    prisma.customer.create.mockResolvedValue({ id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' });
    prisma.configuration.updateMany.mockResolvedValue({ count: 1 });
    prisma.booking.create.mockResolvedValue(booking({ configurationId: CONFIG, leadId: LEAD }));
    prisma.lead.update.mockResolvedValue(lead({ status: 'BOOKED', configurationId: CONFIG }));
    prisma.leadActivity.create.mockResolvedValue({});

    const response = await request(app)
      .post(`/api/v1/leads/${LEAD}/bookings`)
      .set('Cookie', 'spaceezy_session=admin-token')
      .send({ configurationId: CONFIG, amount: 3000000 });

    expect(response.status).toBe(201);
    expect(prisma.booking.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ configurationId: CONFIG, leadId: LEAD }) })
    );
    expect(prisma.lead.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ configurationId: CONFIG }) })
    );
    expect(prisma.lead.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'BOOKED' }) })
    );
  });
});

describe('Phase 9: Bulk booking cancellation and completion', () => {
  it('returns one unit to bulk availability on cancel (200)', async () => {
    admin();
    prisma.booking.findFirst.mockResolvedValue(booking({ configurationId: CONFIG, paymentStatus: 'PENDING' }));
    prisma.booking.updateMany.mockResolvedValue({ count: 1 });
    prisma.booking.count.mockResolvedValue(0);
    prisma.configuration.findFirst.mockResolvedValue(bulkConfiguration({ totalUnits: 10, availableUnits: 4 }));
    prisma.configuration.updateMany.mockResolvedValue({ count: 1 });

    const response = await request(app)
      .patch(`/api/v1/bookings/${BOOKING}/cancel`)
      .set('Cookie', 'spaceezy_session=admin-token');

    expect(response.status).toBe(200);
    expect(prisma.configuration.updateMany).toHaveBeenCalledWith({
      where: { id: CONFIG, organizationId: ORG },
      data: { availableUnits: { increment: 1 }, inventoryVersion: { increment: 1 } },
    });
    expect(prisma.property.updateMany).not.toHaveBeenCalled();
  });

  it('never increments past the total on cancel (200, no counter write)', async () => {
    admin();
    prisma.booking.findFirst.mockResolvedValue(booking({ configurationId: CONFIG, paymentStatus: 'PENDING' }));
    prisma.booking.updateMany.mockResolvedValue({ count: 1 });
    prisma.booking.count.mockResolvedValue(0);
    prisma.configuration.findFirst.mockResolvedValue(bulkConfiguration({ totalUnits: 10, availableUnits: 10 }));

    const response = await request(app)
      .patch(`/api/v1/bookings/${BOOKING}/cancel`)
      .set('Cookie', 'spaceezy_session=admin-token');

    expect(response.status).toBe(200);
    expect(prisma.configuration.updateMany).not.toHaveBeenCalled();
  });

  it('skips the counter write when the config left bulk mode (200)', async () => {
    admin();
    prisma.booking.findFirst.mockResolvedValue(booking({ configurationId: CONFIG, paymentStatus: 'PENDING' }));
    prisma.booking.updateMany.mockResolvedValue({ count: 1 });
    prisma.booking.count.mockResolvedValue(0);
    prisma.configuration.findFirst.mockResolvedValue(bulkConfiguration({ totalUnits: null, availableUnits: null }));

    const response = await request(app)
      .patch(`/api/v1/bookings/${BOOKING}/cancel`)
      .set('Cookie', 'spaceezy_session=admin-token');

    expect(response.status).toBe(200);
    expect(prisma.configuration.updateMany).not.toHaveBeenCalled();
  });

  it('completes a bulk booking without touching counters (200)', async () => {
    admin();
    prisma.booking.findFirst.mockResolvedValue(booking({ configurationId: CONFIG, paymentStatus: 'PENDING' }));
    prisma.booking.updateMany.mockResolvedValue({ count: 1 });

    const response = await request(app)
      .patch(`/api/v1/bookings/${BOOKING}/complete`)
      .set('Cookie', 'spaceezy_session=admin-token');

    expect(response.status).toBe(200);
    expect(prisma.configuration.updateMany).not.toHaveBeenCalled();
    expect(prisma.property.updateMany).not.toHaveBeenCalled();
  });
});

describe('Phase 9: Configuration delete protection', () => {
  it('blocks deleting a configuration with booking history (409)', async () => {
    admin();
    prisma.configuration.findFirst.mockResolvedValue(bulkConfiguration({ _count: { properties: 0 } }));
    prisma.booking.count.mockResolvedValue(2);

    const response = await request(app)
      .delete(`/api/v1/projects/${PROJECT}/configurations/${CONFIG}`)
      .set('Cookie', 'spaceezy_session=admin-token');

    expect(response.status).toBe(409);
    expect(prisma.configuration.delete).not.toHaveBeenCalled();
  });

  it('deletes a bulk configuration with no bookings (200)', async () => {
    admin();
    prisma.configuration.findFirst.mockResolvedValue(bulkConfiguration({ _count: { properties: 0 } }));
    prisma.booking.count.mockResolvedValue(0);
    prisma.configuration.delete.mockResolvedValue(bulkConfiguration());

    const response = await request(app)
      .delete(`/api/v1/projects/${PROJECT}/configurations/${CONFIG}`)
      .set('Cookie', 'spaceezy_session=admin-token');

    expect(response.status).toBe(200);
    expect(prisma.configuration.delete).toHaveBeenCalledWith({ where: { id: CONFIG } });
  });
});

describe('Phase 9: Rollups derive bulk reserved/sold from bookings', () => {
  const bookedGroups = () => [
    { projectId: PROJECT, configurationId: CONFIG, paymentStatus: 'PENDING', _count: { _all: 1 } },
    { projectId: PROJECT, configurationId: CONFIG, paymentStatus: 'COMPLETED', _count: { _all: 1 } },
  ];

  it('merges booking-derived reserved/sold into project detail', async () => {
    admin();
    prisma.project.findFirst.mockResolvedValue({
      id: PROJECT,
      organizationId: ORG,
      name: 'Aurora Heights',
      configurations: [bulkConfiguration()],
      properties: [],
      leads: [],
      bookings: [],
      quotations: [],
    });
    prisma.property.groupBy.mockResolvedValue([]);
    prisma.booking.groupBy.mockResolvedValue(bookedGroups());

    const response = await request(app)
      .get(`/api/v1/projects/${PROJECT}`)
      .set('Cookie', 'spaceezy_session=admin-token');

    expect(response.status).toBe(200);
    expect(response.body.data.inventory).toMatchObject({ total: 18, available: 5, reserved: 1, sold: 1 });
    const bulk = response.body.data.configurationSummary.find((s) => s.mode === 'bulk');
    expect(bulk).toMatchObject({ reservedUnits: 1, soldUnits: 1 });
  });

  it('merges booking-derived reserved/sold into the project list', async () => {
    admin();
    prisma.project.findMany.mockResolvedValue([{ id: PROJECT, organizationId: ORG, name: 'Aurora Heights', _count: { properties: 0, leads: 0, bookings: 0 } }]);
    prisma.project.count.mockResolvedValue(1);
    prisma.property.groupBy.mockResolvedValue([]);
    prisma.configuration.findMany.mockResolvedValue([{ projectId: PROJECT, totalUnits: 18, availableUnits: 5 }]);
    prisma.booking.groupBy.mockResolvedValue(bookedGroups());

    const response = await request(app)
      .get('/api/v1/projects')
      .set('Cookie', 'spaceezy_session=admin-token');

    expect(response.status).toBe(200);
    expect(response.body.data.projects[0].inventory).toMatchObject({ total: 18, available: 5, reserved: 1, sold: 1 });
  });

  it('merges booking-derived reserved/sold into public availability', async () => {
    prisma.project.findFirst.mockResolvedValue({
      id: PROJECT,
      name: 'Aurora Heights',
      publicSlug: 'aurora-heights-abc123',
      isPublic: true,
      status: 'UNDER_CONSTRUCTION',
      projectType: 'Residential',
      address: 'Link Road',
      locality: 'Andheri West',
      city: 'Mumbai',
      state: 'Maharashtra',
      developer: null,
      description: null,
      shortDescription: null,
      images: [],
      amenities: [],
      connectivity: null,
      startingPrice: null,
      maximumPrice: null,
      pricePerSqFt: null,
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
      configurations: [bulkConfiguration()],
    });
    prisma.property.groupBy.mockResolvedValue([]);
    prisma.configuration.findMany.mockResolvedValue([
      { projectId: PROJECT, totalUnits: 18, availableUnits: 5, priceMin: null, priceMax: null },
    ]);
    prisma.property.findMany.mockResolvedValue([]);
    prisma.booking.groupBy.mockResolvedValue(bookedGroups());

    const response = await request(app).get('/api/v1/public/projects/aurora-heights-abc123');

    expect(response.status).toBe(200);
    expect(response.body.data.availability).toMatchObject({ totalUnits: 18, availableUnits: 5, reservedUnits: 1, soldUnits: 1 });
  });
});
