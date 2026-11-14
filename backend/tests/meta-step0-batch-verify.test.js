const fs = require('fs');
const crypto = require('crypto');
const request = require('supertest');
const app = require('../src/app');
const prisma = require('../src/db/prisma');

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

// Step 0 hardening: per-entry webhook batch isolation + timing-safe Meta
// verification handshake. Batch cases run through the real HTTP webhook
// exactly like phase12 does; verify cases hit the GET handshake.

const ORG = '11111111-1111-4111-8111-111111111111';
const PAGE_ID = '111222333444';

const META_ENV_KEYS = ['META_APP_ID', 'META_APP_SECRET', 'META_ACCESS_TOKEN', 'META_AD_ACCOUNT_ID', 'META_PAGE_ID', 'META_GRAPH_VERSION', 'META_WEBHOOK_VERIFY_TOKEN', 'META_ADS_SETTINGS_KEY'];
let savedMetaEnv;

const sign = (rawBody) =>
  `sha256=${crypto.createHmac('sha256', process.env.META_APP_SECRET || '').update(rawBody).digest('hex')}`;

const leadDetail = (overrides = {}) => ({
  id: '123456789',
  created_time: 1729000000,
  field_data: [
    { name: 'full_name', values: ['Rohit Sharma'] },
    { name: 'phone_number', values: ['+91 90000 12345'] },
  ],
  ad_id: '555',
  adset_id: '556',
  campaign_id: '557',
  form_id: '558',
  ...overrides,
});

const leadgenChange = (leadgenId) => ({
  field: 'leadgen',
  value: { leadgen_id: leadgenId, page_id: PAGE_ID, form_id: '558', ad_id: '555', created_time: 1729000000 },
});

const postBatch = (entries) => {
  const raw = JSON.stringify({ object: 'page', entry: entries });
  return request(app)
    .post('/api/v1/webhooks/meta/leadgen')
    .set('Content-Type', 'application/json')
    .set('X-Hub-Signature-256', sign(raw))
    .send(raw);
};

const entryWith = (...changes) => ({ id: PAGE_ID, changes });

const lead = (overrides = {}) => ({
  id: 'aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  organizationId: ORG,
  name: 'Rohit Sharma',
  phone: '+91 90000 12345',
  status: 'NEW',
  campaign: null,
  metaLeadId: null,
  ...overrides,
});

// Routes Graph requests by the last URL path segment. A handler with
// __status simulates a provider failure (429/403/...) for that path.
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

const happyRoutes = {
  '111': leadDetail({ id: '111' }),
  '222': leadDetail({ id: '222' }),
  '557': { id: '557', name: 'Diwali Push' },
};

beforeEach(() => {
  jest.clearAllMocks();
  savedMetaEnv = {};
  for (const key of META_ENV_KEYS) {
    savedMetaEnv[key] = process.env[key];
    delete process.env[key];
  }
  process.env.META_APP_SECRET = 'test-meta-secret';
  process.env.META_ACCESS_TOKEN = 'test-meta-token';
  process.env.META_PAGE_ID = PAGE_ID;
  process.env.META_WEBHOOK_VERIFY_TOKEN = 'test-verify-token';
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

describe('Step 0: webhook batch per-entry isolation', () => {
  test('valid entry followed by malformed entry: valid one still ingests', async () => {
    prisma.lead.findFirst.mockResolvedValue(null);
    prisma.lead.create.mockResolvedValue(lead({ metaLeadId: '111' }));
    prisma.leadActivity.create.mockResolvedValue({});
    stubGraphRoutes(happyRoutes);

    const res = await postBatch([entryWith(leadgenChange('111')), entryWith(leadgenChange('bad-id'))]);

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ processed: 1, ignored: 0, duplicates: 0, failed: 1 });
    expect(prisma.lead.create).toHaveBeenCalledTimes(1);
  });

  test('malformed entry followed by valid entry: order does not matter', async () => {
    prisma.lead.findFirst.mockResolvedValue(null);
    prisma.lead.create.mockResolvedValue(lead({ metaLeadId: '111' }));
    prisma.leadActivity.create.mockResolvedValue({});
    stubGraphRoutes(happyRoutes);

    const res = await postBatch([entryWith(leadgenChange('bad-id')), entryWith(leadgenChange('111'))]);

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ processed: 1, ignored: 0, duplicates: 0, failed: 1 });
    expect(prisma.lead.create).toHaveBeenCalledTimes(1);
  });

  test('multiple valid entries are all processed', async () => {
    prisma.lead.findFirst.mockResolvedValue(null);
    prisma.lead.create.mockResolvedValue(lead());
    prisma.leadActivity.create.mockResolvedValue({});
    stubGraphRoutes(happyRoutes);

    const res = await postBatch([entryWith(leadgenChange('111')), entryWith(leadgenChange('222'))]);

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ processed: 2, ignored: 0, duplicates: 0, failed: 0 });
    expect(prisma.lead.create).toHaveBeenCalledTimes(2);
  });

  test('duplicate entries inside one batch are deduplicated, not double-created', async () => {
    prisma.lead.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(lead({ metaLeadId: '111' }));
    prisma.lead.create.mockResolvedValue(lead({ metaLeadId: '111' }));
    prisma.leadActivity.create.mockResolvedValue({});
    stubGraphRoutes(happyRoutes);

    const res = await postBatch([entryWith(leadgenChange('111')), entryWith(leadgenChange('111'))]);

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ processed: 1, ignored: 0, duplicates: 1, failed: 0 });
    expect(prisma.lead.create).toHaveBeenCalledTimes(1);
  });

  test('transient Meta failure mid-batch rethrows for Meta retry; first lead stays written', async () => {
    prisma.lead.findFirst.mockResolvedValue(null);
    prisma.lead.create.mockResolvedValue(lead({ metaLeadId: '111' }));
    prisma.leadActivity.create.mockResolvedValue({});
    stubGraphRoutes({
      ...happyRoutes,
      '222': { __status: 429, __body: { error: { message: 'Application request limit reached', code: 80004 } } },
    });

    const res = await postBatch([entryWith(leadgenChange('111')), entryWith(leadgenChange('222'))]);

    expect(res.status).toBe(429);
    expect(res.body.code).toBe('META_RATE_LIMITED');
    // Entry 1 completed before the transient failure: Meta's redelivery is
    // made idempotent by the (organizationId, metaLeadId) unique index.
    expect(prisma.lead.create).toHaveBeenCalledTimes(1);
  });

  test('wholly invalid batch still surfaces the original 4xx', async () => {
    stubGraphRoutes(happyRoutes);

    const res = await postBatch([entryWith(leadgenChange('bad-id'))]);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(prisma.lead.create).not.toHaveBeenCalled();
  });

  test('counts are accurate across processed / ignored / duplicates / failed', async () => {
    prisma.lead.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(lead({ metaLeadId: '111' }));
    prisma.lead.create.mockResolvedValue(lead({ metaLeadId: '111' }));
    prisma.leadActivity.create.mockResolvedValue({});
    stubGraphRoutes(happyRoutes);

    const res = await postBatch([
      entryWith(leadgenChange('111'), { field: 'feed', value: {} }),
      entryWith(leadgenChange('111'), leadgenChange('bad-id')),
    ]);

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ processed: 1, ignored: 1, duplicates: 1, failed: 1 });
    // 3 leadgen changes: 1 processed + 1 duplicate + 1 failed. The ignored
    // count only ever covers non-leadgen changes — failures are never
    // silently reported as processed, ignored or duplicate.
    expect(res.body.data.processed + res.body.data.duplicates + res.body.data.failed).toBe(3);
  });

  test('rejection log carries only safe identifiers (code + status)', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    stubGraphRoutes(happyRoutes);

    await postBatch([entryWith(leadgenChange('bad-id'))]);

    const rejection = warn.mock.calls.find((c) => c[0] === '[meta-webhook] entry rejected');
    expect(rejection).toBeDefined();
    const payload = JSON.stringify(rejection[1]);
    expect(payload).toContain('VALIDATION_ERROR');
    expect(payload).not.toMatch(/bad-id|111222333444|test-meta-token|test-meta-secret/);
  });
});

