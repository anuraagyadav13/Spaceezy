const crypto = require('crypto');
const request = require('supertest');
const app = require('../src/app');
const prisma = require('../src/db/prisma');
const { encryptSecret } = require('../src/utils/whatsappSecrets');
const MetaAdsSettingsService = require('../src/services/metaAdsSettingsService');

jest.mock('../src/db/prisma', () => {
  const mock = {
    session: { findUnique: jest.fn() },
    organization: { findFirst: jest.fn() },
    metaAdsSettings: { findUnique: jest.fn(), update: jest.fn(), upsert: jest.fn() },
    metaLeadFormConfig: {
      findUnique: jest.fn(), findMany: jest.fn(), updateMany: jest.fn(),
      upsert: jest.fn(), create: jest.fn(), update: jest.fn(),
    },
    metaLeadSyncEvent: {
      findUnique: jest.fn(), create: jest.fn(), update: jest.fn(),
      findMany: jest.fn(), count: jest.fn(),
    },
    metaLeadSyncRun: {
      create: jest.fn(), update: jest.fn(), findFirst: jest.fn(),
      findMany: jest.fn(), count: jest.fn(),
    },
    lead: { findFirst: jest.fn(), findMany: jest.fn(), count: jest.fn(), create: jest.fn(), update: jest.fn() },
    leadActivity: { create: jest.fn() },
    auditLog: { create: jest.fn() },
    whatsappSettings: { findUnique: jest.fn() },
    project: { findFirst: jest.fn() },
    property: { findFirst: jest.fn() },
    configuration: { findFirst: jest.fn(), findMany: jest.fn() },
    user: { findFirst: jest.fn(), findUnique: jest.fn() },
  };
  // Lead creation runs through LeadService.createLead, which opens a
  // transaction: the shim executes the callback against the same mock.
  mock.$transaction = jest.fn(async (fn) => fn(mock));
  return mock;
});

// Phase 1: company-level Meta connection, encrypted settings, OAuth,
// asset discovery, multi-Page webhook validation and RBAC.

const ORG = '11111111-1111-4111-8111-111111111111';
const PAGE_1 = '111222333444';
const PAGE_2 = '555666777888';
const META_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const ENC = { keyEnv: 'META_ADS_SETTINGS_KEY', label: 'Meta Ads settings' };

const META_ENV_KEYS = [
  'META_APP_ID', 'META_APP_SECRET', 'META_ACCESS_TOKEN', 'META_AD_ACCOUNT_ID',
  'META_PAGE_ID', 'META_GRAPH_VERSION', 'META_WEBHOOK_VERIFY_TOKEN',
  'META_ADS_SETTINGS_KEY', 'META_OAUTH_CONFIG_ID',
  'BACKEND_URL', 'FRONTEND_URL', 'SESSION_COOKIE_NAME',
];
let savedMetaEnv;

const mockSession = (role, userId, organizationId = ORG) => {
  prisma.session.findUnique.mockResolvedValue({
    expiresAt: new Date(Date.now() + 60_000),
    user: { id: userId, organizationId, role, status: 'ACTIVE' },
  });
};
const admin = () => mockSession('ADMIN', 'admin-user');
const manager = () => mockSession('SALES_MANAGER', 'manager-user');
const exec = () => mockSession('SALES_EXECUTIVE', 'exec-user');

const auth = (cookie = 'spaceezy_session=admin-token') => `Cookie: ${cookie}`;
const get = (path, cookie) => request(app).get(path).set('Cookie', cookie || 'spaceezy_session=admin-token');
const put = (path, body, cookie) =>
  request(app).put(path).set('Cookie', cookie || 'spaceezy_session=admin-token').send(body || {});
const post = (path, body, cookie) =>
  request(app).post(path).set('Cookie', cookie || 'spaceezy_session=admin-token').send(body || {});

// Routes Graph requests by the last URL path segment. A handler with
// __status simulates a provider failure for that path.
const stubGraphRoutes = (routes) =>
  jest.spyOn(global, 'fetch').mockImplementation(async (url) => {
    const pathname = new URL(String(url)).pathname;
    const id = pathname.split('/').filter(Boolean).pop() || '';
    const handler = routes[id];
    if (handler === undefined) {
      return { ok: false, status: 404, json: async () => ({ error: { message: `No stub for ${id}`, code: 100 } }) };
    }
    if (handler && handler.__status) {
      return { ok: false, status: handler.__status, json: async () => handler.__body || {} };
    }
    return { ok: true, status: 200, json: async () => handler };
  });

const statusRoutes = {
  me: { id: '999', name: 'SpaceEzy' },
  act_999000: { id: 'act_999000', name: 'SpaceEzy Ads', account_status: 1, currency: 'INR', timezone_name: 'Asia/Kolkata' },
  permissions: { data: [
    { permission: 'ads_read', status: 'granted' },
    { permission: 'leads_retrieval', status: 'granted' },
    { permission: 'pages_show_list', status: 'granted' },
    { permission: 'pages_read_engagement', status: 'granted' },
    { permission: 'instagram_basic', status: 'granted' },
  ] },
};

