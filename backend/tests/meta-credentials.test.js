const request = require('supertest');
const app = require('../src/app');
const prisma = require('../src/db/prisma');
const { encryptSecret, decryptSecret } = require('../src/utils/whatsappSecrets');

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

// Meta Ads credential management (Settings sections A–E): save / rotate /
// remove semantics, AES-256-GCM at rest under META_ADS_SETTINGS_KEY,
// webhook verification + HMAC with STORED credentials, env fallback only
// when no row exists, RBAC, and no secret leakage anywhere.
// All Meta API calls are mocked — nothing here talks to production Meta.

const ORG = '11111111-1111-4111-8111-111111111111';
const PAGE_1 = '111222333444';
const META_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const WRONG_KEY = 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';
const ENC = { keyEnv: 'META_ADS_SETTINGS_KEY', label: 'Meta Ads settings' };

const META_ENV_KEYS = [
  'META_APP_ID', 'META_APP_SECRET', 'META_ACCESS_TOKEN', 'META_AD_ACCOUNT_ID',
  'META_PAGE_ID', 'META_GRAPH_VERSION', 'META_WEBHOOK_VERIFY_TOKEN',
  'META_ADS_SETTINGS_KEY', 'BACKEND_URL', 'FRONTEND_URL', 'SESSION_COOKIE_NAME',
];
let savedMetaEnv;

const mockSession = (role, userId, organizationId = ORG) => {
  prisma.session.findUnique.mockResolvedValue({
    expiresAt: new Date(Date.now() + 60_000),
    user: { id: userId, organizationId, role, status: 'ACTIVE' },
  });
};
const admin = () => mockSession('ADMIN', 'admin-user');
const superAdmin = () => mockSession('SUPER_ADMIN', 'root-user');
const manager = () => mockSession('SALES_MANAGER', 'manager-user');
const exec = () => mockSession('SALES_EXECUTIVE', 'exec-user');

const get = (path, jar = 'admin-token') => request(app).get(path).set('Cookie', `spaceezy_session=${jar}`);
const put = (path, body, jar = 'admin-token') =>
  request(app).put(path).set('Cookie', `spaceezy_session=${jar}`).send(body || {});
const post = (path, body, jar = 'admin-token') =>
  request(app).post(path).set('Cookie', `spaceezy_session=${jar}`).send(body || {});
const del = (path, jar = 'admin-token') =>
  request(app).delete(path).set('Cookie', `spaceezy_session=${jar}`);

