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
  mock.$transaction = jest.fn(async (fn) => fn(mock));
  return mock;
});

// Phase 2D/2E/2F/2G/2I: webhook + backfill share ONE import service —
// mapping, gating, dedupe, CRM integration, sync events/runs, history.
// Every Graph call is stubbed; assertions verify counts, idempotency and
// that no PII or credential ever reaches audit/events/runs/responses.

const ORG = '11111111-1111-4111-8111-111111111111';
const PAGE_ID = '111222333444';
const FORM_ID = '558';
const RUN_ID = '33333333-3333-4333-8333-333333333333';

const META_ENV_KEYS = [
  'META_APP_ID', 'META_APP_SECRET', 'META_ACCESS_TOKEN', 'META_AD_ACCOUNT_ID',
  'META_PAGE_ID', 'META_GRAPH_VERSION', 'META_WEBHOOK_VERIFY_TOKEN',
  'META_ADS_SETTINGS_KEY', 'SESSION_COOKIE_NAME', 'BACKEND_URL', 'FRONTEND_URL',
];
let savedMetaEnv;

const respond = (result) => {
  if (result && result.__status) {
    return { ok: false, status: result.__status, json: async () => result.__body || {} };
  }
  return { ok: true, status: 200, json: async () => result };
};

// Keyed by the last URL path segment: 'leads' (backfill list edge), the
// numeric leadgen/campaign ids, etc. Handlers may be functions for
// paginated/stateful edges.
const stubGraph = (routes) => {
  const counts = {};
  return jest.spyOn(global, 'fetch').mockImplementation(async (url) => {
    const u = new URL(String(url));
    const segs = u.pathname.split('/').filter(Boolean).slice(1); // drop version
    const id = segs[segs.length - 1];
    counts[id] = (counts[id] || 0) + 1;
    const handler = routes[id];
    if (handler === undefined) {
      return respond({ __status: 404, __body: { error: { message: `No stub for ${id}`, code: 100 } } });
    }
    const value = typeof handler === 'function'
      ? handler({ params: u.searchParams, count: counts[id], key: segs.join('/') })
      : handler;
    return respond(value);
  });
};

const mockSession = (role = 'ADMIN', userId = 'admin-user') => {
  prisma.session.findUnique.mockResolvedValue({
    expiresAt: new Date(Date.now() + 60_000),
    user: { id: userId, organizationId: ORG, role, status: 'ACTIVE' },
  });
};

const sign = (rawBody) =>
  `sha256=${crypto.createHmac('sha256', process.env.META_APP_SECRET || '').update(rawBody).digest('hex')}`;

const leadgenEvent = (valueOverrides = {}) => ({
  object: 'page',
  entry: [{
    id: PAGE_ID,
    changes: [{
      field: 'leadgen',
      value: {
        leadgen_id: '123456789', page_id: PAGE_ID, form_id: FORM_ID,
        ad_id: '555', created_time: 1729000000, ...valueOverrides,
      },
    }],
  }],
});

const postWebhook = (payload) => {
  const raw = JSON.stringify(payload);
  return request(app)
    .post('/api/v1/webhooks/meta/leadgen')
    .set('Content-Type', 'application/json')
    .set('X-Hub-Signature-256', sign(raw))
    .send(raw);
};

const post = (path, body, cookie = 'spaceezy_session=admin-token') =>
  request(app).post(path).set('Cookie', cookie).send(body || {});
const get = (path, cookie = 'spaceezy_session=admin-token') =>
  request(app).get(path).set('Cookie', cookie);

const detailWith = (fields, overrides = {}) => ({
  id: '123456789',
  created_time: 1729000000,
  field_data: fields,
  ad_id: '555', adset_id: '556', campaign_id: '557', form_id: FORM_ID,
  ...overrides,
});

const identityFields = [
  { name: 'full_name', label: 'Full Name', values: ['Priya Nair'] },
  { name: 'phone_number', label: 'Mobile', values: ['+91 98765 43210'] },
];