describe('Step 0: timing-safe Meta webhook verification', () => {
  test('accepts the configured token (200 + challenge text)', async () => {
    const res = await request(app)
      .get('/api/v1/webhooks/meta/leadgen?hub.mode=subscribe&hub.verify_token=test-verify-token&hub.challenge=777');
    expect(res.status).toBe(200);
    expect(res.text).toBe('777');
  });

  test('rejects a wrong token (403)', async () => {
    const res = await request(app)
      .get('/api/v1/webhooks/meta/leadgen?hub.mode=subscribe&hub.verify_token=nope&hub.challenge=777');
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('WEBHOOK_VERIFY_FAILED');
  });

  test('rejects a missing token parameter (403)', async () => {
    const res = await request(app)
      .get('/api/v1/webhooks/meta/leadgen?hub.mode=subscribe&hub.challenge=777');
    expect(res.status).toBe(403);
  });

  test('fails closed when the verify token is not configured (403, no crash)', async () => {
    delete process.env.META_WEBHOOK_VERIFY_TOKEN;
    const res = await request(app)
      .get('/api/v1/webhooks/meta/leadgen?hub.mode=subscribe&hub.verify_token=test-verify-token&hub.challenge=777');
    expect(res.status).toBe(403);
  });

  test('rejects an unequal-length token without throwing (403, length guard)', async () => {
    const res = await request(app)
      .get('/api/v1/webhooks/meta/leadgen?hub.mode=subscribe&hub.verify_token=test-verify-token-EXTRA&hub.challenge=777');
    expect(res.status).toBe(403);
  });

  test('rejects a repeated (array) token parameter without a 500', async () => {
    const res = await request(app)
      .get('/api/v1/webhooks/meta/leadgen?hub.mode=subscribe&hub.verify_token=aaa&hub.verify_token=bbb&hub.challenge=777');
    expect(res.status).toBe(403);
  });

  test('rejects a non-subscribe mode even with the right token (403)', async () => {
    const res = await request(app)
      .get('/api/v1/webhooks/meta/leadgen?hub.mode=unsubscribe&hub.verify_token=test-verify-token&hub.challenge=777');
    expect(res.status).toBe(403);
  });

  test('verification source uses crypto.timingSafeEqual', () => {
    // The comparison moved into the settings service (row-first resolution);
    // the webhook controller delegates to it.
    const source = fs.readFileSync(require.resolve('../src/services/metaAdsSettingsService.js'), 'utf8');
    expect(source).toContain('timingSafeEqual');
    const controller = fs.readFileSync(require.resolve('../src/controllers/webhooks.js'), 'utf8');
    expect(controller).toContain('verifyWebhookToken');
  });
});