// A stored row with all three secrets encrypted under the Meta key.
const storedRow = (overrides = {}) => ({
  id: 'settings-row',
  organizationId: ORG,
  metaAppId: '1234567890',
  accessTokenEnc: encryptSecret('DB-TOKEN-SECRET', ENC),
  appSecretEnc: encryptSecret('ROW-WEBHOOK-SECRET', ENC),
  webhookVerifyTokenEnc: encryptSecret('ROW-VERIFY-TOKEN', ENC),
  selectedAdAccountIds: ['999000'],
  pageIds: [PAGE_1],
  instagramAccountIds: [],
  graphVersion: 'v22.0',
  tokenExpiresAt: null,
  syncedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

// Routes Graph requests by the last URL path segment (same convention as
// meta-ads-phase1). A handler with __status simulates a provider failure.
// An optional "<METHOD> <segment>" key wins over the bare segment, so a test
// can distinguish GET /{app-id}/subscriptions from POST /{app-id}/subscriptions.
const stubGraphRoutes = (routes) =>
  jest.spyOn(global, 'fetch').mockImplementation(async (url, init) => {
    const pathname = new URL(String(url)).pathname;
    const id = pathname.split('/').filter(Boolean).pop() || '';
    const method = String((init && init.method) || 'GET').toUpperCase();
    const handler = routes[`${method} ${id}`] !== undefined ? routes[`${method} ${id}`] : routes[id];
    if (handler === undefined) {
      return { ok: false, status: 404, json: async () => ({ error: { message: `No stub for ${id}`, code: 100 } }) };
    }
    if (handler && handler.__status) {
      return { ok: false, status: handler.__status, json: async () => handler.__body || {} };
    }
    return { ok: true, status: 200, json: async () => handler };
  });

const signWith = (secret, rawBody) =>
  `sha256=${require('crypto').createHmac('sha256', secret).update(rawBody).digest('hex')}`;

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

const leadDetail = () => ({
  id: '777',
  created_time: 1729000000,
  field_data: [
    { name: 'full_name', values: ['Rohit Sharma'] },
    { name: 'phone_number', values: ['+91 90000 12345'] },
  ],
  ad_id: '555', adset_id: '556', campaign_id: '557', form_id: '558',
});

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
  process.env.META_ACCESS_TOKEN = 'ENV-TOKEN-VALUE';
  process.env.META_AD_ACCOUNT_ID = '999000';
  process.env.META_WEBHOOK_VERIFY_TOKEN = 'ENV-VERIFY-TOKEN';
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

describe('Meta credentials: encryption at rest (AES-256-GCM, META_ADS_SETTINGS_KEY)', () => {
  test('round-trips with a fresh IV per operation and never stores plaintext', () => {
    const a = encryptSecret('PLAIN-SECRET', ENC);
    const b = encryptSecret('PLAIN-SECRET', ENC);
    expect(a).toMatch(/^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(a).not.toBe(b); // unique nonce
    expect(a).not.toContain('PLAIN-SECRET');
    expect(decryptSecret(a, ENC)).toBe('PLAIN-SECRET');
  });

  test('wrong encryption key fails closed without leaking material', () => {
    const envelope = encryptSecret('PLAIN-SECRET', ENC);
    const saved = process.env.META_ADS_SETTINGS_KEY;
    process.env.META_ADS_SETTINGS_KEY = WRONG_KEY;
    let message = '';
    try { decryptSecret(envelope, ENC); } catch (err) { message = err.message; }
    expect(message).toContain('cannot be decrypted');
    expect(message).not.toContain('PLAIN-SECRET');
    expect(message).not.toContain(META_KEY);
    process.env.META_ADS_SETTINGS_KEY = saved;
  });

  test('missing META_ADS_SETTINGS_KEY fails closed on encrypt and decrypt', () => {
    delete process.env.META_ADS_SETTINGS_KEY;
    expect(() => encryptSecret('x', ENC)).toThrow('META_ADS_SETTINGS_KEY');
    expect(() => decryptSecret('v1.aaaaaaaaaaaaaaaa.aaaaaaaaaaaaaaaa.aaaaaaaaaaaaaaaa', ENC))
      .toThrow('cannot be decrypted');
  });

  test('wrong key on a stored row throws SETTINGS_DECRYPT_FAILED (no env fallback)', async () => {
    admin();
    prisma.metaAdsSettings.findUnique.mockResolvedValue(storedRow());
    process.env.META_ADS_SETTINGS_KEY = WRONG_KEY;

    const res = await get('/api/v1/meta-ads/settings');
    // GET /settings shows flags only — it must NOT attempt decryption at all.
    expect(res.status).toBe(200);
    expect(res.body.data.hasAccessToken).toBe(true);

    // The effective-config path (used by webhook/tests/sync) fails closed.
    const MetaAdsSettingsService = require('../src/services/metaAdsSettingsService');
    await expect(MetaAdsSettingsService.getEffectiveConfig(ORG))
      .rejects.toMatchObject({ code: 'SETTINGS_DECRYPT_FAILED' });
  });
});

describe('Meta credentials: save semantics (Section E)', () => {
  test('each credential can be saved individually (one column at a time)', async () => {
    admin();
    // Cumulative row: later saves must see earlier stored columns (like a
    // real upsert against the database).
    let rowState = { id: 'row-1', organizationId: ORG, createdAt: new Date(), updatedAt: new Date() };
    prisma.metaAdsSettings.upsert.mockImplementation(async ({ create, update }) => {
      rowState = { ...rowState, ...create, ...update, updatedAt: new Date() };
      return rowState;
    });

    const tokenRes = await put('/api/v1/meta-ads/settings', { accessToken: 'FIRST-TOKEN' });
    expect(tokenRes.status).toBe(200);
    let call = prisma.metaAdsSettings.upsert.mock.calls[0][0];
    expect(call.create.accessTokenEnc).toMatch(/^v1\./);
    expect(call.create).not.toHaveProperty('appSecretEnc');
    expect(call.create).not.toHaveProperty('webhookVerifyTokenEnc');
    expect(tokenRes.body.data).toMatchObject({ hasAccessToken: true, hasAppSecret: false, hasWebhookVerifyToken: false });

    const secretRes = await put('/api/v1/meta-ads/settings', { appSecret: 'FIRST-SECRET' });
    expect(secretRes.status).toBe(200);
    call = prisma.metaAdsSettings.upsert.mock.calls[1][0];
    expect(call.create.appSecretEnc).toMatch(/^v1\./);
    expect(call.create).not.toHaveProperty('accessTokenEnc');

    const verifyRes = await put('/api/v1/meta-ads/settings', { webhookVerifyToken: 'FIRST-VERIFY' });
    expect(verifyRes.status).toBe(200);
    call = prisma.metaAdsSettings.upsert.mock.calls[2][0];
    expect(call.create.webhookVerifyTokenEnc).toMatch(/^v1\./);
    expect(call.create).not.toHaveProperty('accessTokenEnc');
    expect(verifyRes.body.data).toMatchObject({ hasAccessToken: true, hasAppSecret: true, hasWebhookVerifyToken: true });

    // Plain-text Meta App ID (public OAuth metadata) is stored as-is.
    const appIdRes = await put('/api/v1/meta-ads/settings', { metaAppId: '987654321098765' });
    expect(appIdRes.status).toBe(200);
    expect(appIdRes.body.data.metaAppId).toBe('987654321098765');
  });

  test('all credentials can be saved together in one request', async () => {
    admin();
    prisma.metaAdsSettings.upsert.mockImplementation(async ({ create, update }) => ({
      id: 'row-1', organizationId: ORG, createdAt: new Date(), updatedAt: new Date(), ...create, ...update,
    }));

    const res = await put('/api/v1/meta-ads/settings', {
      metaAppId: '555555555555555',
      accessToken: 'ALL-TOKEN',
      appSecret: 'ALL-SECRET',
      webhookVerifyToken: 'ALL-VERIFY',
      graphVersion: 'v23.0',
      pageIds: [PAGE_1],
    });

    expect(res.status).toBe(200);
    const call = prisma.metaAdsSettings.upsert.mock.calls[0][0];
    expect(call.create.accessTokenEnc).toMatch(/^v1\./);
    expect(call.create.appSecretEnc).toMatch(/^v1\./);
    expect(call.create.webhookVerifyTokenEnc).toMatch(/^v1\./);
    expect(call.create.metaAppId).toBe('555555555555555');
    expect(call.create.graphVersion).toBe('v23.0');
    for (const column of ['accessTokenEnc', 'appSecretEnc', 'webhookVerifyTokenEnc']) {
      expect(call.create[column]).not.toContain('ALL-TOKEN');
      expect(call.create[column]).not.toContain('ALL-SECRET');
      expect(call.create[column]).not.toContain('ALL-VERIFY');
    }
    expect(res.body.data).toMatchObject({
      metaAppId: '555555555555555',
      hasAccessToken: true, hasAppSecret: true, hasWebhookVerifyToken: true,
    });
    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toContain('ALL-TOKEN');
    expect(serialized).not.toContain('ALL-SECRET');
    expect(serialized).not.toContain('ALL-VERIFY');
  });

  test('blank secret fields retain the previously saved credentials', async () => {
    admin();
    prisma.metaAdsSettings.upsert.mockImplementation(async ({ create, update }) => ({
      id: 'row-1', organizationId: ORG, createdAt: new Date(), updatedAt: new Date(), ...create, ...update,
    }));
    await put('/api/v1/meta-ads/settings', { accessToken: 'KEEP-ME-TOKEN', appSecret: 'KEEP-ME-SECRET' });
    prisma.metaAdsSettings.upsert.mockClear();

    // Blank (and absent) secrets on a later save must not touch stored values.
    const res = await put('/api/v1/meta-ads/settings', { accessToken: '', appSecret: '', pageIds: [PAGE_1] });

    expect(res.status).toBe(200);
    const call = prisma.metaAdsSettings.upsert.mock.calls[0][0];
    expect(call.update).not.toHaveProperty('accessTokenEnc');
    expect(call.update).not.toHaveProperty('appSecretEnc');
    expect(call.update).not.toHaveProperty('webhookVerifyTokenEnc');
    expect(JSON.stringify(call)).not.toContain('KEEP-ME-TOKEN');
    expect(JSON.stringify(call)).not.toContain('KEEP-ME-SECRET');

    // The stored credentials are still there and still decryptable.
    prisma.metaAdsSettings.findUnique.mockResolvedValue(storedRow({
      accessTokenEnc: encryptSecret('KEEP-ME-TOKEN', ENC),
      appSecretEnc: encryptSecret('KEEP-ME-SECRET', ENC),
      webhookVerifyTokenEnc: null,
    }));
    const MetaAdsSettingsService = require('../src/services/metaAdsSettingsService');
    const eff = await MetaAdsSettingsService.getEffectiveConfig(ORG);
    expect(eff.accessToken).toBe('KEEP-ME-TOKEN');
    expect(eff.appSecret).toBe('KEEP-ME-SECRET');
  });

  test('GET settings returns masked flags only — never values, ciphertext or *Enc columns', async () => {
    admin();
    prisma.metaAdsSettings.findUnique.mockResolvedValue(storedRow());

    const res = await get('/api/v1/meta-ads/settings');

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      source: 'db',
      configured: true,
      hasAccessToken: true,
      hasAppSecret: true,
      hasWebhookVerifyToken: true,
      metaAppId: '1234567890',
      webhookCallbackUrl: 'http://localhost:8000/api/v1/webhooks/meta/leadgen',
    });
    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toContain('DB-TOKEN-SECRET');
    expect(serialized).not.toContain('ROW-WEBHOOK-SECRET');
    expect(serialized).not.toContain('ROW-VERIFY-TOKEN');
    expect(serialized).not.toMatch(/accessTokenEnc|appSecretEnc|webhookVerifyTokenEnc/);
    expect(serialized).not.toMatch(/"[^"]*v1\.[^"]*"/);
  });
});

describe('Meta credentials: rotate and remove (Section E)', () => {
  test('rotate replaces one credential, audits the field name only, and requires a value', async () => {
    admin();
    prisma.metaAdsSettings.findUnique.mockResolvedValue(storedRow());
    prisma.metaAdsSettings.update.mockResolvedValue(storedRow());

    // Empty value → 400 before any write.
    const empty = await post('/api/v1/meta-ads/settings/rotate', { field: 'accessToken', value: '' });
    expect(empty.status).toBe(400);
    expect(prisma.metaAdsSettings.update).not.toHaveBeenCalled();

    const res = await post('/api/v1/meta-ads/settings/rotate', { field: 'accessToken', value: 'ROTATED-TOKEN' });

    expect(res.status).toBe(200);
    const updateCall = prisma.metaAdsSettings.update.mock.calls[0][0];
    expect(updateCall.data.accessTokenEnc).toMatch(/^v1\./);
    expect(updateCall.data.accessTokenEnc).not.toContain('ROTATED-TOKEN');
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'meta.secret_rotated' }) })
    );
    const auditMeta = JSON.stringify(prisma.auditLog.create.mock.calls[0][0].data);
    expect(auditMeta).toContain('accessToken'); // field name
    expect(auditMeta).not.toContain('ROTATED-TOKEN'); // never the value
    expect(res.body.data.hasAccessToken).toBe(true);
  });

  test('rotate rejects unknown fields (400) and missing rows (404)', async () => {
    admin();
    prisma.metaAdsSettings.findUnique.mockResolvedValue(null);

    const unknown = await post('/api/v1/meta-ads/settings/rotate', { field: 'nope', value: 'x' });
    expect(unknown.status).toBe(400); // validator enum

    const missing = await post('/api/v1/meta-ads/settings/rotate', { field: 'appSecret', value: 'x' });
    expect(missing.status).toBe(404);
    expect(prisma.metaAdsSettings.update).not.toHaveBeenCalled();
  });

  test('remove explicitly nulls one credential, audits it, and flips its flag', async () => {
    admin();
    prisma.metaAdsSettings.findUnique
      .mockResolvedValueOnce(storedRow())
      .mockResolvedValue(storedRow({ accessTokenEnc: null }));
    prisma.metaAdsSettings.update.mockResolvedValue({});

    const res = await del('/api/v1/meta-ads/settings/secrets/accessToken');

    expect(res.status).toBe(200);
    expect(prisma.metaAdsSettings.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: ORG }, data: { accessTokenEnc: null } })
    );
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'meta.secret_removed' }) })
    );
    const auditMeta = JSON.stringify(prisma.auditLog.create.mock.calls[0][0].data);
    expect(auditMeta).toContain('accessToken');
    expect(res.body.data).toMatchObject({ hasAccessToken: false, hasAppSecret: true, hasWebhookVerifyToken: true });
  });

  test('remove rejects unknown fields (400) and missing rows (404)', async () => {
    admin();
    prisma.metaAdsSettings.findUnique.mockResolvedValue(null);

    const unknown = await del('/api/v1/meta-ads/settings/secrets/bogus');
    expect(unknown.status).toBe(400);

    const missing = await del('/api/v1/meta-ads/settings/secrets/appSecret');
    expect(missing.status).toBe(404);
    expect(prisma.metaAdsSettings.update).not.toHaveBeenCalled();
  });

  test('blank save can never remove a credential — only the explicit DELETE can', async () => {
    admin();
    prisma.metaAdsSettings.upsert.mockImplementation(async ({ create, update }) => ({
      id: 'row-1', organizationId: ORG, createdAt: new Date(), updatedAt: new Date(), ...create, ...update,
    }));

    await put('/api/v1/meta-ads/settings', { accessToken: 'X-TOKEN' });
    const blank = await put('/api/v1/meta-ads/settings', { accessToken: '' });

    expect(blank.status).toBe(200);
    const call = prisma.metaAdsSettings.upsert.mock.calls[1][0];
    expect(call.update).not.toHaveProperty('accessTokenEnc');
    expect(prisma.metaAdsSettings.update).not.toHaveBeenCalled();
  });
});