const mappedFields = [
  ...identityFields,
  { name: 'budget', label: 'Budget', values: ['1.5 Cr - 2 Cr'] },
  { name: 'city', label: 'City', values: ['Pune'] },
  { name: 'requirements', label: 'Any requirements?', values: ['Corner unit preferred'] },
];

const mappedConfig = {
  id: 'cfg-1', formId: FORM_ID, pageId: PAGE_ID, formName: 'Site Visit Form',
  isEnabled: true,
  fieldMapping: [
    { questionKey: 'full_name', questionLabel: 'Full Name', crmField: 'fullName' },
    { questionKey: 'phone_number', questionLabel: 'Mobile', crmField: 'mobile' },
    { questionKey: 'budget', questionLabel: 'Budget', crmField: 'budget' },
    { questionKey: 'requirements', questionLabel: 'Any requirements?', crmField: 'additionalRequirements' },
    { questionKey: 'city', questionLabel: 'City', crmField: null },
  ],
  lastSyncedAt: null,
};

const leadRow = (overrides = {}) => ({
  id: 'lead-created', organizationId: ORG, name: 'Priya Nair',
  phone: '+91 98765 43210', status: 'NEW', ...overrides,
});

const unix = (iso) => Math.floor(Date.parse(iso) / 1000);

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

  // Deterministic defaults (jest.clearAllMocks does not reset impls).
  prisma.organization.findFirst.mockResolvedValue({ id: ORG });
  prisma.auditLog.create.mockResolvedValue({ id: 'audit-1' });
  prisma.metaAdsSettings.findUnique.mockResolvedValue(undefined); // env mode
  prisma.metaLeadFormConfig.findUnique.mockResolvedValue(null);   // never configured
  prisma.metaLeadFormConfig.findMany.mockResolvedValue([]);
  prisma.metaLeadSyncEvent.findUnique.mockResolvedValue(null);
  prisma.metaLeadSyncEvent.create.mockResolvedValue({ id: 'evt-1' });
  prisma.metaLeadSyncRun.create.mockResolvedValue({ id: 'run-1' });
  prisma.metaLeadSyncRun.update.mockResolvedValue({});
  prisma.lead.findFirst.mockResolvedValue(null);
  prisma.lead.create.mockImplementation(async ({ data }) => ({ id: 'lead-created', ...data }));
  prisma.leadActivity.create.mockResolvedValue({});
  mockSession();
});

