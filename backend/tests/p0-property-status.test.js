const request = require('supertest');
const app = require('../src/app');
const prisma = require('../src/db/prisma');
const PropertyService = require('../src/services/propertyService');

jest.mock('../src/db/prisma', () => ({
  session: { findUnique: jest.fn() },
  property: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  project: { findFirst: jest.fn() },
  booking: { count: jest.fn() },
  $transaction: jest.fn(async (fn) => fn({})),
}));

const ORG = '11111111-1111-4111-8111-111111111111';
const PROP = '77777777-7777-4777-8777-777777777777';
const PROJECT = '88888888-8888-4888-8888-888888888888';
const EXEC = '55555555-5555-4555-8555-555555555555';

const mockSession = (role, userId) => {
  prisma.session.findUnique.mockResolvedValue({
    expiresAt: new Date(Date.now() + 60_000),
    user: { id: userId, organizationId: ORG, role, status: 'ACTIVE' },
  });
};

const existingProperty = (status = 'AVAILABLE') => ({
  id: PROP,
  organizationId: ORG,
  projectId: PROJECT,
  title: 'Unit 402',
  status,
  version: 1,
});

describe('P0 #5: property status update authorization and validation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.SESSION_COOKIE_NAME;
  });

  it('rejects SALES_EXECUTIVE status update with 403 FORBIDDEN (inventory:update)', async () => {
    mockSession('SALES_EXECUTIVE', EXEC);

    const response = await request(app)
      .patch(`/api/v1/properties/${PROP}`)
      .set('Cookie', 'spaceezy_session=exec-token')
      .send({ status: 'RESERVED' });

    expect(response.status).toBe(403);
    expect(response.body.code).toBe('FORBIDDEN');
    expect(prisma.property.findFirst).not.toHaveBeenCalled();
  });

  it('rejects invalid status values with 400 (not 500)', async () => {
    mockSession('ADMIN', 'admin-user');

    const response = await request(app)
      .patch(`/api/v1/properties/${PROP}`)
      .set('Cookie', 'spaceezy_session=admin-token')
      .send({ status: 'BOGUS_STATUS' });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('VALIDATION_ERROR');
    expect(prisma.property.findFirst).not.toHaveBeenCalled();
  });

  it('rejects malformed property id with 400 (not 500)', async () => {
    mockSession('ADMIN', 'admin-user');

    const response = await request(app)
      .patch('/api/v1/properties/not-a-uuid')
      .set('Cookie', 'spaceezy_session=admin-token')
      .send({ status: 'RESERVED' });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('VALIDATION_ERROR');
  });

  it('performs a valid AVAILABLE -> RESERVED transition and only persists whitelisted fields', async () => {
    mockSession('ADMIN', 'admin-user');
    prisma.property.findFirst.mockResolvedValue(existingProperty('AVAILABLE'));
    prisma.property.update.mockResolvedValue(existingProperty('RESERVED'));

    const response = await request(app)
      .patch(`/api/v1/properties/${PROP}`)
      .set('Cookie', 'spaceezy_session=admin-token')
      .send({
        status: 'RESERVED',
        projectId: '99999999-9999-4999-8999-999999999999',
        organizationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        title: 'Unit 402 Renamed',
      });

    expect(response.status).toBe(200);
    expect(prisma.property.findFirst).toHaveBeenCalledWith({
      where: { id: PROP, organizationId: ORG },
    });
    expect(prisma.property.update).toHaveBeenCalledWith({
      where: { id: PROP },
      data: {
        title: 'Unit 402 Renamed',
        status: 'RESERVED',
        version: { increment: 1 },
      },
    });
  });

  it('performs a valid AVAILABLE -> SOLD transition', async () => {
    mockSession('ADMIN', 'admin-user');
    prisma.property.findFirst.mockResolvedValue(existingProperty('AVAILABLE'));
    prisma.property.update.mockResolvedValue(existingProperty('SOLD'));

    const response = await request(app)
      .patch(`/api/v1/properties/${PROP}`)
      .set('Cookie', 'spaceezy_session=admin-token')
      .send({ status: 'SOLD' });

    expect(response.status).toBe(200);
    expect(prisma.property.update).toHaveBeenCalledWith({
      where: { id: PROP },
      data: { status: 'SOLD', version: { increment: 1 } },
    });
  });

  it('rejects SOLD -> AVAILABLE with 400 (SOLD is terminal)', async () => {
    mockSession('ADMIN', 'admin-user');
    prisma.property.findFirst.mockResolvedValue(existingProperty('SOLD'));

    const response = await request(app)
      .patch(`/api/v1/properties/${PROP}`)
      .set('Cookie', 'spaceezy_session=admin-token')
      .send({ status: 'AVAILABLE' });

    expect(response.status).toBe(400);
    expect(response.body.message).toMatch(/Invalid status transition/);
    expect(prisma.property.update).not.toHaveBeenCalled();
  });

  it('returns 404 when the property is outside the organization scope', async () => {
    mockSession('ADMIN', 'admin-user');
    prisma.property.findFirst.mockResolvedValue(null);

    const response = await request(app)
      .patch(`/api/v1/properties/${PROP}`)
      .set('Cookie', 'spaceezy_session=admin-token')
      .send({ status: 'RESERVED' });

    expect(response.status).toBe(404);
    expect(response.body.code).toBe('NOT_FOUND');
    expect(prisma.property.update).not.toHaveBeenCalled();
  });

  it('rejects invalid status in list filter with 400 instead of a Prisma 500', async () => {
    mockSession('ADMIN', 'admin-user');

    const response = await request(app)
      .get('/api/v1/properties?status=BOGUS_STATUS')
      .set('Cookie', 'spaceezy_session=admin-token');

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('VALIDATION_ERROR');
  });
});

