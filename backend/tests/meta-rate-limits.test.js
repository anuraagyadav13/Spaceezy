const request = require('supertest');
const app = require('../src/app');
const prisma = require('../src/db/prisma');

jest.mock('../src/db/prisma', () => ({
  session: { findUnique: jest.fn() },
  organization: { findFirst: jest.fn() },
  metaAdsSettings: { findUnique: jest.fn(), update: jest.fn(), upsert: jest.fn() },
  $transaction: jest.fn(),
}));

// Step 0 rate limiting. Kept in its OWN file on purpose: the limiter
// MemoryStore is per module instance (one per test file), so counters here
// never leak into the other Meta suites. Limits are read from env on every
// request, so tests can tighten them without a restart; every key is
// restored in afterEach because jest runs files in one process (--runInBand)
// and process.env persists across files.

const ORG = '11111111-1111-4111-8111-111111111111';

const META_ENV_KEYS = [
  'META_RATE_LIMIT_READ_MAX',
  'META_RATE_LIMIT_WEBHOOK_MAX',
  'META_RATE_LIMIT_CONNECT_MAX',
  'META_ACCESS_TOKEN',
  'META_AD_ACCOUNT_ID',
  'META_GRAPH_VERSION',
  'META_APP_ID',
  'META_ADS_SETTINGS_KEY',
  'META_OAUTH_CONFIG_ID',
  'SESSION_COOKIE_NAME',
];
let savedMetaEnv;

const mockSession = (role, userId) => {
  prisma.session.findUnique.mockResolvedValue({
    expiresAt: new Date(Date.now() + 60_000),
    user: { id: userId, organizationId: ORG, role, status: 'ACTIVE' },
  });
};

const getStatus = () =>
  request(app).get('/api/v1/meta-ads/status').set('Cookie', 'spaceezy_session=admin-token');

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.SESSION_COOKIE_NAME;
  savedMetaEnv = {};
  for (const key of META_ENV_KEYS) {
    savedMetaEnv[key] = process.env[key];
    delete process.env[key];
  }
  prisma.organization.findFirst.mockResolvedValue({ id: ORG });
});

afterEach(() => {
  jest.restoreAllMocks();
  for (const key of META_ENV_KEYS) {
    if (savedMetaEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedMetaEnv[key];
  }
});

describe('Step 0: /meta-ads read limiter', () => {
  test('exhausted budget returns a retry-friendly 429 with Retry-After', async () => {
    process.env.META_RATE_LIMIT_READ_MAX = '3';

    const statuses = [];
    let last;
    for (let i = 0; i < 4; i += 1) {
      last = await request(app).get('/api/v1/meta-ads/status'); // no session: 401s still consume budget
      statuses.push(last.status);
    }

    expect(statuses).toEqual([401, 401, 401, 429]);
    expect(last.body.code).toBe('TOO_MANY_REQUESTS');
    expect(last.headers['retry-after']).toBeDefined();
    expect(Number(last.headers['retry-after'])).toBeGreaterThan(0);
  });

  test('default budget never shapes an authenticated dashboard request', async () => {
    // Tightened limit from the previous test is gone (restored in afterEach);
    // with the generous default the same request passes the limiter and the
    // handler answers normally instead of 429.
    mockSession('ADMIN', 'admin-user');
    process.env.META_ACCESS_TOKEN = 'test-meta-token';
    process.env.META_AD_ACCOUNT_ID = '1234567890';
    jest.spyOn(global, 'fetch').mockImplementation(async (url) => {
      const id = new URL(String(url)).pathname.split('/').filter(Boolean).pop();
      const body = id === 'permissions'
        ? { data: [{ permission: 'ads_read', status: 'granted' }, { permission: 'email', status: 'granted' }] }
        : (id === 'me'
          ? { id: '999', name: 'SpaceEzy' }
          : { id: 'act_1234567890', name: 'SpaceEzy Ads', account_status: 1, currency: 'INR', timezone_name: 'Asia/Kolkata' });
      return { ok: true, status: 200, json: async () => body };
    });

    const res = await getStatus();

    expect(res.status).toBe(200);
    expect(res.body.data.connected).toBe(true);
  });
});

describe('Step 0: Meta webhook POST limiter', () => {
  test('bursts beyond the budget get 429 + Retry-After (Meta retries those)', async () => {
    process.env.META_RATE_LIMIT_WEBHOOK_MAX = '2';
    const raw = JSON.stringify({ object: 'page' });

    const first = await request(app)
      .post('/api/v1/webhooks/meta/leadgen')
      .set('Content-Type', 'application/json')
      .set('X-Hub-Signature-256', 'sha256=deadbeef')
      .send(raw);
    const second = await request(app)
      .post('/api/v1/webhooks/meta/leadgen')
      .set('Content-Type', 'application/json')
      .set('X-Hub-Signature-256', 'sha256=deadbeef')
      .send(raw);
    const third = await request(app)
      .post('/api/v1/webhooks/meta/leadgen')
      .set('Content-Type', 'application/json')
      .set('X-Hub-Signature-256', 'sha256=deadbeef')
      .send(raw);

    // Within budget the handler answers (signature rejects these), the next
    // request is stopped by the limiter itself.
    expect(first.status).toBe(401);
    expect(second.status).toBe(401);
    expect(third.status).toBe(429);
    expect(third.body.code).toBe('TOO_MANY_REQUESTS');
    expect(third.headers['retry-after']).toBeDefined();
  });
});

describe('Step 0: Meta OAuth connect limiter', () => {
  test('token-exchange surface has its own tighter budget', async () => {
    process.env.META_RATE_LIMIT_CONNECT_MAX = '2';
    process.env.META_APP_ID = '1234567890';
    process.env.BACKEND_URL = 'http://localhost:8000';
    process.env.META_ADS_SETTINGS_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    mockSession('ADMIN', 'admin-user');

    const first = await request(app)
      .post('/api/v1/meta-ads/oauth/state')
      .set('Cookie', 'spaceezy_session=admin-token')
      .send({});
    const second = await request(app)
      .post('/api/v1/meta-ads/oauth/state')
      .set('Cookie', 'spaceezy_session=admin-token')
      .send({});
    const third = await request(app)
      .post('/api/v1/meta-ads/oauth/state')
      .set('Cookie', 'spaceezy_session=admin-token')
      .send({});

    expect(first.status).toBe(200);
    // The authorize URL carries a signed state — never the app secret.
    expect(first.body.data.authorizeUrl).toContain('client_id=1234567890');
    expect(first.body.data.authorizeUrl).not.toContain('client_secret');
    expect(second.status).toBe(200);
    expect(third.status).toBe(429);
    expect(third.body.code).toBe('TOO_MANY_REQUESTS');
    expect(third.headers['retry-after']).toBeDefined();
  });
});