afterEach(() => {
  jest.restoreAllMocks();
  for (const key of META_ENV_KEYS) {
    if (savedMetaEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedMetaEnv[key];
  }
});

describe('Phase 2D/2C: webhook applies the saved field mapping', () => {
  test('mapped answers land in CRM columns; originals preserved in metaAnswers', async () => {
    prisma.metaLeadFormConfig.findUnique.mockResolvedValue(mappedConfig);
    stubGraph({
      '123456789': detailWith(mappedFields),
      '557': { id: '557', name: 'Diwali Push' },
    });

    const res = await postWebhook(leadgenEvent({ platform: 'Instagram' }));
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ processed: 1, ignored: 0, duplicates: 0, failed: 0 });

    expect(prisma.lead.create).toHaveBeenCalledTimes(1);
    const data = prisma.lead.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      organizationId: ORG,
      name: 'Priya Nair',
      phone: '+91 98765 43210', // original string, validated but not rewritten
      email: null,
      source: 'Meta',
      campaign: 'Diwali Push',
      status: 'NEW',
      budgetMin: 15000000,
      budgetMax: 20000000,
      budget: 20000000, // legacy column synced by LeadService
      message: 'Corner unit preferred', // ONLY the mapped Additional Requirements answer
      metaLeadId: '123456789',
      metaPageId: PAGE_ID,
      metaFormId: FORM_ID,
      metaAdId: '555',
      metaAdsetId: '556',
      metaCampaignId: '557',
      metaCampaignName: 'Diwali Push',
      metaPlatform: 'Instagram',
      metaCreatedAt: new Date(1729000000 * 1000),
    });

    // Every original question/answer preserved with its mapping decision.
    expect(data.metaAnswers).toEqual(expect.arrayContaining([
      expect.objectContaining({ questionKey: 'city', questionLabel: 'City', values: ['Pune'], mappedField: null }),
      expect.objectContaining({ questionKey: 'budget', mappedField: 'budget' }),
      expect.objectContaining({ questionKey: 'requirements', values: ['Corner unit preferred'], mappedField: 'additionalRequirements' }),
      expect.objectContaining({ questionKey: 'full_name', values: ['Priya Nair'], mappedField: 'fullName' }),
    ]));
    expect(data.metaAnswers).toHaveLength(5);

    // Existing lead service writes its own NOTE; the import adds the Meta note.
    const descriptions = prisma.leadActivity.create.mock.calls.map((c) => c[0].data.description);
    expect(descriptions).toContain('Lead created');
    expect(descriptions).toContain('Meta Lead Ad synced from Facebook/Instagram lead form');

    // Sync event + run recorded for the Sync History tab.
    expect(prisma.metaLeadSyncEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({
        idempotencyKey: '123456789', metaLeadId: '123456789',
        formId: FORM_ID, pageId: PAGE_ID, source: 'WEBHOOK', status: 'IMPORTED',
        leadId: 'lead-created', errorCode: null,
      }) })
    );
    expect(prisma.metaLeadSyncRun.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({
        source: 'WEBHOOK', status: 'COMPLETED', fetchedCount: 1, importedCount: 1,
        duplicateCount: 0, skippedCount: 0, failedCount: 0,
      }) })
    );
    expect(prisma.metaLeadFormConfig.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: ORG, formId: FORM_ID } })
    );
  });

  test('unmapped answers never land in message; message stays null', async () => {
    prisma.metaLeadFormConfig.findUnique.mockResolvedValue({
      ...mappedConfig,
      fieldMapping: mappedConfig.fieldMapping.map((m) => ({ ...m, crmField: null })),
    });
    stubGraph({ '123456789': detailWith(mappedFields), '557': { id: '557', name: 'Diwali Push' } });

    const res = await postWebhook(leadgenEvent());
    expect(res.status).toBe(200);
    expect(res.body.data.processed).toBe(1);
    const data = prisma.lead.create.mock.calls[0][0].data;
    expect(data.message).toBeNull();
    expect(data.budgetMin).toBeUndefined();
    expect(data.metaAnswers).toHaveLength(5);
    expect(JSON.stringify(data.metaAnswers)).toContain('Corner unit preferred');
  });
});

