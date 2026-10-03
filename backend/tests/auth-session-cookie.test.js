const request = require('supertest');
const app = require('../src/app');
const { requireAuth } = require('../src/middleware/auth');
const prisma = require('../src/db/prisma');

jest.mock('../src/db/prisma', () => ({
  session: {
    findUnique: jest.fn(),
  },
}));

describe('requireAuth session cookie fallback', () => {
  beforeEach(() => {
    delete process.env.SESSION_COOKIE_NAME;
    jest.clearAllMocks();
  });

  it('uses the default cookie name when SESSION_COOKIE_NAME is not configured', async () => {
    const req = {
      cookies: { spaceezy_session: 'test-session-token' },
    };
    const res = {};
    const next = jest.fn();

    prisma.session.findUnique.mockResolvedValue({
      expiresAt: new Date(Date.now() + 60_000),
      user: {
        id: 'user-123',
        organizationId: 'org-123',
        role: 'SALES_EXECUTIVE',
      },
    });

    await requireAuth()(req, res, next);

    expect(prisma.session.findUnique).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith();
    expect(req.auth).toEqual({
      userId: 'user-123',
      organizationId: 'org-123',
      role: 'SALES_EXECUTIVE',
    });
  });
});

describe('login malformed JSON payload fallback', () => {
  it('returns a validation error instead of crashing on legacy malformed login payloads', async () => {
    const response = await request(app)
      .post('/api/v1/auth/login')
      .set('Content-Type', 'application/json')
      .send('{" email\\:\\admin@spaceezy.com\\,\\password\\:\\password123\\}');

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.message).toMatch(/invalid|payload|json|login/i);
    expect(response.body.message).not.toMatch(/bad escaped character/i);
  });
});