// A settings row whose secrets are encrypted under the Meta key (built at
// call time — the key must be present in env when this runs).
const storedRow = (overrides = {}) => ({
  id: 'settings-row',
  organizationId: ORG,
  accessTokenEnc: encryptSecret('DB-TOKEN-SECRET', ENC),
  appSecretEnc: encryptSecret('DB-APP-SECRET', ENC),
  selectedAdAccountIds: ['999000'],
  pageIds: [PAGE_1, PAGE_2],
  instagramAccountIds: ['99887766'],
  graphVersion: 'v22.0',
  tokenExpiresAt: null,
  syncedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

const signWith = (secret, rawBody) =>
  `sha256=${crypto.createHmac('sha256', secret).update(rawBody).digest('hex')}`;

const leadDetail = (overrides = {}) => ({
  id: '777',
  created_time: 1729000000,
  field_data: [
    { name: 'full_name', values: ['Rohit Sharma'] },
    { name: 'phone_number', values: ['+91 90000 12345'] },
  ],
  ad_id: '555', adset_id: '556', campaign_id: '557', form_id: '558',
  ...overrides,
});

const postLeadgen = (leadgenId, pageId, secret) => {
  const raw = JSON.stringify({
    object: 'page',
    entry: [{ id: pageId, changes: [{ field: 'leadgen', value: {
      leadgen_id: leadgenId, page_id: pageId, form_id: '558', ad_id: '555', created_time: 1729000000,
    } }] }],
  });
  return request(app)
    .post('/api/v1/webhooks/meta/leadgen')
    .set('Content-Type', 'application/json')
    .set('X-Hub-Signature-256', signWith(secret, raw))
    .send(raw);
};

beforeEach(() => {
  jest.clearAllMocks();
  savedMetaEnv = {};
  for (const key of META_ENV_KEYS) {
    savedMetaEnv[key] = process.env[key];
    delete process.env[key];
  }
  process.env.META_ADS_SETTINGS_KEY = META_KEY;
  process.env.META_APP_ID = '1234567890';
  process.env.META_APP_SECRET = 'ENV-WEBHOOK-SECRET';
  process.env.META_ACCESS_TOKEN = 'test-meta-token';
  process.env.META_AD_ACCOUNT_ID = '999000';
  process.env.BACKEND_URL = 'http://localhost:8000';
  process.env.FRONTEND_URL = 'http://localhost:3000';
  prisma.organization.findFirst.mockResolvedValue({ id: ORG });
  prisma.auditLog.create.mockResolvedValue({ id: 'audit-1' });
});

afterEach(() => {
  jest.restoreAllMocks();
  for (const key of META_ENV_KEYS) {
    if (savedMetaEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedMetaEnv[key];
  }
});

describe('Phase 1: encryption at rest (shared AES-256-GCM utility)', () => {
  test('Meta key round-trips with a fresh random IV per encryption', () => {
    const a = encryptSecret('SECRET-VALUE', ENC);
    const b = encryptSecret('SECRET-VALUE', ENC);
    expect(a.startsWith('v1.')).toBe(true);
    expect(a).not.toBe(b); // unique IV: identical plaintexts produce different envelopes
    expect(a).not.toContain('SECRET-VALUE');
    const { decryptSecret } = require('../src/utils/whatsappSecrets');
    expect(decryptSecret(a, { keyEnv: 'META_ADS_SETTINGS_KEY', label: 'Meta Ads credential' })).toBe('SECRET-VALUE');
  });

  test('wrong key and tampered envelopes fail closed without leaking material', () => {
    const { decryptSecret } = require('../src/utils/whatsappSecrets');
    const envelope = encryptSecret('SECRET-VALUE', ENC);
    const savedKey = process.env.META_ADS_SETTINGS_KEY;
    process.env.META_ADS_SETTINGS_KEY = 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';
    expect(() => decryptSecret(envelope, { keyEnv: 'META_ADS_SETTINGS_KEY', label: 'Meta Ads credential' }))
      .toThrow('cannot be decrypted');
    process.env.META_ADS_SETTINGS_KEY = savedKey;

    const tampered = `${envelope.slice(0, -4)}AAAA`;
    let message = '';
    try { decryptSecret(tampered, { keyEnv: 'META_ADS_SETTINGS_KEY', label: 'Meta Ads credential' }); }
    catch (err) { message = err.message; }
    expect(message).toContain('cannot be decrypted');
    expect(message).not.toContain('SECRET-VALUE');
    expect(message).not.toContain(META_KEY);
  });

  test('missing Meta key fails closed (encrypt path reports the env var name only)', () => {
    const { decryptSecret } = require('../src/utils/whatsappSecrets');
    delete process.env.META_ADS_SETTINGS_KEY;
    expect(() => encryptSecret('x', ENC)).toThrow('META_ADS_SETTINGS_KEY');
    expect(() => decryptSecret('v1.aaaaaaaaaaaaaaaa.aaaaaaaaaaaaaaaa.aaaaaaaaaaaaaaaa', { keyEnv: 'META_ADS_SETTINGS_KEY', label: 'Meta Ads credential' }))
      .toThrow('cannot be decrypted');
  });

  test('WhatsApp and Meta keys are isolated from each other', () => {
    const { decryptSecret } = require('../src/utils/whatsappSecrets');
    process.env.WHATSAPP_SETTINGS_KEY = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    const whatsappEnvelope = encryptSecret('wa-secret'); // default key = WhatsApp
    expect(() => decryptSecret(whatsappEnvelope, ENC)).toThrow('cannot be decrypted');
    const metaEnvelope = encryptSecret('meta-secret', ENC);
    expect(() => decryptSecret(metaEnvelope)).toThrow('cannot be decrypted'); // default key = WhatsApp
    delete process.env.WHATSAPP_SETTINGS_KEY;
  });
});

describe('Phase 1: settings API (save / reload / validation)', () => {
  test('saving selections normalizes IDs, de-duplicates and never touches secrets', async () => {
    admin();
    prisma.metaAdsSettings.upsert.mockImplementation(async ({ create }) => ({
      id: 'row-1', createdAt: new Date(), updatedAt: new Date(), ...create,
    }));

    const res = await put('/api/v1/meta-ads/settings', {
      selectedAdAccountIds: ['act_123', 456, '123'],
      pageIds: [PAGE_1, PAGE_2],
      instagramAccountIds: [],
    });

    expect(res.status).toBe(200);
    const call = prisma.metaAdsSettings.upsert.mock.calls[0][0];
    expect(call.where).toEqual({ organizationId: ORG });
    expect(call.create.selectedAdAccountIds).toEqual(['123', '456']);
    expect(call.create.pageIds).toEqual([PAGE_1, PAGE_2]);
    expect(res.body.data).toMatchObject({
      source: 'db', configured: true,
      selectedAdAccountIds: ['123', '456'], pageIds: [PAGE_1, PAGE_2],
    });
    // Safe flags only: no value, no ciphertext, no *Enc column name.
    const saved = JSON.stringify(res.body);
    expect(saved).not.toMatch(/accessTokenEnc|"[^"]*v1\.[^"]*"/);
  });

  test('saving a token encrypts it at rest and keeps it out of responses, audit and logs', async () => {
    admin();
    prisma.metaAdsSettings.upsert.mockImplementation(async ({ create }) => ({
      id: 'row-1', createdAt: new Date(), updatedAt: new Date(), ...create,
    }));
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const res = await put('/api/v1/meta-ads/settings', { accessToken: 'PLAIN-TOKEN-XYZ' });

    expect(res.status).toBe(200);
    const call = prisma.metaAdsSettings.upsert.mock.calls[0][0];
    expect(call.create.accessTokenEnc).toMatch(/^v1\./);
    expect(call.create.accessTokenEnc).not.toBe('PLAIN-TOKEN-XYZ');
    expect(res.body.data.hasAccessToken).toBe(true);
    expect(JSON.stringify(res.body)).not.toContain('PLAIN-TOKEN-XYZ');

    const auditCall = prisma.auditLog.create.mock.calls[0][0].data;
    expect(auditCall.action).toBe('meta.settings_updated');
    expect(auditCall.metadata.fields).toContain('accessToken');
    expect(JSON.stringify(auditCall)).not.toContain('PLAIN-TOKEN-XYZ');

    for (const spy of [logSpy, warnSpy, errSpy]) {
      for (const callArgs of spy.mock.calls) {
        expect(JSON.stringify(callArgs)).not.toContain('PLAIN-TOKEN-XYZ');
      }
    }
  });

  test('GET settings returns the display-safe view (booleans, never values)', async () => {
    admin();
    prisma.metaAdsSettings.findUnique.mockResolvedValue(storedRow());

    const res = await get('/api/v1/meta-ads/settings');

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      source: 'db', configured: true, hasAccessToken: true, hasAppSecret: true,
      selectedAdAccountIds: ['999000'], pageIds: [PAGE_1, PAGE_2], instagramAccountIds: ['99887766'],
      graphVersion: 'v22.0',
    });
    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toContain('DB-TOKEN-SECRET');
    expect(serialized).not.toContain('DB-APP-SECRET');
    // Never values, ciphertext envelopes, or *Enc column names — boolean
    // flags (hasAccessToken/hasAppSecret/hasWebhookVerifyToken) are the
    // only secret-shaped fields allowed.
    expect(serialized).not.toMatch(/accessTokenEnc|appSecretEnc|webhookVerifyTokenEnc/);
    expect(serialized).not.toMatch(/"[^"]*v1\.[^"]*"/);
  });

  test('invalid settings bodies are rejected before any write (400)', async () => {
    admin();
    const spy = jest.spyOn(global, 'fetch');

    for (const body of [
      { graphVersion: 'vX' },
      { pageIds: 'not-an-array' },
      { pageIds: ['ok-id', 'bad-id'] },
      { selectedAdAccountIds: ['abc'] },
    ]) {
      const res = await put('/api/v1/meta-ads/settings', body);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    }
    expect(spy).not.toHaveBeenCalled();
    expect(prisma.metaAdsSettings.upsert).not.toHaveBeenCalled();
  });
});
describe('Phase 1: effective configuration (env fallback, row authority, fail-closed)', () => {
  test('no settings row → legacy environment behavior (configSource env)', async () => {
    admin();
    prisma.metaAdsSettings.findUnique.mockResolvedValue(undefined);
    stubGraphRoutes(statusRoutes);

    const res = await get('/api/v1/meta-ads/status');

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ connected: true, configSource: 'env', tokenExpired: false, reauthRequired: false });
    expect(String(res.body.data.missingPermissions)).not.toContain('ads_read');
  });

  test('settings row is authoritative: stored token used, env token never consulted', async () => {
    admin();
    prisma.metaAdsSettings.findUnique.mockResolvedValue(storedRow());
    process.env.META_ACCESS_TOKEN = 'ENV-TOKEN-MUST-NOT-BE-USED';
    stubGraphRoutes(statusRoutes);
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const res = await get('/api/v1/meta-ads/status');

    expect(res.status).toBe(200);
    expect(res.body.data.configSource).toBe('db');
    const [firstUrl, firstInit] = global.fetch.mock.calls[0];
    expect(firstInit.headers.Authorization).toBe('Bearer DB-TOKEN-SECRET');
    expect(String(firstUrl)).not.toContain('DB-TOKEN-SECRET');
    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toContain('DB-TOKEN-SECRET');
    expect(serialized).not.toContain('ENV-TOKEN-MUST-NOT-BE-USED');
    for (const spy of [logSpy, warnSpy, errSpy]) {
      for (const callArgs of spy.mock.calls) {
        expect(JSON.stringify(callArgs)).not.toContain('DB-TOKEN-SECRET');
      }
    }
  });

  test('decryption failure fails closed: 500, no Meta call, no env fallback', async () => {
    admin();
    prisma.metaAdsSettings.findUnique.mockResolvedValue(storedRow({ accessTokenEnc: 'v1.broken.envelope.here' }));
    process.env.META_ACCESS_TOKEN = 'ENV-TOKEN-MUST-NOT-BE-USED';
    const spy = jest.spyOn(global, 'fetch');

    const res = await get('/api/v1/meta-ads/status');

    expect(res.status).toBe(500);
    expect(res.body.code).toBe('SETTINGS_DECRYPT_FAILED');
    expect(spy).not.toHaveBeenCalled();
    expect(JSON.stringify(res.body)).not.toContain('ENV-TOKEN-MUST-NOT-BE-USED');
  });

  test('missing encryption key with a stored row also fails closed', async () => {
    admin();
    prisma.metaAdsSettings.findUnique.mockResolvedValue(storedRow());
    delete process.env.META_ADS_SETTINGS_KEY;
    const spy = jest.spyOn(global, 'fetch');

    const res = await get('/api/v1/meta-ads/status');

    expect(res.status).toBe(500);
    expect(res.body.code).toBe('SETTINGS_DECRYPT_FAILED');
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('Phase 1: connection status extensions', () => {
  test('known-expired token reports TOKEN_EXPIRED without calling Meta', async () => {
    admin();
    prisma.metaAdsSettings.findUnique.mockResolvedValue(storedRow({
      tokenExpiresAt: new Date(Date.now() - 60 * 60 * 1000),
    }));
    const spy = jest.spyOn(global, 'fetch');

    const res = await get('/api/v1/meta-ads/status');

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      connected: false, reason: 'TOKEN_EXPIRED', tokenExpired: true, reauthRequired: true,
    });
    expect(res.body.data.tokenExpiresAt).not.toBeNull();
    expect(spy).not.toHaveBeenCalled();
    expect(JSON.stringify(res.body)).not.toContain('DB-TOKEN-SECRET');
  });

  test('missing recommended permissions are reported but never block reporting', async () => {
    admin();
    prisma.metaAdsSettings.findUnique.mockResolvedValue(undefined);
    stubGraphRoutes({
      me: { id: '999', name: 'SpaceEzy' },
      act_999000: { id: 'act_999000', name: 'Ads', account_status: 1, currency: 'INR' },
      permissions: { data: [{ permission: 'ads_read', status: 'granted' }] },
    });

    const res = await get('/api/v1/meta-ads/status');

    expect(res.status).toBe(200);
    expect(res.body.data.connected).toBe(true);
    expect(res.body.data.missingPermissions).toEqual([]);
    expect(res.body.data.missingRecommendedPermissions).toEqual(
      expect.arrayContaining(['pages_show_list', 'leads_retrieval', 'instagram_basic'])
    );
  });
});

describe('Phase 1: OAuth connect flow', () => {
  test('authorize URL carries a signed state and scopes — never a secret', async () => {
    admin();

    const res = await post('/api/v1/meta-ads/oauth/state', {});

    expect(res.status).toBe(200);
    const url = new URL(res.body.data.authorizeUrl);
    expect(url.origin).toBe('https://www.facebook.com');
    expect(url.searchParams.get('client_id')).toBe('1234567890');
    expect(url.searchParams.get('redirect_uri')).toContain('/api/v1/meta-ads/oauth/callback');
    expect(url.searchParams.get('state')).toMatch(/^v1\./);
    expect(url.searchParams.get('scope')).toContain('ads_read');
    expect(url.searchParams.get('scope')).toContain('leads_retrieval');
    expect(JSON.stringify(res.body)).not.toContain('ENV-WEBHOOK-SECRET');
    expect(res.body.data.authorizeUrl).not.toContain('client_secret');
  });

  test('Facebook Login for Business: config_id replaces scope when META_OAUTH_CONFIG_ID is set', async () => {
    admin();
    process.env.META_OAUTH_CONFIG_ID = '2088777191773830';

    const res = await post('/api/v1/meta-ads/oauth/state', {});

    expect(res.status).toBe(200);
    const url = new URL(res.body.data.authorizeUrl);
    expect(url.searchParams.get('config_id')).toBe('2088777191773830');
    expect(url.searchParams.get('override_default_response_type')).toBe('true');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('state')).toMatch(/^v1\./);
    expect(url.searchParams.get('redirect_uri')).toContain('/api/v1/meta-ads/oauth/callback');
    expect(url.searchParams.has('scope')).toBe(false);
    expect(res.body.data.authorizeUrl).not.toContain('client_secret');
  });

  test('stateless OAuth state: valid passes, tampered/expired/missing-key fail closed', async () => {
    const authorizeUrl = await MetaAdsSettingsService.createAuthorizeUrl();
    const state = new URL(authorizeUrl).searchParams.get('state');
    expect(MetaAdsSettingsService.verifyState(state)).toBe(true);
    expect(MetaAdsSettingsService.verifyState(`${state.slice(0, -1)}X`)).toBe(false);

    const exp = Date.now() - 1000;
    const nonce = 'n';
    const sig = crypto.createHmac('sha256', Buffer.from(META_KEY, 'hex')).update(`${exp}.${nonce}`).digest('base64url');
    expect(MetaAdsSettingsService.verifyState(`v1.${exp}.${nonce}.${sig}`)).toBe(false);

    delete process.env.META_ADS_SETTINGS_KEY;
    expect(MetaAdsSettingsService.verifyState(state)).toBe(false);
    await expect(MetaAdsSettingsService.createAuthorizeUrl()).rejects.toThrow('META_ADS_SETTINGS_KEY');
  });

  test('callback without a session redirects to login (safe flag only)', async () => {
    const res = await request(app).get('/api/v1/meta-ads/oauth/callback?code=X&state=v1.a.b.c');
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('http://localhost:3000/dashboard/marketing/meta-ads/settings');
    expect(res.headers.location).toContain('oauth=login_required');
    expect(res.headers.location).not.toContain('code=');
    expect(res.headers.location).not.toContain('state=');
  });

  test('callback is forbidden for roles without marketing:manage', async () => {
    exec();
    const res = await request(app)
      .get('/api/v1/meta-ads/oauth/callback?code=X&state=v1.a.b.c')
      .set('Cookie', 'spaceezy_session=exec-token');
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('oauth=forbidden');
  });

  test('Meta denial redirects to denied without storing anything', async () => {
    admin();
    const res = await request(app)
      .get('/api/v1/meta-ads/oauth/callback?error=access_denied&error_reason=user_denied')
      .set('Cookie', 'spaceezy_session=admin-token');
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('oauth=denied');
    expect(prisma.metaAdsSettings.upsert).not.toHaveBeenCalled();
  });

  test('invalid state fails the callback without reflecting code/state in the URL', async () => {
    admin();
    const res = await request(app)
      .get('/api/v1/meta-ads/oauth/callback?code=SECRET-CODE-123&state=v1.garbage.state.here')
      .set('Cookie', 'spaceezy_session=admin-token');
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('oauth=failed');
    expect(res.headers.location).not.toContain('SECRET-CODE-123');
    expect(prisma.metaAdsSettings.upsert).not.toHaveBeenCalled();
  });

  test('successful callback exchanges the code server-side and stores the token encrypted', async () => {
    admin();
    const authorizeUrl = (await post('/api/v1/meta-ads/oauth/state', {})).body.data.authorizeUrl;
    const state = new URL(authorizeUrl).searchParams.get('state');
    prisma.metaAdsSettings.upsert.mockImplementation(async ({ create }) => ({
      id: 'row-1', createdAt: new Date(), updatedAt: new Date(), ...create,
    }));
    stubGraphRoutes({ access_token: { access_token: 'META-EXCHANGED-TOKEN', expires_in: 3600 } });

    const res = await request(app)
      .get(`/api/v1/meta-ads/oauth/callback?code=SECRET-CODE-123&state=${encodeURIComponent(state)}`)
      .set('Cookie', 'spaceezy_session=admin-token');

    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('oauth=connected');
    expect(res.headers.location).not.toContain('META-EXCHANGED-TOKEN');
    expect(res.headers.location).not.toContain('SECRET-CODE-123');

    const call = prisma.metaAdsSettings.upsert.mock.calls[0][0];
    expect(call.create.accessTokenEnc).toMatch(/^v1\./);
    expect(call.create.accessTokenEnc).not.toContain('META-EXCHANGED-TOKEN');
    const ttlMs = call.create.tokenExpiresAt.getTime() - Date.now();
    expect(ttlMs).toBeGreaterThan(3500 * 1000);
    expect(ttlMs).toBeLessThan(3700 * 1000);

    const actions = prisma.auditLog.create.mock.calls.map((c) => c[0].data.action);
    expect(actions).toContain('meta.settings_updated');
    expect(actions).toContain('meta.oauth_connected');
    // The exchange itself happened server-side in exactly one request.
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(String(global.fetch.mock.calls[0][0])).toContain('oauth/access_token');
  });
});
describe('Phase 1: asset discovery', () => {
  test('ad account discovery maps fields and forwards pagination cursors', async () => {
    admin();
    stubGraphRoutes({
      adaccounts: {
        data: [{ id: 'act_111', name: 'Acme Ads', account_status: 1, currency: 'INR', timezone_name: 'Asia/Kolkata' }],
        paging: { cursors: { after: 'CURSOR9' } },
      },
    });

    const res = await get('/api/v1/meta-ads/ad-accounts?after=CURSOR9');

    expect(res.status).toBe(200);
    expect(res.body.data.items[0]).toMatchObject({ id: 'act_111', name: 'Acme Ads', status: 1, currency: 'INR' });
    expect(res.body.data.paging).toMatchObject({ cursors: { after: 'CURSOR9' } });
    expect(String(global.fetch.mock.calls[0][0])).toContain('after=CURSOR9');
  });

  test('page discovery maps IDs/names and reports Instagram links honestly', async () => {
    admin();
    stubGraphRoutes({
      accounts: {
        data: [
          { id: 'P1', name: 'Page One', category: 'Brand', instagram_business_account: { id: 'IG1' } },
          { id: 'P2', name: 'Page Two' },
        ],
        paging: { cursors: { after: 'PCUR' } },
      },
    });

    const res = await get('/api/v1/meta-ads/pages');

    expect(res.status).toBe(200);
    expect(res.body.data.items).toEqual([
      { id: 'P1', name: 'Page One', category: 'Brand', instagramBusinessAccountId: 'IG1' },
      { id: 'P2', name: 'Page Two', category: null, instagramBusinessAccountId: null },
    ]);
    expect(res.body.data.paging).toMatchObject({ cursors: { after: 'PCUR' } });
  });

  test('discovery without any configured token fails closed (409)', async () => {
    admin();
    delete process.env.META_ACCESS_TOKEN;
    const spy = jest.spyOn(global, 'fetch');

    const res = await get('/api/v1/meta-ads/pages');

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('META_NOT_CONFIGURED');
    expect(spy).not.toHaveBeenCalled();
  });

  test('Instagram discovery: connected, unconnected and inaccessible are all reported', async () => {
    admin();
    stubGraphRoutes({
      accounts: {
        data: [
          { id: 'P1', name: 'Page One', instagram_business_account: { id: 'IG1' } },
          { id: 'P2', name: 'Page Two' },
          { id: 'P3', name: 'Page Three', instagram_business_account: { id: 'IG2' } },
        ],
      },
      IG1: { id: 'IG1', username: 'spaceezy', name: 'SpaceEzy' },
      IG2: { __status: 403, __body: { error: { message: 'Unsupported operation', code: 10 } } },
    });

    const res = await get('/api/v1/meta-ads/instagram-accounts');

    expect(res.status).toBe(200);
    const [one, two, three] = res.body.data.items;
    expect(one).toMatchObject({ pageId: 'P1', instagramAccountId: 'IG1', username: 'spaceezy', available: true });
    expect(two).toMatchObject({ pageId: 'P2', instagramAccountId: null, available: false, reason: 'NOT_CONNECTED' });
    expect(three).toMatchObject({ pageId: 'P3', instagramAccountId: 'IG2', available: false, reason: 'META_PERMISSION_DENIED' });
    expect(res.body.data.errors).toHaveLength(1);
    expect(res.body.data.errors[0]).toMatchObject({ pageId: 'P3', code: 'META_PERMISSION_DENIED' });
  });

  test('sync in db mode records syncedAt on the existing row and audits counts', async () => {
    admin();
    prisma.metaAdsSettings.findUnique.mockResolvedValue(storedRow());
    const syncedAt = new Date('2026-11-10T10:00:00.000Z');
    prisma.metaAdsSettings.update.mockResolvedValue({ syncedAt });
    stubGraphRoutes({ adaccounts: { data: [] }, accounts: { data: [] } });

    const res = await post('/api/v1/meta-ads/settings/sync', {});

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ configSource: 'db', adAccounts: 0, pages: 0, instagramAccounts: 0 });
    expect(res.body.data.syncedAt).toBe(syncedAt.toISOString());
    expect(prisma.metaAdsSettings.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: ORG }, data: { syncedAt: expect.any(Date) } })
    );
    const actions = prisma.auditLog.create.mock.calls.map((c) => c[0].data.action);
    expect(actions).toContain('meta.assets_synced');
  });

  test('sync in env mode never creates a settings row (no silent mode flip)', async () => {
    admin();
    prisma.metaAdsSettings.findUnique.mockResolvedValue(undefined);
    // Plain jest.fn implementations persist across tests here; neutralize the
    // update mock left over from the db-mode sync test above.
    prisma.metaAdsSettings.update.mockResolvedValue(undefined);
    stubGraphRoutes({ adaccounts: { data: [] }, accounts: { data: [] } });

    const res = await post('/api/v1/meta-ads/settings/sync', {});

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ configSource: 'env', syncedAt: null });
    expect(prisma.metaAdsSettings.upsert).not.toHaveBeenCalled();
    expect(prisma.metaAdsSettings.create).toBeUndefined();
  });
});