describe('Phase 2D: form-enabled gate', () => {
  test('explicitly disabled form → no lead, IGNORED/FORM_DISABLED event, no Meta call', async () => {
    prisma.metaLeadFormConfig.findUnique.mockResolvedValue({ ...mappedConfig, isEnabled: false });
    const spy = jest.spyOn(global, 'fetch');

    const res = await postWebhook(leadgenEvent());
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ processed: 0, ignored: 1, duplicates: 0 });
    expect(spy).not.toHaveBeenCalled();
    expect(prisma.lead.create).not.toHaveBeenCalled();

    expect(prisma.metaLeadSyncEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({
        status: 'IGNORED', errorCode: 'FORM_DISABLED', source: 'WEBHOOK',
      }) })
    );
    expect(prisma.metaLeadSyncRun.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({
        status: 'COMPLETED', skippedCount: 1, importedCount: 0,
      }) })
    );
  });

  test('never-configured form keeps ingesting (Phase 1 default-enabled parity)', async () => {
    prisma.metaLeadFormConfig.findUnique.mockResolvedValue(null);
    stubGraph({ '123456789': detailWith(identityFields), '557': { id: '557', name: 'Diwali Push' } });

    const res = await postWebhook(leadgenEvent());
    expect(res.status).toBe(200);
    expect(res.body.data.processed).toBe(1);
    expect(prisma.lead.create).toHaveBeenCalledTimes(1);
  });

  test('duplicate metaLeadId short-circuits before any Meta call (idempotent)', async () => {
    prisma.lead.findFirst.mockResolvedValue(leadRow({ metaLeadId: '123456789' }));
    const spy = jest.spyOn(global, 'fetch');

    const res = await postWebhook(leadgenEvent());
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ processed: 0, duplicates: 1 });
    expect(spy).not.toHaveBeenCalled();
    expect(prisma.lead.create).not.toHaveBeenCalled();
    expect(prisma.metaLeadSyncEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'DUPLICATE' }) })
    );
  });

  test('missing token fails closed with the webhook 503 contract', async () => {
    delete process.env.META_ACCESS_TOKEN;

    const res = await postWebhook(leadgenEvent());
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('META_NOT_CONFIGURED');
    expect(prisma.lead.create).not.toHaveBeenCalled();
    expect(prisma.metaLeadSyncEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED', errorCode: 'META_NOT_CONFIGURED' }) })
    );
  });

  test('transient rate limit propagates (429) and records a FAILED attempt', async () => {
    prisma.metaLeadFormConfig.findUnique.mockResolvedValue(mappedConfig);
    stubGraph({ '123456789': { __status: 429, __body: { error: { message: 'throttled', code: 80004 } } } });

    const res = await postWebhook(leadgenEvent());
    expect(res.status).toBe(429);
    expect(res.body.code).toBe('META_RATE_LIMITED');
    expect(prisma.lead.create).not.toHaveBeenCalled();
    expect(prisma.metaLeadSyncEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({
        status: 'FAILED', errorCode: 'META_RATE_LIMITED',
      }) })
    );
    expect(prisma.metaLeadSyncRun.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED', errorCode: 'META_RATE_LIMITED' }) })
    );
  });
});

