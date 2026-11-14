const request = require('supertest');
const app = require('../src/app');
const prisma = require('../src/db/prisma');
const { encryptSecret } = require('../src/utils/whatsappSecrets');

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

// Phase 3+4 — Meta campaign, ad set and audience management. Everything
// Graph-facing is stubbed: no live credentials, no network, no real Meta
// account. Safety contracts under test: PAUSED-only creation, explicit
// activation confirmation, validate-only pre-flight before mutation, RBAC,
// zod validation before any provider call, audit rows, and zero credential
// leakage in responses.

const ORG = '11111111-1111-4111-8111-111111111111';
const PAGE_1 = '111222333444';
const META_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
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
const manager = () => mockSession('SALES_MANAGER', 'manager-user');
const exec = () => mockSession('SALES_EXECUTIVE', 'exec-user');

const get = (path, cookie) => request(app).get(path).set('Cookie', cookie || 'spaceezy_session=admin-token');
const post = (path, body, cookie) =>
  request(app).post(path).set('Cookie', cookie || 'spaceezy_session=admin-token').send(body || {});
const patch = (path, body, cookie) =>
  request(app).patch(path).set('Cookie', cookie || 'spaceezy_session=admin-token').send(body || {});
const del = (path, cookie) => request(app).delete(path).set('Cookie', cookie || 'spaceezy_session=admin-token');

// Routes Graph calls by the LAST path segment (same trick as the Phase 1
// suite). A handler may be a plain payload or a function receiving the
// request so one segment can answer GET and POST differently. `__status`
// / `__body` simulate a provider failure for that path.
const stubGraph = (routes) =>
  jest.spyOn(global, 'fetch').mockImplementation(async (url, init = {}) => {
    const pathname = new URL(String(url)).pathname;
    const id = pathname.split('/').filter(Boolean).pop() || '';
    const handler = routes[id];
    if (handler === undefined) {
      return { ok: false, status: 404, json: async () => ({ error: { message: `No stub for ${id}`, code: 100 } }) };
    }
    const value = typeof handler === 'function' ? handler({ url: String(url), pathname, init }) : handler;
    const status = value && value.__status ? value.__status : 200;
    const body = value && value.__body !== undefined ? value.__body : value;
    return { ok: status >= 200 && status < 300, status, json: async () => body };
  });

// Settings row whose secrets are encrypted under the Meta key (built at
// call time — the key must be present in env when this runs).
const storedRow = (overrides = {}) => ({
  id: 'settings-row',
  organizationId: ORG,
  accessTokenEnc: encryptSecret('DB-TOKEN-SECRET', ENC),
  appSecretEnc: encryptSecret('DB-APP-SECRET', ENC),
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

const campaignFixture = {
  id: '9001',
  name: 'Wave City Launch',
  status: 'PAUSED',
  effective_status: 'PAUSED',
  objective: 'OUTCOME_LEADS',
  daily_budget: '500000',
  lifetime_budget: null,
  spend_cap: '900000',
  special_ad_categories: ['NONE'],
  created_time: '2026-11-01T00:00:00+0000',
  updated_time: '2026-11-02T00:00:00+0000',
  start_time: null,
  stop_time: null,
};

const baseAdSet = {
  name: 'Wave — Leads IN',
  campaignId: '9001',
  dailyBudget: 500000,
  billingEvent: 'IMPRESSIONS',
  optimizationGoal: 'LEAD_GENERATION',
  pageId: PAGE_1,
  targeting: {
    countries: ['IN'],
    ageMin: 25,
    ageMax: 45,
    genders: [1],
    customAudiences: ['777'],
    publisherPlatforms: ['facebook'],
    facebookPositions: ['feed'],
  },
};

const fetchSpy = () => jest.spyOn(global, 'fetch').mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });

const bodyOf = (callIndex = 0) => JSON.parse(global.fetch.mock.calls[callIndex][1].body);

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