describe('Meta credentials: webhook verification with stored credentials (Section B)', () => {
  test('stored verify token verifies; the env token is rejected when a row exists', async () => {
    prisma.metaAdsSettings.findUnique.mockResolvedValue(storedRow());

    const ok = await request(app)
      .get('/api/v1/webhooks/meta/leadgen?hub.mode=subscribe&hub.verify_token=ROW-VERIFY-TOKEN&hub.challenge=777');
    expect(ok.status).toBe(200);
    expect(ok.text).toBe('777');

    // Row is authoritative: the legacy env token no longer verifies.
    const envTry = await request(app)
      .get('/api/v1/webhooks/meta/leadgen?hub.mode=subscribe&hub.verify_token=ENV-VERIFY-TOKEN&hub.challenge=777');
    expect(envTry.status).toBe(403);

    const wrong = await request(app)
      .get('/api/v1/webhooks/meta/leadgen?hub.mode=subscribe&hub.verify_token=nope&hub.challenge=777');
    expect(wrong.status).toBe(403);
    expect(wrong.body.code).toBe('WEBHOOK_VERIFY_FAILED');
  });

  test('env fallback applies only when no settings row exists', async () => {
    prisma.metaAdsSettings.findUnique.mockResolvedValue(undefined);

    const ok = await request(app)
      .get('/api/v1/webhooks/meta/leadgen?hub.mode=subscribe&hub.verify_token=ENV-VERIFY-TOKEN&hub.challenge=999');
    expect(ok.status).toBe(200);
    expect(ok.text).toBe('999');

    const wrong = await request(app)
      .get('/api/v1/webhooks/meta/leadgen?hub.mode=subscribe&hub.verify_token=ROW-VERIFY-TOKEN&hub.challenge=999');
    expect(wrong.status).toBe(403);
  });

  test('row exists but no stored verify token → always 403 (no env fallback)', async () => {
    prisma.metaAdsSettings.findUnique.mockResolvedValue(storedRow({ webhookVerifyTokenEnc: null }));

    const res = await request(app)
      .get('/api/v1/webhooks/meta/leadgen?hub.mode=subscribe&hub.verify_token=ENV-VERIFY-TOKEN&hub.challenge=777');
    expect(res.status).toBe(403);
  });

  test('decryption failure fails closed: verification returns 403, never falls back to env', async () => {
    prisma.metaAdsSettings.findUnique.mockResolvedValue(storedRow({ webhookVerifyTokenEnc: 'v1.broken.envelope.here' }));

    const res = await request(app)
      .get('/api/v1/webhooks/meta/leadgen?hub.mode=subscribe&hub.verify_token=ENV-VERIFY-TOKEN&hub.challenge=777');
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('WEBHOOK_VERIFY_FAILED');
  });

  test('HMAC-SHA256 uses the STORED App Secret: env secret no longer verifies', async () => {
    prisma.metaAdsSettings.findUnique.mockResolvedValue(storedRow()); // secret = ROW-WEBHOOK-SECRET
    prisma.lead.findFirst.mockResolvedValue(null);
    prisma.lead.create.mockImplementation(async ({ data }) => ({ id: 'lead-new', ...data }));
    prisma.leadActivity.create.mockResolvedValue({});
    stubGraphRoutes({ '777': leadDetail(), '557': { id: '557', name: 'Campaign' } });

    const stale = await postLeadgen('777', PAGE_1, 'ENV-WEBHOOK-SECRET');
    expect(stale.status).toBe(401);
    expect(stale.body.code).toBe('WEBHOOK_SIGNATURE_INVALID');
    expect(prisma.lead.create).not.toHaveBeenCalled();

    const good = await postLeadgen('777', PAGE_1, 'ROW-WEBHOOK-SECRET');
    expect(good.status).toBe(200);
    expect(good.body.data).toMatchObject({ processed: 1 });
  });

  test('HMAC falls back to the env App Secret only when no row exists', async () => {
    prisma.metaAdsSettings.findUnique.mockResolvedValue(undefined);
    process.env.META_PAGE_ID = PAGE_1;
    prisma.lead.findFirst.mockResolvedValue(null);
    prisma.lead.create.mockImplementation(async ({ data }) => ({ id: 'lead-new', ...data }));
    prisma.leadActivity.create.mockResolvedValue({});
    stubGraphRoutes({ '777': leadDetail(), '557': { id: '557', name: 'Campaign' } });

    const stale = await postLeadgen('777', PAGE_1, 'ROW-WEBHOOK-SECRET');
    expect(stale.status).toBe(401);

    const good = await postLeadgen('777', PAGE_1, 'ENV-WEBHOOK-SECRET');
    expect(good.status).toBe(200);
    expect(good.body.data).toMatchObject({ processed: 1 });
  });
});