describe('Phase 2E: historical backfill', () => {
  const backfillBody = { pageId: PAGE_ID, formId: FORM_ID, since: '2026-01-01', until: '2026-01-31' };
  const inRange = { '1001': unix('2026-01-10T00:00:00Z'), '1002': unix('2026-01-20T00:00:00Z') };

  const listRow = (id, seconds) => ({ id, created_time: seconds });

  test('imports in-range leads with accurate counts, date filtering and run bookkeeping', async () => {
    let listParams = null;
    stubGraph({
      leads: ({ params }) => {
        listParams = params;
        return { data: [
          listRow('1001', inRange['1001']),
          listRow('1002', inRange['1002']),
          listRow('1003', unix('2025-12-31T00:00:00Z')), // before `since` → filtered locally
        ] };
      },
      '1001': detailWith(identityFields, { id: '1001', campaign_id: undefined, ad_id: undefined, adset_id: undefined }),
      '1002': detailWith(identityFields, { id: '1002', campaign_id: undefined, ad_id: undefined, adset_id: undefined }),
    });
    prisma.metaLeadFormConfig.findUnique.mockResolvedValue(mappedConfig);

    const res = await post('/api/v1/meta-ads/lead-sync/backfill', backfillBody);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      runId: 'run-1', status: 'COMPLETED',
      fetched: 2, imported: 2, duplicates: 0, skipped: 0, failed: 0,
      truncated: false,
    });
    expect(res.body.data.failures).toEqual([]);

    // Range bounds travel to Meta and are re-checked locally.
    expect(listParams.get('since')).toBe(String(unix('2026-01-01T00:00:00Z')));
    expect(listParams.get('until')).toBe(String(unix('2026-01-31T23:59:59.999Z')));

    expect(prisma.lead.create).toHaveBeenCalledTimes(2);
    const createdIds = prisma.lead.create.mock.calls.map((c) => c[0].data.metaLeadId);
    expect(createdIds.sort()).toEqual(['1001', '1002']);
    // The out-of-range lead was never fetched from Meta.
    expect(global.fetch.mock.calls.filter(([u]) => String(u).endsWith('/1003'))).toHaveLength(0);

    expect(prisma.metaLeadSyncRun.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ source: 'BACKFILL', status: 'RUNNING' }) })
    );
    expect(prisma.metaLeadSyncRun.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({
        fetchedCount: 2, importedCount: 2, duplicateCount: 0, skippedCount: 0,
        failedCount: 0, status: 'COMPLETED', errorCode: null,
      }) })
    );
    expect(res.body.data.lastSyncedAt).toEqual(expect.any(String));

    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'meta.leads_backfilled' }) })
    );
    // Audit carries counts only — no lead PII, no credentials.
    const serialized = JSON.stringify(prisma.auditLog.create.mock.calls[0][0].data);
    expect(serialized).not.toContain('Priya');
    expect(serialized).not.toContain('98765');
    expect(serialized).not.toContain('test-meta-token');
  });

  test('paginates with cursors until Meta stops returning a next page', async () => {
    stubGraph({
      leads: ({ count }) => {
        if (count === 1) return { data: [listRow('1001', inRange['1001'])], paging: { cursors: { after: 'c1' } } };
        if (count === 2) return { data: [listRow('1002', inRange['1002'])], paging: { cursors: { after: 'c2' } } };
        return { data: [listRow('1004', unix('2026-01-25T00:00:00Z'))] };
      },
      '1001': detailWith(identityFields, { id: '1001', campaign_id: undefined }),
      '1002': detailWith(identityFields, { id: '1002', campaign_id: undefined }),
      '1004': detailWith(identityFields, { id: '1004', campaign_id: undefined }),
    });

    const res = await post('/api/v1/meta-ads/lead-sync/backfill', backfillBody);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ fetched: 3, imported: 3, truncated: false, status: 'COMPLETED' });
    expect(prisma.lead.create).toHaveBeenCalledTimes(3);
  });

  test('repeat backfill is idempotent: existing metaLeadId counts as duplicate, no second row', async () => {
    stubGraph({
      leads: { data: [listRow('1001', inRange['1001']), listRow('1002', inRange['1002'])] },
      '1001': detailWith(identityFields, { id: '1001', campaign_id: undefined }),
      '1002': detailWith(identityFields, { id: '1002', campaign_id: undefined }),
    });
    prisma.lead.findFirst
      .mockResolvedValueOnce(leadRow({ metaLeadId: '1001' })) // dedupe pre-check hit
      .mockResolvedValue(null);

    const res = await post('/api/v1/meta-ads/lead-sync/backfill', backfillBody);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ fetched: 2, imported: 1, duplicates: 1, failed: 0 });
    expect(prisma.lead.create).toHaveBeenCalledTimes(1);
    expect(prisma.metaLeadSyncRun.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ importedCount: 1, duplicateCount: 1 }) })
    );
  });

  test('listing failure fails the run honestly (no fabricated counts)', async () => {
    stubGraph({ leads: { __status: 429, __body: { error: { message: 'throttled', code: 80004 } } } });

    const res = await post('/api/v1/meta-ads/lead-sync/backfill', backfillBody);
    expect(res.status).toBe(200); // run outcome reported, not thrown
    expect(res.body.data).toMatchObject({ status: 'FAILED', fetched: 0, imported: 0, failed: 0 });
    expect(res.body.data.failures).toEqual([expect.objectContaining({ metaLeadId: null, code: 'META_RATE_LIMITED' })]);
    expect(prisma.metaLeadSyncRun.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED', errorCode: 'META_RATE_LIMITED' }) })
    );
    expect(prisma.lead.create).not.toHaveBeenCalled();
  });

  test('consecutive permanent failures trip the circuit breaker (bounded work)', async () => {
    const rows = [];
    for (let i = 2001; i <= 2012; i += 1) rows.push(listRow(String(i), inRange['1001']));
    const denied = { __status: 403, __body: { error: { message: 'Permission denied', code: 200 } } };
    const routes = { leads: { data: rows } };
    for (let i = 2001; i <= 2012; i += 1) routes[String(i)] = denied;
    stubGraph(routes);

    const res = await post('/api/v1/meta-ads/lead-sync/backfill', backfillBody);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      status: 'FAILED', fetched: 10, imported: 0, failed: 10,
    });
    expect(res.body.data.failures).toHaveLength(10);
    // 1 list call + at most 10 detail calls: the run stops instead of
    // grinding through every remaining lead.
    expect(global.fetch).toHaveBeenCalledTimes(11);
    expect(prisma.lead.create).not.toHaveBeenCalled();
  });

  test('backfill validation: paired dates required, since<=until, Page must be connected', async () => {
    const noUntil = await post('/api/v1/meta-ads/lead-sync/backfill', { pageId: PAGE_ID, formId: FORM_ID, since: '2026-01-01' });
    expect(noUntil.status).toBe(400);
    expect(noUntil.body.code).toBe('VALIDATION_ERROR');

    const inverted = await post('/api/v1/meta-ads/lead-sync/backfill', {
      pageId: PAGE_ID, formId: FORM_ID, since: '2026-02-01', until: '2026-01-01',
    });
    expect(inverted.status).toBe(400);

    const foreign = await post('/api/v1/meta-ads/lead-sync/backfill', { pageId: '999000111', formId: FORM_ID });
    expect(foreign.status).toBe(400);
    expect(foreign.body.code).toBe('PAGE_MISMATCH');
    expect(prisma.metaLeadSyncRun.create).not.toHaveBeenCalled();
  });
});