describe('Phase 1: multi-Page webhook validation', () => {
  test('row pageIds allow-list: each configured Page accepted, unknown Page rejected', async () => {
    prisma.metaAdsSettings.findUnique.mockResolvedValue(
      storedRow({ appSecretEnc: encryptSecret('ROW-WEBHOOK-SECRET', ENC) })
    ); // pageIds = [PAGE_1, PAGE_2], webhook secret = ROW-WEBHOOK-SECRET
    delete process.env.META_PAGE_ID; // isolate from legacy env behavior
    prisma.lead.findFirst.mockResolvedValue(null);
    prisma.lead.create.mockImplementation(async ({ data }) => ({ id: 'lead-new', ...data }));
    prisma.leadActivity.create.mockResolvedValue({});
    stubGraphRoutes({
      '777': leadDetail({ id: '777' }),
      '888': leadDetail({ id: '888' }),
      '557': { id: '557', name: 'Diwali Push' },
    });

    const fromPage1 = await postLeadgen('777', PAGE_1, 'ROW-WEBHOOK-SECRET');
    expect(fromPage1.status).toBe(200);
    expect(fromPage1.body.data).toMatchObject({ processed: 1, failed: 0 });

    const fromPage2 = await postLeadgen('888', PAGE_2, 'ROW-WEBHOOK-SECRET');
    expect(fromPage2.status).toBe(200);
    expect(fromPage2.body.data).toMatchObject({ processed: 1, failed: 0 });

    const unknown = await postLeadgen('999', '999000111', 'ROW-WEBHOOK-SECRET');
    expect(unknown.status).toBe(400);
    expect(unknown.body.code).toBe('PAGE_MISMATCH');

    // Leads land in the primary organization and keep self-claim semantics:
    // status NEW, never auto-assigned (no round-robin in this phase).
    for (const call of prisma.lead.create.mock.calls) {
      expect(call[0].data.organizationId).toBe(ORG);
      expect(call[0].data.status).toBe('NEW');
      expect(call[0].data).not.toHaveProperty('assignedToId');
    }
    expect(prisma.organization.findFirst).toHaveBeenCalledWith({ select: { id: true } });
  });

  test('legacy environment fallback applies only when no settings row exists', async () => {
    prisma.metaAdsSettings.findUnique.mockResolvedValue(undefined);
    process.env.META_PAGE_ID = PAGE_1;
    prisma.lead.findFirst.mockResolvedValue(null);
    prisma.lead.create.mockImplementation(async ({ data }) => ({ id: 'lead-new', ...data }));
    prisma.leadActivity.create.mockResolvedValue({});
    stubGraphRoutes({ '777': leadDetail({ id: '777' }), '557': { id: '557', name: 'Diwali Push' } });

    const legacy = await postLeadgen('777', PAGE_1, 'ENV-WEBHOOK-SECRET');
    expect(legacy.status).toBe(200);
    expect(legacy.body.data).toMatchObject({ processed: 1 });

    const otherPage = await postLeadgen('888', PAGE_2, 'ENV-WEBHOOK-SECRET');
    expect(otherPage.status).toBe(400);
    expect(otherPage.body.code).toBe('PAGE_MISMATCH');
  });

  test('missing settings and no env page config → 503 (unchanged legacy contract)', async () => {
    prisma.metaAdsSettings.findUnique.mockResolvedValue(undefined);
    delete process.env.META_PAGE_ID;
    const spy = jest.spyOn(global, 'fetch');

    const res = await postLeadgen('777', PAGE_1, 'ENV-WEBHOOK-SECRET');

    expect(res.status).toBe(503);
    expect(res.body.message).toBe('Meta Lead Ads is not configured. Set META_PAGE_ID.');
    expect(spy).not.toHaveBeenCalled();
  });

  test('stored-secret decryption failure fails the webhook closed (500, nothing touched)', async () => {
    prisma.metaAdsSettings.findUnique.mockResolvedValue(storedRow({ appSecretEnc: 'v1.broken.envelope.here' }));
    const spy = jest.spyOn(global, 'fetch');

    const res = await postLeadgen('777', PAGE_1, 'ENV-WEBHOOK-SECRET');

    expect(res.status).toBe(500);
    expect(res.body.code).toBe('SETTINGS_DECRYPT_FAILED');
    expect(spy).not.toHaveBeenCalled();
    expect(prisma.lead.create).not.toHaveBeenCalled();
  });

  test('row webhook secret is authoritative: env secret no longer verifies', async () => {
    prisma.metaAdsSettings.findUnique.mockResolvedValue(
      storedRow({ appSecretEnc: encryptSecret('ROW-WEBHOOK-SECRET', ENC) })
    );
    prisma.lead.findFirst.mockResolvedValue(null);
    prisma.lead.create.mockImplementation(async ({ data }) => ({ id: 'lead-new', ...data }));
    prisma.leadActivity.create.mockResolvedValue({});
    stubGraphRoutes({ '777': leadDetail({ id: '777' }), '557': { id: '557', name: 'Diwali Push' } });

    // Signed with the stale environment secret → rejected (env not consulted).
    const withEnvSecret = await postLeadgen('777', PAGE_1, 'ENV-WEBHOOK-SECRET');
    expect(withEnvSecret.status).toBe(401);
    expect(withEnvSecret.body.code).toBe('WEBHOOK_SIGNATURE_INVALID');

    // Signed with the stored secret → accepted.
    const withRowSecret = await postLeadgen('777', PAGE_1, 'ROW-WEBHOOK-SECRET');
    expect(withRowSecret.status).toBe(200);
    expect(withRowSecret.body.data).toMatchObject({ processed: 1 });
  });
});

