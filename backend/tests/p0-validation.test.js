const request = require('supertest');
const { z } = require('zod');
const app = require('../src/app');
const validate = require('../src/middleware/validate');
const prisma = require('../src/db/prisma');

jest.mock('../src/db/prisma', () => {
  const tx = {
    lead: {
      create: jest.fn(),
    },
    leadActivity: {
      create: jest.fn(),
    },
  };
  return {
    __tx: tx,
    session: {
      findUnique: jest.fn(),
    },
    $transaction: jest.fn(async (fn) => fn(tx)),
  };
});

const mockAdminSession = () => {
  prisma.session.findUnique.mockResolvedValue({
    expiresAt: new Date(Date.now() + 60_000),
    user: {
      id: 'admin-user-id',
      organizationId: 'org-1',
      role: 'ADMIN',
      status: 'ACTIVE',
    },
  });
};

const LEAD_ID = '22222222-2222-4222-8222-222222222222';

describe('validate middleware regression (Zod 4 issues, P0 #4)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.SESSION_COOKIE_NAME;
  });

  it('returns 400 with formatted field errors when schema.body.parse throws a ZodError', () => {
    const schema = { body: z.object({ name: z.string().min(1, 'Name is required') }) };
    const req = { body: { name: '' } };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    const next = jest.fn();

    validate(schema)(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    const payload = res.json.mock.calls[0][0];
    expect(payload.success).toBe(false);
    expect(payload.code).toBe('VALIDATION_ERROR');
    expect(payload.message).toBe('Validation failed');
    expect(Array.isArray(payload.errors)).toBe(true);
    expect(payload.errors[0]).toEqual({ field: 'name', message: 'Name is required' });
  });

  it('returns 400 (not 500) for invalid query validation', () => {
    const schema = { query: z.object({ page: z.string().regex(/^\d+$/) }) };
    const req = { query: { page: 'abc' } };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    const next = jest.fn();

    validate(schema)(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].code).toBe('VALIDATION_ERROR');
    expect(next).not.toHaveBeenCalled();
  });

  it('POST /api/v1/leads with invalid payload returns 400 VALIDATION_ERROR instead of 500', async () => {
    mockAdminSession();

    const response = await request(app)
      .post('/api/v1/leads')
      .set('Cookie', 'spaceezy_session=test-token')
      .send({ phone: '123', email: 'not-an-email', status: 'NOT_A_STATUS' });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.code).toBe('VALIDATION_ERROR');
    expect(Array.isArray(response.body.errors)).toBe(true);
    expect(response.body.errors.length).toBeGreaterThan(0);
    expect(response.status).not.toBe(500);
  });

  it('PATCH /api/v1/leads/bulk-assign with non-uuid fields returns 400 instead of 500', async () => {
    mockAdminSession();

    const response = await request(app)
      .patch('/api/v1/leads/bulk-assign')
      .set('Cookie', 'spaceezy_session=test-token')
      .send({ leadIds: ['not-a-uuid'], assignedToId: 'not-a-uuid' });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('VALIDATION_ERROR');
  });

  it('PATCH /api/v1/leads/bulk-assign with non-array leadIds returns 400 instead of 500', async () => {
    mockAdminSession();

    const response = await request(app)
      .patch('/api/v1/leads/bulk-assign')
      .set('Cookie', 'spaceezy_session=test-token')
      .send({ leadIds: 'oops', assignedToId: LEAD_ID });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('VALIDATION_ERROR');
  });

  it('POST /api/v1/leads/:id/merge with missing duplicateLeadId returns 400 instead of 500', async () => {
    mockAdminSession();

    const response = await request(app)
      .post(`/api/v1/leads/${LEAD_ID}/merge`)
      .set('Cookie', 'spaceezy_session=test-token')
      .send({});

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('VALIDATION_ERROR');
  });

  it('POST /api/v1/leads/:id/merge with malformed id param returns 400 instead of 500', async () => {
    mockAdminSession();

    const response = await request(app)
      .post('/api/v1/leads/not-a-uuid/merge')
      .set('Cookie', 'spaceezy_session=test-token')
      .send({ duplicateLeadId: LEAD_ID });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('VALIDATION_ERROR');
  });

  it('POST /api/v1/leads with valid payload still passes validation (no functional regression)', async () => {
    mockAdminSession();
    const prismaTx = prisma.__tx;
    prismaTx.lead.create.mockResolvedValue({ id: LEAD_ID, name: 'P0 Lead', phone: '9999999999' });
    prismaTx.leadActivity.create.mockResolvedValue({});

    const response = await request(app)
      .post('/api/v1/leads')
      .set('Cookie', 'spaceezy_session=test-token')
      .send({ name: 'P0 Lead', phone: '9999999999' });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.code).not.toBe('VALIDATION_ERROR');
  });
});