describe('Phase 2E: retry of failed imports', () => {
  test('re-imports FAILED events of a run through the shared import path', async () => {
    prisma.metaLeadSyncRun.findFirst.mockResolvedValue({
      id: RUN_ID, organizationId: ORG, pageId: PAGE_ID, formId: FORM_ID,
      source: 'BACKFILL', status: 'FAILED',
    });
    prisma.metaLeadSyncEvent.findMany.mockResolvedValue([
      { metaLeadId: '1001', pageId: PAGE_ID, formId: FORM_ID, status: 'FAILED' },
    ]);
    prisma.metaLeadSyncRun.create.mockResolvedValue({ id: 'run-2' });
    stubGraph({ '1001': detailWith(identityFields, { id: '1001', campaign_id: undefined }) });

    const res = await post('/api/v1/meta-ads/lead-sync/retry', { runId: RUN_ID });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      runId: 'run-2', retriedFrom: RUN_ID, status: 'COMPLETED',
      fetched: 1, imported: 1, duplicates: 0, failed: 0,
    });
    expect(prisma.lead.create).toHaveBeenCalledTimes(1);
    expect(prisma.metaLeadSyncRun.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ source: 'RETRY', status: 'RUNNING' }) })
    );
    expect(prisma.metaLeadSyncRun.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ importedCount: 1, status: 'COMPLETED' }) })
    );
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({
        action: 'meta.lead_sync_retried',
        metadata: expect.objectContaining({ retriedFrom: RUN_ID }),
      }) })
    );
  });

  test('retrying an already-imported lead cannot create a second row', async () => {
    prisma.metaLeadSyncRun.findFirst.mockResolvedValue({
      id: RUN_ID, organizationId: ORG, pageId: PAGE_ID, formId: FORM_ID,
      source: 'BACKFILL', status: 'FAILED',
    });
    prisma.metaLeadSyncEvent.findMany.mockResolvedValue([
      { metaLeadId: '1001', pageId: PAGE_ID, formId: FORM_ID, status: 'FAILED' },
    ]);
    prisma.metaLeadSyncRun.create.mockResolvedValue({ id: 'run-2' });
    prisma.lead.findFirst.mockResolvedValue(leadRow({ metaLeadId: '1001' }));
    const spy = jest.spyOn(global, 'fetch');

    const res = await post('/api/v1/meta-ads/lead-sync/retry', { runId: RUN_ID });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ duplicates: 1, imported: 0 });
    expect(spy).not.toHaveBeenCalled();
    expect(prisma.lead.create).not.toHaveBeenCalled();
  });

  test('unknown run is a 404; bad runId fails validation (400)', async () => {
    prisma.metaLeadSyncRun.findFirst.mockResolvedValue(null);
    const missing = await post('/api/v1/meta-ads/lead-sync/retry', { runId: RUN_ID });
    expect(missing.status).toBe(404);
    expect(missing.body.code).toBe('NOT_FOUND');

    const bad = await post('/api/v1/meta-ads/lead-sync/retry', { runId: 'not-a-uuid' });
    expect(bad.status).toBe(400);
    expect(bad.body.code).toBe('VALIDATION_ERROR');
  });
});