describe('Phase 1: RBAC on connection settings', () => {
  test('executives are denied on every settings/discovery route (403)', async () => {
    exec();
    const routes = [
      ['get', '/api/v1/meta-ads/settings'],
      ['put', '/api/v1/meta-ads/settings'],
      ['post', '/api/v1/meta-ads/settings/sync'],
      ['post', '/api/v1/meta-ads/oauth/state'],
      ['get', '/api/v1/meta-ads/pages'],
      ['get', '/api/v1/meta-ads/instagram-accounts'],
    ];
    for (const [method, path] of routes) {
      const res = await request(app)[method](path)
        .set('Cookie', 'spaceezy_session=exec-token')
        .send({});
      expect(res.status).toBe(403);
    }
  });

  test('managers can view but cannot change (view 200, manage 403)', async () => {
    manager();
    prisma.metaAdsSettings.findUnique.mockResolvedValue(storedRow());

    const view = await get('/api/v1/meta-ads/settings', 'spaceezy_session=manager-token');
    expect(view.status).toBe(200);

    for (const [method, path, body] of [
      ['put', '/api/v1/meta-ads/settings', { pageIds: [PAGE_1] }],
      ['post', '/api/v1/meta-ads/settings/sync', {}],
      ['post', '/api/v1/meta-ads/oauth/state', {}],
    ]) {
      const res = await request(app)[method](path)
        .set('Cookie', 'spaceezy_session=manager-token')
        .send(body);
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('FORBIDDEN');
    }
    expect(prisma.metaAdsSettings.upsert).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Meta asset discovery fixes: status gating (NO_AD_ACCOUNT_SELECTED instead
// of MISSING_CONFIG for an empty selection), assigned-Instagram primary
// discovery with Page fallback and dedupe, and partial sync
// (Promise.allSettled) that saves successful categories, reports failures
// per category and never fabricates counts or marks a failed category as
// synchronized.
// ---------------------------------------------------------------------------
describe('Meta asset discovery fixes: status, discovery, partial sync', () => {
  test('valid stored token with empty selections → NO_AD_ACCOUNT_SELECTED, act_ probe skipped', async () => {
    admin();
    prisma.metaAdsSettings.findUnique.mockResolvedValue(storedRow({ selectedAdAccountIds: [] }));
    const spy = stubGraphRoutes({
      me: { id: '999', name: 'SpaceEzy' },
      permissions: statusRoutes.permissions,
    });

    const res = await get('/api/v1/meta-ads/status');

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      connected: true,
      reason: 'NO_AD_ACCOUNT_SELECTED',
      missing: ['selectedAdAccountIds'],
      adAccount: null,
      user: { id: '999', name: 'SpaceEzy' },
    });
    // Token and permissions were validated live; the act_{id} call is
    // skipped entirely because there is no selection to probe.
    const urls = spy.mock.calls.map((call) => String(call[0]));
    expect(urls.some((url) => url.includes('/me') && !url.includes('permissions'))).toBe(true);
    expect(urls.some((url) => url.includes('permissions'))).toBe(true);
    expect(urls.some((url) => url.includes('act_'))).toBe(false);
  });

  test('Page discovery works while ad-account discovery is denied (no ads_read)', async () => {
    admin();
    prisma.metaAdsSettings.findUnique.mockResolvedValue(storedRow());
    stubGraphRoutes({
      adaccounts: { __status: 403, __body: { error: { message: 'Missing Permissions', code: 200 } } },
      accounts: { data: [{ id: 'P1', name: 'Page One', category: 'Software' }] },
    });

    const pagesRes = await get('/api/v1/meta-ads/pages');
    expect(pagesRes.status).toBe(200);
    expect(pagesRes.body.data.items).toHaveLength(1);
    expect(pagesRes.body.data.items[0]).toMatchObject({ id: 'P1', name: 'Page One' });

    const adsRes = await get('/api/v1/meta-ads/ad-accounts');
    expect(adsRes.status).toBe(403);
    expect(adsRes.body.success).toBe(false);
    expect(adsRes.body.code).toBe('META_PERMISSION_DENIED');
  });

  test('Instagram discovery: assigned accounts are primary and deduplicated against Page links', async () => {
    admin();
    prisma.metaAdsSettings.findUnique.mockResolvedValue(storedRow());
    stubGraphRoutes({
      assigned_instagram_accounts: { data: [{ id: 'IG1', username: 'spaceezy_' }] },
      accounts: {
        data: [
          { id: 'P1', name: 'Page One', instagram_business_account: { id: 'IG1' } },
          { id: 'P2', name: 'Page Two' },
          { id: 'P3', name: 'Page Three', instagram_business_account: { id: 'IG9' } },
        ],
      },
      IG9: { id: 'IG9', username: 'other_', name: 'Other' },
    });

    const res = await get('/api/v1/meta-ads/instagram-accounts');

    expect(res.status).toBe(200);
    const items = res.body.data.items;
    // One row per account: the assigned spaceezy_ account first, its Page
    // link merged in (not duplicated), then the page-only rows.
    expect(items).toHaveLength(3);
    expect(items.filter((row) => row.instagramAccountId === 'IG1')).toHaveLength(1);
    expect(items[0]).toMatchObject({
      instagramAccountId: 'IG1',
      username: 'spaceezy_',
      pageId: 'P1',
      pageName: 'Page One',
      available: true,
      reason: null,
    });
    expect(items[1]).toMatchObject({ pageId: 'P2', instagramAccountId: null, reason: 'NOT_CONNECTED' });
    expect(items[2]).toMatchObject({ pageId: 'P3', instagramAccountId: 'IG9', username: 'other_', available: true });
    expect(res.body.data.errors).toEqual([]);
  });

  test('Instagram discovery: assigned-endpoint failure falls back to the Page walk', async () => {
    admin();
    prisma.metaAdsSettings.findUnique.mockResolvedValue(storedRow());
    stubGraphRoutes({
      assigned_instagram_accounts: { __status: 403, __body: { error: { message: 'Missing Permissions', code: 200 } } },
      accounts: { data: [{ id: 'P1', name: 'Page One', instagram_business_account: { id: 'IG1' } }] },
      IG1: { id: 'IG1', username: 'spaceezy', name: 'SpaceEzy' },
    });

    const res = await get('/api/v1/meta-ads/instagram-accounts');

    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.items[0]).toMatchObject({
      pageId: 'P1',
      instagramAccountId: 'IG1',
      username: 'spaceezy',
      available: true,
    });
    // The primary-source failure is not a per-account error — the fallback
    // produced a complete, honest result.
    expect(res.body.data.errors).toEqual([]);
  });

  test('partial sync: ad-account 403 saves Pages/Instagram, reports failures, marks nothing synced', async () => {
    admin();
    prisma.metaAdsSettings.findUnique.mockResolvedValue(storedRow());
    prisma.metaAdsSettings.update.mockResolvedValue({ syncedAt: new Date() });
    stubGraphRoutes({
      adaccounts: { __status: 403, __body: { error: { message: 'Missing Permissions', code: 200 } } },
      accounts: { data: [{ id: 'P1', name: 'Page One', instagram_business_account: { id: 'IG1' } }] },
      assigned_instagram_accounts: { data: [{ id: 'IG1', username: 'spaceezy_' }] },
    });

    const res = await post('/api/v1/meta-ads/settings/sync', {});

    expect(res.status).toBe(200);
    expect(res.body.data.partial).toBe(true);
    // Failed category → null (never a fabricated count); successful
    // categories are returned with their real counts.
    expect(res.body.data.adAccounts).toBeNull();
    expect(res.body.data.pages).toBe(1);
    expect(res.body.data.instagramAccounts).toBe(1);
    expect(res.body.data.syncedAt).toBeNull();
    expect(res.body.data.results).toMatchObject({
      adAccounts: { ok: false, count: null, error: { code: 'META_PERMISSION_DENIED' } },
      pages: { ok: true, count: 1, error: null },
      instagramAccounts: { ok: true, count: 1, error: null },
    });
    // A failed category is never marked as synchronized.
    expect(prisma.metaAdsSettings.update).not.toHaveBeenCalled();
    const auditRow = prisma.auditLog.create.mock.calls[0][0].data;
    expect(auditRow.action).toBe('meta.assets_synced');
    expect(auditRow.metadata).toMatchObject({
      partial: true,
      adAccounts: null,
      pages: 1,
      instagramAccounts: 1,
      failures: [{ category: 'adAccounts', code: 'META_PERMISSION_DENIED' }],
    });
  });

  test('full sync success marks syncedAt and reports partial:false with per-category results', async () => {
    admin();
    prisma.metaAdsSettings.findUnique.mockResolvedValue(storedRow());
    const syncedAt = new Date('2026-11-14T10:00:00.000Z');
    prisma.metaAdsSettings.update.mockResolvedValue({ syncedAt });
    stubGraphRoutes({ adaccounts: { data: [] }, accounts: { data: [] } });

    const res = await post('/api/v1/meta-ads/settings/sync', {});

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ partial: false, adAccounts: 0, pages: 0, instagramAccounts: 0 });
    expect(res.body.data.results).toEqual({
      adAccounts: { ok: true, count: 0, error: null },
      pages: { ok: true, count: 0, error: null },
      instagramAccounts: { ok: true, count: 0, error: null },
    });
    expect(res.body.data.syncedAt).toBe(syncedAt.toISOString());
    expect(prisma.metaAdsSettings.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: ORG }, data: { syncedAt: expect.any(Date) } })
    );
  });

  test('sync where every category fails surfaces the error and records nothing', async () => {
    admin();
    prisma.metaAdsSettings.findUnique.mockResolvedValue(storedRow());
    const denied = { __status: 403, __body: { error: { message: 'Missing Permissions', code: 200 } } };
    stubGraphRoutes({
      adaccounts: denied,
      accounts: denied,
      assigned_instagram_accounts: denied,
    });

    const res = await post('/api/v1/meta-ads/settings/sync', {});

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.code).toBe('META_PERMISSION_DENIED');
    expect(prisma.metaAdsSettings.update).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });
});