describe('Meta credentials: connection testing with mocked Meta (Section D)', () => {
  test('test-connection succeeds with a stored token and reports provider errors honestly', async () => {
    admin();
    prisma.metaAdsSettings.findUnique.mockResolvedValue(storedRow());
    stubGraphRoutes({ me: { id: '999', name: 'SpaceEzy' } });

    const ok = await post('/api/v1/meta-ads/settings/test-connection', {});
    expect(ok.status).toBe(200);
    expect(ok.body.data.ok).toBe(true);
    expect(ok.body.data.message).toContain('SpaceEzy');

    // The token travels only in the Authorization header, never in a URL.
    const [url, init] = global.fetch.mock.calls[0];
    expect(String(url)).not.toContain('DB-TOKEN-SECRET');
    expect(init.headers.Authorization).toBe('Bearer DB-TOKEN-SECRET');

    // Provider failure → HTTP 200 with a meaningful, display-safe envelope.
    stubGraphRoutes({ me: { __status: 500, __body: { error: { message: 'boom', code: 2 } } } });
    const fail = await post('/api/v1/meta-ads/settings/test-connection', {});
    expect(fail.status).toBe(200);
    expect(fail.body.data.ok).toBe(false);
    expect(fail.body.data.code).toBe('META_API_ERROR');
    expect(JSON.stringify(fail.body)).not.toContain('DB-TOKEN-SECRET');

    const audited = prisma.auditLog.create.mock.calls.map((c) => c[0].data);
    expect(audited.some((a) => a.action === 'meta.connection_tested')).toBe(true);
    expect(JSON.stringify(audited)).not.toContain('DB-TOKEN-SECRET');
  });

  test('test-connection without any token → 409 META_NOT_CONFIGURED', async () => {
    admin();
    prisma.metaAdsSettings.findUnique.mockResolvedValue(storedRow({ accessTokenEnc: null }));
    const spy = jest.spyOn(global, 'fetch');

    const res = await post('/api/v1/meta-ads/settings/test-connection', {});

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('META_NOT_CONFIGURED');
    expect(spy).not.toHaveBeenCalled();
  });

  test('test-token validates via a header-only call and classifies an invalid token', async () => {
    admin();
    prisma.metaAdsSettings.findUnique.mockResolvedValue(storedRow());
    stubGraphRoutes({ me: { id: '999' } });

    const ok = await post('/api/v1/meta-ads/settings/test-token', {});
    expect(ok.status).toBe(200);
    expect(ok.body.data.ok).toBe(true);
    const [url] = global.fetch.mock.calls[0];
    expect(String(url)).not.toContain('DB-TOKEN-SECRET');
    expect(String(url)).not.toContain('input_token');

    stubGraphRoutes({ me: { __status: 401, __body: { error: { message: 'expired', code: 190 } } } });
    const invalid = await post('/api/v1/meta-ads/settings/test-token', {});
    expect(invalid.status).toBe(200);
    expect(invalid.body.data).toMatchObject({ ok: false, code: 'META_TOKEN_INVALID' });
  });

  test('test-permissions reports granted, missing-required and missing-recommended sets', async () => {
    admin();
    prisma.metaAdsSettings.findUnique.mockResolvedValue(storedRow());
    stubGraphRoutes({ permissions: { data: [
      { permission: 'ads_read', status: 'granted' },
      { permission: 'pages_show_list', status: 'granted' },
    ] } });

    const ok = await post('/api/v1/meta-ads/settings/test-permissions', {});
    expect(ok.status).toBe(200);
    expect(ok.body.data.ok).toBe(true);
    expect(ok.body.data.granted).toEqual(['ads_read', 'pages_show_list']);
    expect(ok.body.data.missingRequired).toEqual([]);
    expect(ok.body.data.missingRecommended).toEqual(
      expect.arrayContaining(['leads_retrieval', 'instagram_basic'])
    );

    stubGraphRoutes({ permissions: { data: [{ permission: 'pages_show_list', status: 'granted' }] } });
    const missing = await post('/api/v1/meta-ads/settings/test-permissions', {});
    expect(missing.status).toBe(200);
    expect(missing.body.data.ok).toBe(false);
    expect(missing.body.data.code).toBe('META_PERMISSIONS_MISSING');
    expect(missing.body.data.missingRequired).toContain('ads_read');
  });

  test('test-webhook runs the local HMAC self-test and best-effort subscription check', async () => {
    admin();
    prisma.metaAdsSettings.findUnique.mockResolvedValue(storedRow());
    // Real Meta shape: leadgen is a FIELD of the `page` object — never an
    // `object: 'leadgen'` row (the old check looked for that and always
    // reported "not subscribed" on a correctly configured app).
    stubGraphRoutes({ subscriptions: { data: [{
      object: 'page',
      callback_url: 'http://localhost:8000/api/v1/webhooks/meta/leadgen',
      active: true,
      fields: [{ name: 'messages', version: 'v22.0' }, { name: 'leadgen', version: 'v22.0' }],
    }] } });

    const res = await post('/api/v1/meta-ads/settings/test-webhook', {});

    expect(res.status).toBe(200);
    expect(res.body.data.ok).toBe(true);
    expect(res.body.data.hmac.ok).toBe(true);
    expect(res.body.data.callbackUrl).toBe('http://localhost:8000/api/v1/webhooks/meta/leadgen');
    expect(res.body.data.subscription).toMatchObject({ status: 'active' });
    expect(res.body.data.subscription.fields).toContain('leadgen');

    // App token (appId|appSecret) goes in the Authorization header only.
    const [url, init] = global.fetch.mock.calls[0];
    expect(String(url)).not.toContain('ROW-WEBHOOK-SECRET');
    expect(String(url)).not.toContain('ROW-VERIFY-TOKEN');
    expect(init.headers.Authorization).toBe('Bearer 1234567890|ROW-WEBHOOK-SECRET');
    expect(JSON.stringify(res.body)).not.toContain('ROW-WEBHOOK-SECRET');
    expect(JSON.stringify(res.body)).not.toContain('ROW-VERIFY-TOKEN');
  });

  test('test-webhook reports a page subscription without leadgen as not_subscribed', async () => {
    admin();
    prisma.metaAdsSettings.findUnique.mockResolvedValue(storedRow());
    stubGraphRoutes({ subscriptions: { data: [{
      object: 'page',
      callback_url: 'http://localhost:8000/api/v1/webhooks/meta/leadgen',
      active: true,
      fields: [{ name: 'messages', version: 'v22.0' }],
    }] } });

    const res = await post('/api/v1/meta-ads/settings/test-webhook', {});

    expect(res.status).toBe(200);
    expect(res.body.data.subscription.status).toBe('not_subscribed');
  });

  test('test-webhook reports a different Meta callback URL as callback_mismatch', async () => {
    admin();
    prisma.metaAdsSettings.findUnique.mockResolvedValue(storedRow());
    stubGraphRoutes({ subscriptions: { data: [{
      object: 'page',
      callback_url: 'https://elsewhere.example.com/api/v1/webhooks/meta/leadgen',
      active: true,
      fields: [{ name: 'leadgen', version: 'v22.0' }],
    }] } });

    const res = await post('/api/v1/meta-ads/settings/test-webhook', {});

    expect(res.status).toBe(200);
    expect(res.body.data.subscription.status).toBe('callback_mismatch');
    expect(res.body.data.subscription.metaCallbackUrl).toBe('https://elsewhere.example.com/api/v1/webhooks/meta/leadgen');
  });

  test('subscribe-webhook writes the app subscription and the selected Page subscription', async () => {
    admin();
    prisma.metaAdsSettings.findUnique.mockResolvedValue(storedRow());
    stubGraphRoutes({
      'POST subscriptions': { success: true },
      'GET subscriptions': { data: [{
        object: 'page',
        callback_url: 'http://localhost:8000/api/v1/webhooks/meta/leadgen',
        active: true,
        fields: [{ name: 'leadgen', version: 'v22.0' }],
      }] },
      'POST subscribed_apps': { success: true },
    });

    const res = await post('/api/v1/meta-ads/settings/subscribe-webhook', {});

    expect(res.status).toBe(200);
    expect(res.body.data.ok).toBe(true);
    expect(res.body.data.subscription.status).toBe('active');
    expect(res.body.data.pages).toEqual([{ pageId: PAGE_1, ok: true }]);

    const calls = global.fetch.mock.calls.map(([url, init]) => ({
      url: String(url),
      pathname: new URL(String(url)).pathname,
      method: String((init && init.method) || 'GET').toUpperCase(),
      auth: init.headers.Authorization,
      params: new URL(String(url)).searchParams,
    }));
    const appWrite = calls.find((call) => call.method === 'POST' && call.pathname.endsWith('/1234567890/subscriptions'));
    expect(appWrite).toBeTruthy();
    expect(appWrite.auth).toBe('Bearer 1234567890|ROW-WEBHOOK-SECRET');
    expect(appWrite.params.get('object')).toBe('page');
    expect(appWrite.params.get('fields')).toBe('leadgen');
    expect(appWrite.params.get('verify_token')).toBe('ROW-VERIFY-TOKEN');
    expect(appWrite.params.get('callback_url')).toBe('http://localhost:8000/api/v1/webhooks/meta/leadgen');

    const pageWrite = calls.find((call) => call.method === 'POST' && call.pathname.endsWith(`/${PAGE_1}/subscribed_apps`));
    expect(pageWrite).toBeTruthy();
    expect(pageWrite.auth).toBe('Bearer DB-TOKEN-SECRET');
    expect(pageWrite.params.get('subscribed_fields')).toBe('leadgen');
    expect(JSON.stringify(res.body)).not.toContain('ROW-WEBHOOK-SECRET');
    expect(JSON.stringify(res.body)).not.toContain('DB-TOKEN-SECRET');
  });

  test('subscribe-webhook without an app secret → 409 META_NOT_CONFIGURED and no Meta write', async () => {
    admin();
    prisma.metaAdsSettings.findUnique.mockResolvedValue(storedRow({ appSecretEnc: null }));
    const spy = jest.spyOn(global, 'fetch');

    const res = await post('/api/v1/meta-ads/settings/subscribe-webhook', {});

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('META_NOT_CONFIGURED');
    expect(spy).not.toHaveBeenCalled();
  });

  test('test-webhook without a saved verify token or app secret → 409 META_NOT_CONFIGURED', async () => {
    admin();
    prisma.metaAdsSettings.findUnique.mockResolvedValue(
      storedRow({ webhookVerifyTokenEnc: null, appSecretEnc: null })
    );
    const spy = jest.spyOn(global, 'fetch');

    const res = await post('/api/v1/meta-ads/settings/test-webhook', {});

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('META_NOT_CONFIGURED');
    expect(spy).not.toHaveBeenCalled();
  });

  test('subscription lookup unverifiable → reported honestly, test still passes on HMAC', async () => {
    admin();
    prisma.metaAdsSettings.findUnique.mockResolvedValue(storedRow());
    stubGraphRoutes({ subscriptions: { __status: 403, __body: { error: { message: 'denied', code: 200 } } } });

    const res = await post('/api/v1/meta-ads/settings/test-webhook', {});

    expect(res.status).toBe(200);
    expect(res.body.data.ok).toBe(true);
    expect(res.body.data.hmac.ok).toBe(true);
    expect(res.body.data.subscription.status).toBeNull();
    expect(res.body.data.subscription.reason).toBeTruthy();
  });
});