describe('Phase 3+4: form options endpoint (single source of truth)', () => {
  test('returns only creation-valid Meta enums', async () => {
    admin();
    const res = await get('/api/v1/meta-ads/options');
    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(d.campaignObjectives).toEqual(expect.arrayContaining(['OUTCOME_LEADS', 'LEAD_GENERATION', 'OUTCOME_TRAFFIC']));
    expect(d.billingEvents).toEqual(expect.arrayContaining(['IMPRESSIONS', 'LINK_CLICKS']));
    expect(d.billingEvents).not.toContain('CLICKS'); // deprecated, read-only
    expect(d.optimizationGoals).not.toContain('NONE'); // read-only
    expect(d.specialAdCategories).toContain('ISSUES_ELECTIONS_POLITICS');
    expect(d.publisherPlatforms).toEqual(expect.arrayContaining(['facebook', 'instagram']));
    expect(d.facebookPositions).toContain('feed');
    expect(d.budgetUnit).toBe('minor');
  });

  test('options are denied without marketing:view (403), never reach Meta', async () => {
    exec();
    const spy = fetchSpy();
    const res = await get('/api/v1/meta-ads/options', 'spaceezy_session=exec-token');
    expect(res.status).toBe(403);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('Phase 3+4: campaign create — PAUSED by construction', () => {
  test('creates a PAUSED campaign, audits it, and never leaks the token', async () => {
    admin();
    prisma.metaAdsSettings.findUnique.mockResolvedValue(storedRow());
    stubGraph({ campaigns: () => ({ id: '9001' }) });

    const res = await post('/api/v1/meta-ads/campaigns', {
      name: 'Wave City Launch',
      objective: 'OUTCOME_LEADS',
      dailyBudget: 500000,
      specialAdCategories: ['NONE'],
      // status intentionally omitted — schema must default to PAUSED
    });

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ id: '9001', status: 'PAUSED', effectiveStatus: 'PAUSED', objective: 'OUTCOME_LEADS' });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = global.fetch.mock.calls[0];
    expect(String(url)).toContain('/v22.0/act_999000/campaigns');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer DB-TOKEN-SECRET');
    expect(bodyOf(0)).toEqual({
      name: 'Wave City Launch',
      objective: 'OUTCOME_LEADS',
      daily_budget: '500000',
      special_ad_categories: ['NONE'],
      status: 'PAUSED',
    });

    const auditCall = prisma.auditLog.create.mock.calls[0][0].data;
    expect(auditCall.action).toBe('meta.campaign_created');
    expect(auditCall.entityId).toBe('9001');
    expect(auditCall.metadata).toMatchObject({ status: 'PAUSED', objective: 'OUTCOME_LEADS' });

    expect(JSON.stringify(res.body)).not.toContain('DB-TOKEN-SECRET');
    expect(String(url)).not.toContain('DB-TOKEN-SECRET');
  });

  test('rejects ACTIVE creation and invalid payloads before any Meta call', async () => {
    admin();
    prisma.metaAdsSettings.findUnique.mockResolvedValue(storedRow());
    const spy = fetchSpy();

    const invalidBodies = [
      { name: 'X', objective: 'OUTCOME_LEADS', status: 'ACTIVE' },          // activation must be explicit
      { name: 'X', objective: 'NOT_AN_OBJECTIVE' },                          // unknown enum
      { name: '', objective: 'OUTCOME_LEADS' },                              // empty name
      { name: 'X', objective: 'OUTCOME_LEADS', dailyBudget: '1000', lifetimeBudget: '2000' }, // budget XOR
      { name: 'X', objective: 'OUTCOME_LEADS', dailyBudget: '-5' },          // not a subunit amount
    ];
    for (const body of invalidBodies) {
      const res = await post('/api/v1/meta-ads/campaigns', body);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    }
    expect(spy).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });
});

describe('Phase 3+4: campaign view, edit and status', () => {
  test('detail maps Meta fields to the camelCase contract', async () => {
    admin();
    prisma.metaAdsSettings.findUnique.mockResolvedValue(storedRow());
    stubGraph({ '9001': campaignFixture });

    const res = await get('/api/v1/meta-ads/campaigns/9001');

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      id: '9001',
      name: 'Wave City Launch',
      status: 'PAUSED',
      objective: 'OUTCOME_LEADS',
      dailyBudget: '500000',
      spendCap: '900000',
      specialAdCategories: ['NONE'],
    });
    expect(JSON.stringify(res.body)).not.toContain('DB-TOKEN-SECRET');
  });

  test('edit sends only the changed fields and audits', async () => {
    admin();
    prisma.metaAdsSettings.findUnique.mockResolvedValue(storedRow());
    stubGraph({ '9001': ({ init }) => (init.method === 'GET' ? campaignFixture : { success: true }) });

    const res = await patch('/api/v1/meta-ads/campaigns/9001', { name: 'Wave City Launch v2' });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ id: '9001', updated: ['name'] });
    expect(bodyOf(0)).toEqual({ name: 'Wave City Launch v2' });
    expect(prisma.auditLog.create.mock.calls[0][0].data.action).toBe('meta.campaign_updated');
  });

  test('edit with an empty body is rejected before any Meta call', async () => {
    admin();
    prisma.metaAdsSettings.findUnique.mockResolvedValue(storedRow());
    const spy = fetchSpy();

    const res = await patch('/api/v1/meta-ads/campaigns/9001', {});

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(spy).not.toHaveBeenCalled();
  });

  test('pausing needs no confirmation and is audited', async () => {
    admin();
    prisma.metaAdsSettings.findUnique.mockResolvedValue(storedRow());
    stubGraph({ '9001': () => ({ success: true }) });

    const res = await post('/api/v1/meta-ads/campaigns/9001/status', { status: 'PAUSED' });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ id: '9001', status: 'PAUSED' });
    expect(bodyOf(0)).toEqual({ status: 'PAUSED' });
    const auditCall = prisma.auditLog.create.mock.calls[0][0].data;
    expect(auditCall.action).toBe('meta.campaign_status');
    expect(auditCall.metadata).toMatchObject({ status: 'PAUSED' });
  });

  test('activation without confirm:true is rejected before any Meta call', async () => {
    admin();
    prisma.metaAdsSettings.findUnique.mockResolvedValue(storedRow());
    const spy = fetchSpy();

    const res = await post('/api/v1/meta-ads/campaigns/9001/status', { status: 'ACTIVE' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(res.body.errors?.some((e) => e.message.includes('confirm'))).toBe(true);
    expect(spy).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  test('activation with confirm:true performs the status write and is audited', async () => {
    admin();
    prisma.metaAdsSettings.findUnique.mockResolvedValue(storedRow());
    stubGraph({ '9001': () => ({ success: true }) });

    const res = await post('/api/v1/meta-ads/campaigns/9001/status', { status: 'ACTIVE', confirm: true });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ id: '9001', status: 'ACTIVE' });
    expect(bodyOf(0)).toEqual({ status: 'ACTIVE' });
    const auditCall = prisma.auditLog.create.mock.calls[0][0].data;
    expect(auditCall.action).toBe('meta.campaign_status');
    expect(auditCall.metadata).toMatchObject({ status: 'ACTIVE' });
    expect(JSON.stringify(res.body)).not.toContain('DB-TOKEN-SECRET');
  });

  test('disconnected workspace fails closed with 409 and no Meta call', async () => {
    admin();
    prisma.metaAdsSettings.findUnique.mockResolvedValue(undefined); // no row → env mode
    delete process.env.META_ACCESS_TOKEN;
    const spy = fetchSpy();

    const res = await post('/api/v1/meta-ads/campaigns', {
      name: 'X', objective: 'OUTCOME_LEADS',
    });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('META_NOT_CONFIGURED');
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('Phase 3+4: ad sets — validate-only pre-flight, PAUSED creation', () => {
  test('runs Meta validate_only BEFORE creating, with the full targeting payload', async () => {
    admin();
    prisma.metaAdsSettings.findUnique.mockResolvedValue(storedRow());
    stubGraph({
      adsets: ({ init }) => {
        const body = JSON.parse(init.body);
        if (Array.isArray(body.execution_options) && body.execution_options.includes('validate_only')) {
          return { success: true };
        }
        return { id: '7001' };
      },
    });

    const res = await post('/api/v1/meta-ads/adsets', baseAdSet);

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ id: '7001', status: 'PAUSED', campaignId: '9001' });

    expect(global.fetch).toHaveBeenCalledTimes(2);
    for (const [url] of global.fetch.mock.calls) {
      expect(String(url)).toContain('/v22.0/act_999000/adsets');
    }

    const validationBody = bodyOf(0);
    expect(validationBody.execution_options).toEqual(['validate_only']);
    expect(validationBody.status).toBe('PAUSED');
    expect(validationBody.daily_budget).toBe('500000'); // number input normalized to int64 string
    expect(validationBody.targeting).toEqual({
      geo_locations: { countries: ['IN'] },
      age_min: 25,
      age_max: 45,
      genders: [1],
      custom_audiences: [{ id: '777' }],
      publisher_platforms: ['facebook'],
      facebook_positions: ['feed'],
    });
    expect(validationBody.promoted_object).toEqual({ page_id: PAGE_1 });

    const createBody = bodyOf(1);
    expect(createBody.execution_options).toBeUndefined();
    expect(createBody.status).toBe('PAUSED');
    expect(createBody.targeting.geo_locations.countries).toEqual(['IN']);

    const auditCall = prisma.auditLog.create.mock.calls[0][0].data;
    expect(auditCall.action).toBe('meta.adset_created');
    expect(auditCall.metadata).toMatchObject({ status: 'PAUSED', campaignId: '9001' });
    expect(JSON.stringify(res.body)).not.toContain('DB-TOKEN-SECRET');
  });

  test('a failed validate_only blocks the create: one call, no mutation, no audit', async () => {
    admin();
    prisma.metaAdsSettings.findUnique.mockResolvedValue(storedRow());
    stubGraph({
      adsets: () => ({ __status: 400, __body: { error: { message: 'Invalid parameter: targeting', code: 100 } } }),
    });

    const res = await post('/api/v1/meta-ads/adsets', baseAdSet);

    expect(res.status).toBe(502);
    expect(res.body.code).toBe('META_API_ERROR');
    expect(res.body.message).toContain('Invalid parameter: targeting');
    expect(global.fetch).toHaveBeenCalledTimes(1); // only the dry-run — never the mutation
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  test('explicit validate endpoint dry-runs without mutating or auditing', async () => {
    admin();
    prisma.metaAdsSettings.findUnique.mockResolvedValue(storedRow());
    stubGraph({ adsets: () => ({ success: true }) });

    const res = await post('/api/v1/meta-ads/adsets/validate', baseAdSet);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ ok: true, dryRun: true });
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(bodyOf(0).execution_options).toEqual(['validate_only']);
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  test('rejects invalid ad set payloads before any Meta call', async () => {
    admin();
    prisma.metaAdsSettings.findUnique.mockResolvedValue(storedRow());
    const spy = fetchSpy();

    const withoutBudget = { ...baseAdSet };
    delete withoutBudget.dailyBudget;
    const lifetimeNoEnd = { ...baseAdSet };
    delete lifetimeNoEnd.dailyBudget;
    lifetimeNoEnd.lifetimeBudget = '9000000';
    const leadNoPage = { ...baseAdSet };
    delete leadNoPage.pageId;
    const activeStatus = { ...baseAdSet, status: 'ACTIVE' };
    const bothBudgets = { ...baseAdSet, lifetimeBudget: '9000000' };
    const noCountries = { ...baseAdSet, targeting: { countries: [] } };
    const audienceNetworkOnly = { ...baseAdSet, targeting: { countries: ['IN'], publisherPlatforms: ['audience_network'] } };
    const ageRange = { ...baseAdSet, targeting: { countries: ['IN'], ageMin: 45, ageMax: 25 } };
    const badCode = { ...baseAdSet, targeting: { countries: ['in'] } };

    for (const body of [withoutBudget, lifetimeNoEnd, leadNoPage, activeStatus, bothBudgets, noCountries, audienceNetworkOnly, ageRange, badCode]) {
      const res = await post('/api/v1/meta-ads/adsets', body);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    }
    expect(spy).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  test('list supports the campaign edge and status filtering', async () => {
    admin();
    prisma.metaAdsSettings.findUnique.mockResolvedValue(storedRow());
    stubGraph({
      adsets: () => ({
        data: [{ id: '7001', name: 'Set A', campaign_id: '9001', status: 'PAUSED', effective_status: 'PAUSED', daily_budget: '500000', billing_event: 'IMPRESSIONS', optimization_goal: 'LEAD_GENERATION' }],
        paging: { cursors: { after: 'CUR' } },
      }),
    });

    const byCampaign = await get('/api/v1/meta-ads/adsets?campaignId=9001');
    expect(byCampaign.status).toBe(200);
    expect(String(global.fetch.mock.calls[0][0])).toContain('/v22.0/9001/adsets');
    expect(byCampaign.body.data.items[0]).toMatchObject({ id: '7001', campaignId: '9001', optimizationGoal: 'LEAD_GENERATION' });

    const byStatus = await get('/api/v1/meta-ads/adsets?status=PAUSED');
    expect(byStatus.status).toBe(200);
    const url = new URL(String(global.fetch.mock.calls[1][0]));
    expect(url.pathname).toContain('/act_999000/adsets');
    expect(JSON.parse(url.searchParams.get('filtering'))).toEqual([
      { field: 'effective_status', operator: 'IN', value: ['PAUSED'] },
    ]);
  });

  test('ad set edit and activation follow the same contracts as campaigns', async () => {
    admin();
    prisma.metaAdsSettings.findUnique.mockResolvedValue(storedRow());
    stubGraph({ '7001': () => ({ success: true }) });

    const noConfirm = await post('/api/v1/meta-ads/adsets/7001/status', { status: 'ACTIVE' });
    expect(noConfirm.status).toBe(400);

    const edited = await patch('/api/v1/meta-ads/adsets/7001', { name: 'Set A v2', bidAmount: 250 });
    expect(edited.status).toBe(200);
    expect(bodyOf(0)).toEqual({ name: 'Set A v2', bid_amount: 250 });
    expect(prisma.auditLog.create.mock.calls[0][0].data.action).toBe('meta.adset_updated');

    const activated = await post('/api/v1/meta-ads/adsets/7001/status', { status: 'ACTIVE', confirm: true });
    expect(activated.status).toBe(200);
    expect(prisma.auditLog.create.mock.calls[1][0].data.action).toBe('meta.adset_status');
    expect(prisma.auditLog.create.mock.calls[1][0].data.metadata).toMatchObject({ status: 'ACTIVE' });
  });
});

describe('Phase 3+4: audiences (saved read-only, custom manageable)', () => {
  test('lists saved and custom audiences from their own edges', async () => {
    admin();
    prisma.metaAdsSettings.findUnique.mockResolvedValue(storedRow());
    stubGraph({
      saved_audiences: { data: [{ id: '111', name: 'Site visitors 30d' }], paging: {} },
      customaudiences: { data: [{ id: '222', name: 'Customer upload', description: 'CSV', subtype: 'CUSTOM' }], paging: {} },
    });

    const res = await get('/api/v1/meta-ads/audiences');

    expect(res.status).toBe(200);
    expect(res.body.data.saved.items).toEqual([expect.objectContaining({ id: '111', type: 'saved', name: 'Site visitors 30d' })]);
    expect(res.body.data.custom.items).toEqual([expect.objectContaining({ id: '222', type: 'custom', subtype: 'CUSTOM' })]);
    const urls = global.fetch.mock.calls.map(([u]) => String(u));
    expect(urls.some((u) => u.includes('/saved_audiences'))).toBe(true);
    expect(urls.some((u) => u.includes('/customaudiences'))).toBe(true);
    expect(JSON.stringify(res.body)).not.toContain('DB-TOKEN-SECRET');
  });

  test('creates a blank CUSTOM container and audits it', async () => {
    admin();
    prisma.metaAdsSettings.findUnique.mockResolvedValue(storedRow());
    stubGraph({ customaudiences: () => ({ id: '222' }) });

    const res = await post('/api/v1/meta-ads/audiences', { name: 'Retargeting pool', description: 'Site visitors' });

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ id: '222', subtype: 'CUSTOM', type: 'custom' });
    expect(bodyOf(0)).toEqual({ name: 'Retargeting pool', description: 'Site visitors', subtype: 'CUSTOM' });
    expect(prisma.auditLog.create.mock.calls[0][0].data.action).toBe('meta.audience_created');
  });

  test('rename audits; empty updates are rejected before any Meta call', async () => {
    admin();
    prisma.metaAdsSettings.findUnique.mockResolvedValue(storedRow());
    stubGraph({ '222': () => ({ success: true }) });

    const empty = await patch('/api/v1/meta-ads/audiences/222', {});
    expect(empty.status).toBe(400);

    const renamed = await patch('/api/v1/meta-ads/audiences/222', { name: 'Pool v2' });
    expect(renamed.status).toBe(200);
    expect(bodyOf(0)).toEqual({ name: 'Pool v2' });
    expect(prisma.auditLog.create.mock.calls[0][0].data.action).toBe('meta.audience_updated');
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test('deletion requires ?confirm=true, uses DELETE, and is audited', async () => {
    admin();
    prisma.metaAdsSettings.findUnique.mockResolvedValue(storedRow());
    stubGraph({ '222': () => ({ success: true }) });

    const unconfirmed = await del('/api/v1/meta-ads/audiences/222');
    expect(unconfirmed.status).toBe(400);
    expect(global.fetch).not.toHaveBeenCalled();

    const confirmed = await del('/api/v1/meta-ads/audiences/222?confirm=true');
    expect(confirmed.status).toBe(200);
    expect(confirmed.body.data).toMatchObject({ id: '222', deleted: true });
    expect(global.fetch.mock.calls[0][1].method).toBe('DELETE');
    expect(String(global.fetch.mock.calls[0][0])).toContain('/v22.0/222');
    expect(prisma.auditLog.create.mock.calls[0][0].data.action).toBe('meta.audience_deleted');
  });
});

describe('Phase 3+4: RBAC on the new surface', () => {
  test('executive is denied on every management route (403), no Meta call', async () => {
    exec();
    const spy = fetchSpy();
    const cases = [
      ['get', '/api/v1/meta-ads/options'],
      ['get', '/api/v1/meta-ads/campaigns/9001'],
      ['post', '/api/v1/meta-ads/campaigns'],
      ['patch', '/api/v1/meta-ads/campaigns/9001'],
      ['post', '/api/v1/meta-ads/campaigns/9001/status'],
      ['get', '/api/v1/meta-ads/adsets'],
      ['get', '/api/v1/meta-ads/adsets/7001'],
      ['post', '/api/v1/meta-ads/adsets'],
      ['post', '/api/v1/meta-ads/adsets/validate'],
      ['patch', '/api/v1/meta-ads/adsets/7001'],
      ['post', '/api/v1/meta-ads/adsets/7001/status'],
      ['get', '/api/v1/meta-ads/audiences'],
      ['post', '/api/v1/meta-ads/audiences'],
      ['patch', '/api/v1/meta-ads/audiences/222'],
      ['delete', '/api/v1/meta-ads/audiences/222?confirm=true'],
    ];
    for (const [method, path] of cases) {
      const res = await request(app)[method](path).set('Cookie', 'spaceezy_session=exec-token').send({});
      expect(res.status).toBe(403);
    }
    expect(spy).not.toHaveBeenCalled();
  });

  test('sales manager can read but not manage', async () => {
    manager();
    prisma.metaAdsSettings.findUnique.mockResolvedValue(storedRow());
    stubGraph({ '9001': campaignFixture });

    const view = await get('/api/v1/meta-ads/campaigns/9001', 'spaceezy_session=manager-token');
    expect(view.status).toBe(200);

    const manage = await post('/api/v1/meta-ads/campaigns', { name: 'X', objective: 'OUTCOME_LEADS' }, 'spaceezy_session=manager-token');
    expect(manage.status).toBe(403);

    const validateRun = await post('/api/v1/meta-ads/adsets/validate', baseAdSet, 'spaceezy_session=manager-token');
    expect(validateRun.status).toBe(403);

    const remove = await del('/api/v1/meta-ads/audiences/222?confirm=true', 'spaceezy_session=manager-token');
    expect(remove.status).toBe(403);
    // Only the single permitted GET ever reached the provider.
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