describe('Phase 2H: sync history', () => {
  test('lists runs with filters, counts and failedEvents — no PII', async () => {
    mockSession('SALES_MANAGER', 'manager-user'); // marketing:view can read history
    prisma.metaLeadSyncRun.findMany.mockResolvedValue([{
      id: 'run-1', formId: FORM_ID, pageId: PAGE_ID, source: 'BACKFILL',
      status: 'PARTIAL', errorCode: null,
      startedAt: new Date('2026-02-01T10:00:00Z'),
      completedAt: new Date('2026-02-01T10:05:00Z'),
      fetchedCount: 10, importedCount: 8, duplicateCount: 1,
      skippedCount: 0, failedCount: 1,
    }]);
    prisma.metaLeadSyncRun.count.mockResolvedValue(1);
    prisma.metaLeadSyncEvent.count.mockResolvedValue(3);

    const res = await get(
      `/api/v1/meta-ads/lead-sync/history?formId=${FORM_ID}&source=BACKFILL&limit=10`,
      'spaceezy_session=manager-token'
    );
    expect(res.status).toBe(200);
    expect(res.body.data.items).toEqual([expect.objectContaining({
      id: 'run-1', formId: FORM_ID, source: 'BACKFILL', status: 'PARTIAL',
      fetched: 10, imported: 8, duplicates: 1, skipped: 0, failed: 1,
      startedAt: '2026-02-01T10:00:00.000Z',
      completedAt: '2026-02-01T10:05:00.000Z',
    })]);
    expect(res.body.data.total).toBe(1);
    expect(res.body.data.failedEvents).toBe(3);

    expect(prisma.metaLeadSyncRun.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: ORG, formId: FORM_ID, source: 'BACKFILL' },
        orderBy: { startedAt: 'desc' },
        take: 10,
      })
    );
    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toContain('Priya');
    expect(serialized).not.toContain('98765');
    expect(serialized).not.toContain('test-meta-token');
  });

  test('default limit is bounded (25) when none is given', async () => {
    prisma.metaLeadSyncRun.findMany.mockResolvedValue([]);
    const res = await get('/api/v1/meta-ads/lead-sync/history');
    expect(res.status).toBe(200);
    expect(prisma.metaLeadSyncRun.findMany.mock.calls[0][0].take).toBe(25);
  });
});

describe('Phase 2I: sync events stay free of PII and secrets', () => {
  test('webhook import writes only identifiers/status/error codes to events, runs and audit', async () => {
    prisma.metaLeadFormConfig.findUnique.mockResolvedValue(mappedConfig);
    stubGraph({ '123456789': detailWith(mappedFields), '557': { id: '557', name: 'Diwali Push' } });

    const res = await postWebhook(leadgenEvent());
    expect(res.status).toBe(200);

    const auditSerialized = JSON.stringify(prisma.auditLog.create.mock.calls.map((c) => c[0].data));
    const eventSerialized = JSON.stringify(prisma.metaLeadSyncEvent.create.mock.calls.map((c) => c[0].data));
    const runSerialized = JSON.stringify(prisma.metaLeadSyncRun.create.mock.calls.map((c) => c[0].data));
    const all = `${auditSerialized}${eventSerialized}${runSerialized}`;

    for (const leak of ['Priya', '98765', 'Pune', 'Corner unit', 'test-meta-token', 'test-meta-secret']) {
      expect(all).not.toContain(leak);
    }
    // The webhook response echoes counts only.
    expect(JSON.stringify(res.body)).not.toContain('98765');
    expect(JSON.stringify(res.body)).not.toContain('test-meta-token');
  });
});
