const request = require('supertest');
const app = require('../src/app');
const prisma = require('../src/db/prisma');

jest.mock('../src/db/prisma', () => ({
  session: { findUnique: jest.fn() },
  user: {
    findFirst: jest.fn(), findMany: jest.fn(), count: jest.fn(),
    create: jest.fn(), update: jest.fn(), delete: jest.fn(),
  },
  $transaction: jest.fn(),
}));

const ORG = '11111111-1111-4111-8111-111111111111';
const EXEC = '55555555-5555-4555-8555-555555555555';
const TARGET = '99999999-9999-4999-8999-999999999999';

const mockSession = (role, userId) => {
  prisma.session.findUnique.mockResolvedValue({
    expiresAt: new Date(Date.now() + 60_000),
    user: { id: userId, organizationId: ORG, role, status: 'ACTIVE' },
  });
};

const admin = () => mockSession('ADMIN', 'admin-user');
const exec = () => mockSession('SALES_EXECUTIVE', EXEC);

const user = (overrides = {}) => ({
  id: TARGET,
  organizationId: ORG,
  name: 'Emp One',
  email: 'emp1@example.com',
  role: 'SALES_EXECUTIVE',
  status: 'ACTIVE',
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.SESSION_COOKIE_NAME;
});

describe('Phase 10: Admin employee management (two-role model)', () => {
  it('ADMIN creates a sales executive (201, password hashed, never echoed)', async () => {
    admin();
    prisma.user.findFirst.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue(user());

    const response = await request(app)
      .post('/api/v1/users')
      .set('Cookie', 'spaceezy_session=admin-token')
      .send({ name: 'Emp One', email: 'emp1@example.com', phone: '9000000001', password: 'Secret1234', role: 'SALES_EXECUTIVE' });

    expect(response.status).toBe(201);
    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organizationId: ORG, name: 'Emp One', email: 'emp1@example.com', role: 'SALES_EXECUTIVE',
        }),
      })
    );
    const created = prisma.user.create.mock.calls[0][0].data;
    expect(created.passwordHash).toMatch(/^\$argon2/);
    expect(created).not.toHaveProperty('password');
    expect(response.body.data).not.toHaveProperty('passwordHash');
  });

  it('ADMIN creates another admin (201)', async () => {
    admin();
    prisma.user.findFirst.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue(user({ role: 'ADMIN' }));

    const response = await request(app)
      .post('/api/v1/users')
      .set('Cookie', 'spaceezy_session=admin-token')
      .send({ name: 'Owner Two', email: 'owner2@example.com', password: 'Secret1234', role: 'ADMIN' });

    expect(response.status).toBe(201);
  });

  it('rejects non-two-role assignments on create and update (400)', async () => {
    admin();

    const created = await request(app)
      .post('/api/v1/users')
      .set('Cookie', 'spaceezy_session=admin-token')
      .send({ name: 'X', email: 'x@example.com', password: 'Secret1234', role: 'SALES_MANAGER' });
    expect(created.status).toBe(400);

    prisma.user.findFirst.mockResolvedValue(user());
    const updated = await request(app)
      .patch(`/api/v1/users/${TARGET}`)
      .set('Cookie', 'spaceezy_session=admin-token')
      .send({ role: 'CHANNEL_PARTNER' });
    expect(updated.status).toBe(400);

    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('rejects duplicate emails within the organization (400)', async () => {
    admin();
    prisma.user.findFirst.mockResolvedValue(user());

    const response = await request(app)
      .post('/api/v1/users')
      .set('Cookie', 'spaceezy_session=admin-token')
      .send({ name: 'Dup', email: 'emp1@example.com', password: 'Secret1234' });

    expect(response.status).toBe(400);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('SALES_EXECUTIVE cannot create or delete users (403)', async () => {
    exec();

    const created = await request(app)
      .post('/api/v1/users')
      .set('Cookie', 'spaceezy_session=exec-token')
      .send({ name: 'X', email: 'x@example.com', password: 'Secret1234' });
    expect(created.status).toBe(403);

    const removed = await request(app)
      .delete(`/api/v1/users/${TARGET}`)
      .set('Cookie', 'spaceezy_session=exec-token');
    expect(removed.status).toBe(403);

    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('ADMIN updates role and status (200)', async () => {
    admin();
    prisma.user.findFirst.mockResolvedValue(user());
    prisma.user.update.mockResolvedValue(user({ role: 'ADMIN' }));

    const response = await request(app)
      .patch(`/api/v1/users/${TARGET}`)
      .set('Cookie', 'spaceezy_session=admin-token')
      .send({ role: 'ADMIN', status: 'ACTIVE' });

    expect(response.status).toBe(200);
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: TARGET }, data: expect.objectContaining({ role: 'ADMIN' }) })
    );
  });

  it('ADMIN cannot elevate anyone to SUPER_ADMIN (rejected)', async () => {
    admin();
    prisma.user.findFirst.mockResolvedValue(user());

    const response = await request(app)
      .patch(`/api/v1/users/${TARGET}`)
      .set('Cookie', 'spaceezy_session=admin-token')
      .send({ role: 'SUPER_ADMIN' });

    // Rejected by the two-role validator (400); the service-level elevation
    // guard remains as defense-in-depth behind it.
    expect([400, 403]).toContain(response.status);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('ADMIN delete soft-deactivates instead of hard-deleting (200)', async () => {
    admin();
    prisma.user.findFirst.mockResolvedValue(user());
    prisma.user.update.mockResolvedValue(user({ status: 'INACTIVE' }));

    const response = await request(app)
      .delete(`/api/v1/users/${TARGET}`)
      .set('Cookie', 'spaceezy_session=admin-token');

    expect(response.status).toBe(200);
    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: TARGET }, data: { status: 'INACTIVE' } });
    expect(prisma.user.delete).not.toHaveBeenCalled();
  });

  it('rejects short passwords on create (400)', async () => {
    admin();

    const response = await request(app)
      .post('/api/v1/users')
      .set('Cookie', 'spaceezy_session=admin-token')
      .send({ name: 'Short', email: 'short@example.com', password: 'Secret12' });

    expect(response.status).toBe(400);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('ignores an injected organizationId and scopes to the session org', async () => {
    admin();
    prisma.user.findFirst.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue(user());

    const response = await request(app)
      .post('/api/v1/users')
      .set('Cookie', 'spaceezy_session=admin-token')
      .send({ name: 'Sneaky', email: 'sneaky@example.com', password: 'Secret12344', organizationId: '99999999-9999-4999-8999-999999999999' });

    expect(response.status).toBe(201);
    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ organizationId: ORG }) })
    );
  });

  it('returns 404 when touching a user outside the session org', async () => {
    admin();
    prisma.user.findFirst.mockResolvedValue(null);

    const updated = await request(app)
      .patch(`/api/v1/users/${TARGET}`)
      .set('Cookie', 'spaceezy_session=admin-token')
      .send({ phone: '9111111111' });
    expect(updated.status).toBe(404);

    const removed = await request(app)
      .delete(`/api/v1/users/${TARGET}`)
      .set('Cookie', 'spaceezy_session=admin-token');
    expect(removed.status).toBe(404);
  });
});