describe('Meta credentials: RBAC (Section 5)', () => {
  test('executives are denied on every credential route (403)', async () => {
    exec();
    const routes = [
      ['get', '/api/v1/meta-ads/settings', undefined],
      ['put', '/api/v1/meta-ads/settings', { accessToken: 'x' }],
      ['post', '/api/v1/meta-ads/settings/rotate', { field: 'accessToken', value: 'x' }],
      ['delete', '/api/v1/meta-ads/settings/secrets/accessToken', undefined],
      ['post', '/api/v1/meta-ads/settings/test-connection', {}],
      ['post', '/api/v1/meta-ads/settings/test-token', {}],
      ['post', '/api/v1/meta-ads/settings/test-permissions', {}],
      ['post', '/api/v1/meta-ads/settings/test-webhook', {}],
    ];
    for (const [method, path, body] of routes) {
      const res = await request(app)[method](path)
        .set('Cookie', 'spaceezy_session=exec-token')
        .send(body || {});
      expect(res.status).toBe(403);
    }
    expect(prisma.metaAdsSettings.upsert).not.toHaveBeenCalled();
    expect(prisma.metaAdsSettings.update).not.toHaveBeenCalled();
  });

  test('marketing:view can read masked status but cannot modify (view 200, write 403)', async () => {
    manager();
    prisma.metaAdsSettings.findUnique.mockResolvedValue(storedRow());

    const view = await get('/api/v1/meta-ads/settings', 'manager-token');
    expect(view.status).toBe(200);
    expect(view.body.data.hasAccessToken).toBe(true);

    for (const [method, path, body] of [
      ['put', '/api/v1/meta-ads/settings', { accessToken: 'x' }],
      ['post', '/api/v1/meta-ads/settings/rotate', { field: 'accessToken', value: 'x' }],
      ['delete', '/api/v1/meta-ads/settings/secrets/accessToken', undefined],
      ['post', '/api/v1/meta-ads/settings/test-connection', {}],
    ]) {
      const res = await request(app)[method](path)
        .set('Cookie', 'spaceezy_session=manager-token')
        .send(body || {});
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('FORBIDDEN');
    }
    expect(prisma.metaAdsSettings.upsert).not.toHaveBeenCalled();
    expect(prisma.metaAdsSettings.update).not.toHaveBeenCalled();
  });

  test('ADMIN and SUPER_ADMIN can manage credentials', async () => {
    prisma.metaAdsSettings.findUnique.mockResolvedValue(storedRow());
    prisma.metaAdsSettings.update.mockResolvedValue(storedRow());
    prisma.metaAdsSettings.upsert.mockResolvedValue(storedRow());

    superAdmin();
    const rotate = await post('/api/v1/meta-ads/settings/rotate', { field: 'appSecret', value: 'NEW' });
    expect(rotate.status).toBe(200);

    admin();
    const save = await put('/api/v1/meta-ads/settings', { pageIds: [PAGE_1] });
    expect(save.status).toBe(200);

    const remove = await del('/api/v1/meta-ads/settings/secrets/webhookVerifyToken');
    expect(remove.status).toBe(200);
  });
});

