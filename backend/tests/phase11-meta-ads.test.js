const fs = require('fs');
const request = require('supertest');
const app = require('../src/app');
const prisma = require('../src/db/prisma');

jest.mock('../src/db/prisma', () => ({
  session: { findUnique: jest.fn() },
  user: { findFirst: jest.fn() },
  organization: { findFirst: jest.fn() },
  $transaction: jest.fn(),
}));

const ORG = '11111111-1111-4111-8111-111111111111';

const mockSession = (role, userId) => {
  prisma.session.findUnique.mockResolvedValue({
    expiresAt: new Date(Date.now() + 60_000),
    user: { id: userId, organizationId: ORG, role, status: 'ACTIVE' },
  });
};

const admin = () => mockSession('ADMIN', 'admin-user');
const manager = () => mockSession('SALES_MANAGER', 'manager-user');
const exec = () => mockSession('SALES_EXECUTIVE', 'exec-user');

const META_ENV_KEYS = ['META_APP_ID', 'META_APP_SECRET', 'META_ACCESS_TOKEN', 'META_AD_ACCOUNT_ID', 'META_PAGE_ID', 'META_GRAPH_VERSION'];
let savedMetaEnv;

const stubGraph = (response, ok = true, status = 200) =>
  jest.spyOn(global, 'fetch').mockResolvedValue({ ok, status, json: async () => response });

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.SESSION_COOKIE_NAME;
  savedMetaEnv = {};
  for (const key of META_ENV_KEYS) {
    savedMetaEnv[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  jest.restoreAllMocks();
  for (const key of META_ENV_KEYS) {
    if (savedMetaEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedMetaEnv[key];
  }
});

const withMetaEnv = () => {
  process.env.META_ACCESS_TOKEN = 'test-meta-token';
  process.env.META_AD_ACCOUNT_ID = '1234567890';
};

describe('Phase 11: Meta connection status', () => {
  test('returns honest disconnected status when env is missing (200, no throw)', async () => {
    admin();
    const res = await request(app)
      .get('/api/v1/meta-ads/status')
      .set('Cookie', 'spaceezy_session=admin-token');

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ connected: false, reason: 'MISSING_CONFIG' });
    expect(res.body.data.missing).toEqual(expect.arrayContaining(['META_ACCESS_TOKEN', 'META_AD_ACCOUNT_ID']));
  });

  test('reports connected with account, user and granted permissions (no secrets)', async () => {
    admin();
    withMetaEnv();
    stubGraph({ id: '999', name: 'SpaceEzy' })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ id: '999', name: 'SpaceEzy' }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ id: 'act_1234567890', name: 'SpaceEzy Ads', account_status: 1, currency: 'INR', timezone_name: 'Asia/Kolkata' }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ data: [{ permission: 'ads_read', status: 'granted' }, { permission: 'email', status: 'granted' }] }) });

    const res = await request(app)
      .get('/api/v1/meta-ads/status')
      .set('Cookie', 'spaceezy_session=admin-token');

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      connected: true,
      reason: null,
      missingPermissions: [],
      user: { id: '999', name: 'SpaceEzy' },
      adAccount: { id: 'act_1234567890', name: 'SpaceEzy Ads' },
    });
    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toContain('test-meta-token');
    expect(serialized).not.toMatch(/access[_-]?token/i);
    expect(serialized).not.toMatch(/app[_-]?secret/i);
  });

  test('reports permission-denied when ads_read is missing', async () => {
    admin();
    withMetaEnv();
    stubGraph({})
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ id: '999' }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ id: 'act_1', account_status: 1 }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ data: [{ permission: 'email', status: 'granted' }] }) });

    const res = await request(app)
      .get('/api/v1/meta-ads/status')
      .set('Cookie', 'spaceezy_session=admin-token');

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ connected: false, reason: 'PERMISSION_DENIED', missingPermissions: ['ads_read'] });
  });

  test('degrades to disconnected on invalid token (no throw, no leak)', async () => {
    admin();
    process.env.META_ACCESS_TOKEN = 'SECRET-TOKEN-XYZ';
    process.env.META_AD_ACCOUNT_ID = '1234567890';
    stubGraph({ error: { message: 'Invalid OAuth access token', code: 190 } }, false, 401);

    const res = await request(app)
      .get('/api/v1/meta-ads/status')
      .set('Cookie', 'spaceezy_session=admin-token');

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ connected: false, reason: 'META_TOKEN_INVALID' });
    expect(JSON.stringify(res.body)).not.toContain('SECRET-TOKEN-XYZ');
  });
});