describe('P0 #5: property detail fetch regression (project.projectType)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.SESSION_COOKIE_NAME;
  });

  it('GET /api/v1/properties/:id queries the Project.projectType field (not the nonexistent Project.type)', async () => {
    mockSession('ADMIN', 'admin-user');
    prisma.property.findFirst.mockResolvedValue({
      ...existingProperty('AVAILABLE'),
      project: { id: PROJECT, name: 'Skyline', projectType: 'Residential' },
    });

    const response = await request(app)
      .get(`/api/v1/properties/${PROP}`)
      .set('Cookie', 'spaceezy_session=admin-token');

    expect(response.status).toBe(200);
    expect(response.body.data.project.projectType).toBe('Residential');
    expect(prisma.property.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          project: { select: { id: true, name: true, projectType: true } },
        }),
      })
    );
  });

  it('GET /api/v1/properties/:id returns 404 for out-of-org property', async () => {
    mockSession('ADMIN', 'admin-user');
    prisma.property.findFirst.mockResolvedValue(null);

    const response = await request(app)
      .get(`/api/v1/properties/${PROP}`)
      .set('Cookie', 'spaceezy_session=admin-token');

    expect(response.status).toBe(404);
    expect(response.body.code).toBe('NOT_FOUND');
  });

  it('GET /api/v1/properties/:id rejects malformed id with 400 (not 500)', async () => {
    mockSession('ADMIN', 'admin-user');

    const response = await request(app)
      .get('/api/v1/properties/not-a-uuid')
      .set('Cookie', 'spaceezy_session=admin-token');

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('VALIDATION_ERROR');
  });
});

describe('P0 #5: service-level mass-assignment and transition defense (bypasses route validation)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('strips projectId, organizationId, version and other non-whitelisted fields', async () => {
    prisma.property.findFirst.mockResolvedValue(existingProperty('AVAILABLE'));
    prisma.property.update.mockResolvedValue({});

    await PropertyService.updateProperty(
      PROP,
      {
        status: 'RESERVED',
        title: 'Renamed',
        projectId: '99999999-9999-4999-8999-999999999999',
        organizationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        version: 99,
        createdById: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      },
      ORG
    );

    expect(prisma.property.update).toHaveBeenCalledWith({
      where: { id: PROP },
      data: {
        title: 'Renamed',
        status: 'RESERVED',
        version: { increment: 1 },
      },
    });
  });

  it('rejects an unknown status value with 400 even when validation middleware is bypassed', async () => {
    prisma.property.findFirst.mockResolvedValue(existingProperty('AVAILABLE'));

    await expect(
      PropertyService.updateProperty(PROP, { status: 'BOGUS_STATUS' }, ORG)
    ).rejects.toMatchObject({ statusCode: 400, code: 'BAD_REQUEST' });
    expect(prisma.property.update).not.toHaveBeenCalled();
  });

  it('rejects any transition out of SOLD with 400', async () => {
    prisma.property.findFirst.mockResolvedValue(existingProperty('SOLD'));

    await expect(
      PropertyService.updateProperty(PROP, { status: 'RESERVED' }, ORG)
    ).rejects.toMatchObject({ statusCode: 400, code: 'BAD_REQUEST' });
    expect(prisma.property.update).not.toHaveBeenCalled();
  });

  it('allows RESERVED -> AVAILABLE (hold release) when no active bookings exist', async () => {
    prisma.property.findFirst.mockResolvedValue(existingProperty('RESERVED'));
    prisma.property.update.mockResolvedValue({});
    prisma.booking.count.mockResolvedValue(0);

    await PropertyService.updateProperty(PROP, { status: 'AVAILABLE' }, ORG);

    expect(prisma.property.update).toHaveBeenCalledWith({
      where: { id: PROP },
      data: { status: 'AVAILABLE', version: { increment: 1 } },
    });
  });

  it('blocks RESERVED -> AVAILABLE with 409 when active bookings exist', async () => {
    prisma.property.findFirst.mockResolvedValue(existingProperty('RESERVED'));
    prisma.booking.count.mockResolvedValue(2);

    await expect(
      PropertyService.updateProperty(PROP, { status: 'AVAILABLE' }, ORG)
    ).rejects.toMatchObject({ statusCode: 409, code: 'CONFLICT' });
    expect(prisma.property.update).not.toHaveBeenCalled();
  });

  it('returns 404 for out-of-scope property', async () => {
    prisma.property.findFirst.mockResolvedValue(null);

    await expect(
      PropertyService.updateProperty(PROP, { status: 'RESERVED' }, ORG)
    ).rejects.toMatchObject({ statusCode: 404, code: 'NOT_FOUND' });
  });
});