describe('Meta credentials: no secret leakage (Section 7)', () => {
  test('responses, audit records and logs never contain a credential value', async () => {
    admin();
    prisma.metaAdsSettings.findUnique.mockResolvedValue(storedRow());
    prisma.metaAdsSettings.update.mockResolvedValue(storedRow());
    prisma.metaAdsSettings.upsert.mockResolvedValue(storedRow());
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    stubGraphRoutes({ me: { id: '999', name: 'SpaceEzy' } });

    const responses = [
      await get('/api/v1/meta-ads/settings'),
      await get('/api/v1/meta-ads/status'),
      await post('/api/v1/meta-ads/settings/rotate', { field: 'accessToken', value: 'ROTATED-VALUE' }),
      await del('/api/v1/meta-ads/settings/secrets/appSecret'),
      await post('/api/v1/meta-ads/settings/test-connection', {}),
      await post('/api/v1/meta-ads/settings/test-token', {}),
      await post('/api/v1/meta-ads/settings/test-webhook', {}),
    ];

    const secrets = ['DB-TOKEN-SECRET', 'ROW-WEBHOOK-SECRET', 'ROW-VERIFY-TOKEN', 'ROTATED-VALUE',
      'ENV-TOKEN-VALUE', 'ENV-WEBHOOK-SECRET', 'ENV-VERIFY-TOKEN', META_KEY];
    for (const res of responses) {
      const serialized = JSON.stringify(res.body);
      for (const secret of secrets) {
        expect(serialized).not.toContain(secret);
      }
    }

    const auditSerialized = JSON.stringify(prisma.auditLog.create.mock.calls.map((c) => c[0].data));
    for (const secret of secrets) {
      expect(auditSerialized).not.toContain(secret);
    }
    expect(auditSerialized).not.toMatch(/"[^"]*v1\.[^"]*"/);

    for (const spy of [logSpy, warnSpy, errSpy]) {
      for (const callArgs of spy.mock.calls) {
        const logged = JSON.stringify(callArgs);
        for (const secret of secrets) {
          expect(logged).not.toContain(secret);
        }
      }
    }
  });

  test('error envelopes from provider failures never echo a credential', async () => {
    admin();
    prisma.metaAdsSettings.findUnique.mockResolvedValue(storedRow());
    stubGraphRoutes({ me: { __status: 500, __body: { error: { message: 'DB-TOKEN-SECRET leaked? no', code: 2 } } } });

    const res = await post('/api/v1/meta-ads/settings/test-connection', {});

    expect(res.status).toBe(200);
    expect(res.body.data.ok).toBe(false);
    // The provider message may surface, but never a stored credential.
    expect(JSON.stringify(res.body)).not.toContain('ROW-WEBHOOK-SECRET');
    expect(JSON.stringify(res.body)).not.toContain('ROW-VERIFY-TOKEN');
    expect(JSON.stringify(res.body)).not.toMatch(/"[^"]*v1\.[^"]*"/);
  });

  test('audit records for save/rotate/remove/test contain field names and codes only', async () => {
    admin();
    prisma.metaAdsSettings.findUnique.mockResolvedValue(storedRow());
    prisma.metaAdsSettings.update.mockResolvedValue(storedRow());
    prisma.metaAdsSettings.upsert.mockImplementation(async ({ create, update }) => ({
      id: 'row-1', organizationId: ORG, createdAt: new Date(), updatedAt: new Date(), ...create, ...update,
    }));
    stubGraphRoutes({ me: { id: '999', name: 'SpaceEzy' } });

    await put('/api/v1/meta-ads/settings', { accessToken: 'SAVE-VALUE' });
    await post('/api/v1/meta-ads/settings/rotate', { field: 'appSecret', value: 'ROTATE-VALUE' });
    await del('/api/v1/meta-ads/settings/secrets/webhookVerifyToken');
    await post('/api/v1/meta-ads/settings/test-connection', {});

    const actions = prisma.auditLog.create.mock.calls.map((c) => c[0].data.action);
    expect(actions).toEqual(expect.arrayContaining([
      'meta.settings_updated', 'meta.secret_rotated', 'meta.secret_removed', 'meta.connection_tested',
    ]));

    const serialized = JSON.stringify(prisma.auditLog.create.mock.calls.map((c) => c[0].data));
    expect(serialized).toContain('accessToken'); // field name is fine
    expect(serialized).not.toContain('SAVE-VALUE');
    expect(serialized).not.toContain('ROTATE-VALUE');
    expect(serialized).not.toContain('DB-TOKEN-SECRET');
  });
});