describe('Phase 11: Meta RBAC and pending write ops', () => {
  test('executive is denied on all meta-ads routes (403)', async () => {
    exec();
    for (const path of ['/api/v1/meta-ads/status', '/api/v1/meta-ads/campaigns?datePreset=last_7d', '/api/v1/meta-ads/insights?datePreset=last_7d']) {
      const res = await request(app).get(path).set('Cookie', 'spaceezy_session=exec-token');
      expect(res.status).toBe(403);
    }
  });

  test('manager can view reporting (200)', async () => {
    manager();
    withMetaEnv();
    stubGraph({ data: [] });

    const res = await request(app)
      .get('/api/v1/meta-ads/campaigns')
      .set('Cookie', 'spaceezy_session=manager-token');

    expect(res.status).toBe(200);
  });

  test('campaign write operations do not exist (404, never simulated)', async () => {
    admin();
    for (const [method, path] of [['post', '/api/v1/meta-ads/campaigns'], ['patch', '/api/v1/meta-ads/campaigns/123'], ['delete', '/api/v1/meta-ads/campaigns/123']]) {
      const res = await request(app)[method](path).set('Cookie', 'spaceezy_session=admin-token').send({});
      expect(res.status).toBe(404);
    }
  });
});

describe('Phase 11: Campaigns and insights mapping', () => {
  test('maps campaign fields, preserves null budgets, passes paging through', async () => {
    admin();
    withMetaEnv();
    stubGraph({
      data: [
        { id: '111', name: 'Wave City Launch', status: 'ACTIVE', effective_status: 'ACTIVE', objective: 'LEAD_GENERATION', daily_budget: '5000', lifetime_budget: null, start_time: '2026-10-01', stop_time: null },
        { id: '222', name: 'Diwali Push', status: 'PAUSED', effective_status: 'PAUSED', objective: 'LINK_CLICKS' },
      ],
      paging: { cursors: { after: 'CUR' } },
    });

    const res = await request(app)
      .get('/api/v1/meta-ads/campaigns?limit=10')
      .set('Cookie', 'spaceezy_session=admin-token');

    expect(res.status).toBe(200);
    expect(res.body.data.adAccountId).toBe('1234567890');
    expect(res.body.data.items).toHaveLength(2);
    expect(res.body.data.items[0]).toMatchObject({ id: '111', effectiveStatus: 'ACTIVE', dailyBudget: '5000', lifetimeBudget: null });
    expect(res.body.data.paging).toMatchObject({ cursors: { after: 'CUR' } });
  });

  test('rejects invalid campaign filters without calling Meta (400)', async () => {
    admin();
    const spy = jest.spyOn(global, 'fetch');

    for (const qs of ['?status=BOGUS', '?limit=abc']) {
      const res = await request(app)
        .get(`/api/v1/meta-ads/campaigns${qs}`)
        .set('Cookie', 'spaceezy_session=admin-token');
      expect(res.status).toBe(400);
    }
    expect(spy).not.toHaveBeenCalled();
  });

  test('maps insights with zero-safe CPL and null-for-unknown leads', async () => {
    admin();
    withMetaEnv();
    stubGraph({
      data: [
        { campaign_id: '111', campaign_name: 'Wave', spend: '100.50', impressions: '1000', reach: '800', clicks: '40', actions: [{ action_type: 'leadgen', value: '4' }, { action_type: 'like', value: '9' }], date_start: '2026-10-01', date_stop: '2026-10-07' },
        { campaign_id: '222', campaign_name: 'Quiet', spend: '10', actions: [], date_start: '2026-10-01', date_stop: '2026-10-07' },
        { campaign_id: '333', campaign_name: 'Flat', spend: '50', actions: [{ action_type: 'leadgen', value: '0' }], date_start: '2026-10-01', date_stop: '2026-10-07' },
      ],
    });

    const res = await request(app)
      .get('/api/v1/meta-ads/insights?level=campaign&datePreset=last_7d')
      .set('Cookie', 'spaceezy_session=admin-token');

    expect(res.status).toBe(200);
    const [a, b, c] = res.body.data.items;
    expect(a).toMatchObject({ leads: 4, costPerLead: 25.125, spend: 100.5 });
    expect(b).toMatchObject({ leads: null, costPerLead: null });
    expect(c).toMatchObject({ leads: 0, costPerLead: null });
  });

  test('rejects invalid insight queries without calling Meta (400)', async () => {
    admin();
    const spy = jest.spyOn(global, 'fetch');

    for (const qs of [
      '?level=bogus&datePreset=last_7d',
      '?level=campaign&datePreset=last_7d&since=2026-10-01',
      '?level=campaign',
      '?level=campaign&since=2026-10-07&until=2026-10-01',
      '?level=campaign&since=2026-10-01',
    ]) {
      const res = await request(app)
        .get(`/api/v1/meta-ads/insights${qs}`)
        .set('Cookie', 'spaceezy_session=admin-token');
      expect(res.status).toBe(400);
    }
    expect(spy).not.toHaveBeenCalled();
  });

  test('ad-set/ad insights require campaignIds even when configured (400)', async () => {
    admin();
    withMetaEnv();
    const spy = jest.spyOn(global, 'fetch');

    const res = await request(app)
      .get('/api/v1/meta-ads/insights?level=adset&datePreset=last_7d')
      .set('Cookie', 'spaceezy_session=admin-token');

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(spy).not.toHaveBeenCalled();
  });

  test('forwards cursor pagination and campaign filters to Meta', async () => {
    admin();
    withMetaEnv();
    const spy = stubGraph({ data: [] });

    const res = await request(app)
      .get('/api/v1/meta-ads/insights?level=adset&campaignIds=111,222&since=2026-10-01&until=2026-10-07&after=CURSOR9')
      .set('Cookie', 'spaceezy_session=admin-token');

    expect(res.status).toBe(200);
    const url = spy.mock.calls[0][0];
    expect(url).toContain('after=CURSOR9');
    expect(decodeURIComponent(url)).toContain('"campaign.id"');
    expect(decodeURIComponent(url)).toContain('111');
  });
});

describe('Phase 11: Meta transport failures and isolation', () => {
  test('rate limits surface as 429 with the code preserved', async () => {
    admin();
    withMetaEnv();
    stubGraph({ error: { message: 'Application request limit reached', code: 80004 } }, false, 429);

    const res = await request(app)
      .get('/api/v1/meta-ads/campaigns')
      .set('Cookie', 'spaceezy_session=admin-token');

    expect(res.status).toBe(429);
    expect(res.body.code).toBe('META_RATE_LIMITED');
  });

  test('timeouts surface as 504 without leaking config', async () => {
    admin();
    withMetaEnv();
    const err = new Error('The operation timed out');
    err.name = 'TimeoutError';
    jest.spyOn(global, 'fetch').mockRejectedValue(err);

    const res = await request(app)
      .get('/api/v1/meta-ads/campaigns')
      .set('Cookie', 'spaceezy_session=admin-token');

    expect(res.status).toBe(504);
    expect(res.body.code).toBe('META_TIMEOUT');
    expect(JSON.stringify(res.body)).not.toContain('test-meta-token');
  });

  test('invalid tokens on data endpoints surface as 502 without leaking', async () => {
    admin();
    process.env.META_ACCESS_TOKEN = 'SECRET-TOKEN-XYZ';
    process.env.META_AD_ACCOUNT_ID = '1234567890';
    stubGraph({ error: { message: 'Invalid OAuth access token', code: 190 } }, false, 401);

    const res = await request(app)
      .get('/api/v1/meta-ads/campaigns')
      .set('Cookie', 'spaceezy_session=admin-token');

    expect(res.status).toBe(502);
    expect(res.body.code).toBe('META_TOKEN_INVALID');
    expect(JSON.stringify(res.body)).not.toContain('SECRET-TOKEN-XYZ');
  });

  test('permission failures surface as 403 with clean messages', async () => {
    admin();
    withMetaEnv();
    stubGraph({ error: { message: 'Unsupported operation', code: 10 } }, false, 403);

    const res = await request(app)
      .get('/api/v1/meta-ads/campaigns')
      .set('Cookie', 'spaceezy_session=admin-token');

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('META_PERMISSION_DENIED');
  });

  test('Meta transport performs no database access (read-only by design)', () => {
    const source = fs.readFileSync(require.resolve('../src/services/metaGraph.js'), 'utf8');
    expect(source).not.toMatch(/prisma\./);
    expect(source).not.toMatch(/organizationId/);
  });
});
