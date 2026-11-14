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

// Phase 2A/2B/2C: Instant Form discovery, per-form sync config and field
// mapping — permissions, honest error handling, validation and RBAC.
// All Graph traffic is stubbed; no real Meta call ever happens.

const ORG = '11111111-1111-4111-8111-111111111111';
const PAGE_1 = '111222333444';
const PAGE_2 = '555666777888';
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

const get = (path, cookie = 'spaceezy_session=admin-token') =>
  request(app).get(path).set('Cookie', cookie);
const post = (path, body, cookie = 'spaceezy_session=admin-token') =>
  request(app).post(path).set('Cookie', cookie).send(body || {});
const put = (path, body, cookie = 'spaceezy_session=admin-token') =>
  request(app).put(path).set('Cookie', cookie).send(body || {});

// Graph stub keyed by the path after the API version. A handler may be a
// static body, a { __status, __body } failure, or a function
// ({ params, count, key }) for stateful/paginated edges.
const respond = (result) => {
  if (result && result.__status) {
    return { ok: false, status: result.__status, json: async () => result.__body || {} };
  }
  return { ok: true, status: 200, json: async () => result };
};

const stubGraph = (routes) => {
  const counts = {};
  return jest.spyOn(global, 'fetch').mockImplementation(async (url, opts = {}) => {
    const u = new URL(String(url));
    const segs = u.pathname.split('/').filter(Boolean).slice(1); // drop version
    const key = segs.join('/');
    counts[key] = (counts[key] || 0) + 1;
    let handler = routes[key];
    if (handler === undefined) handler = routes[segs[segs.length - 1]];
    if (handler === undefined) {
      return respond({ __status: 404, __body: { error: { message: `No stub for ${key}`, code: 100 } } });
    }
    const value = typeof handler === 'function'
      ? handler({ params: u.searchParams, count: counts[key], key, opts })
      : handler;
    return respond(value);
  });
};

const storedRow = (overrides = {}) => ({
  id: 'settings-row',
  organizationId: ORG,
  accessTokenEnc: encryptSecret('DB-TOKEN-SECRET', ENC),
  appSecretEnc: encryptSecret('DB-APP-SECRET', ENC),
  selectedAdAccountIds: ['999000'],
  pageIds: [PAGE_1, PAGE_2],
  instagramAccountIds: [],
  graphVersion: 'v22.0',
  tokenExpiresAt: null,
  syncedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
  savedMetaEnv = {};
  for (const key of META_ENV_KEYS) {
    savedMetaEnv[key] = process.env[key];
    delete process.env[key];
  }
  process.env.META_ADS_SETTINGS_KEY = META_KEY;
  process.env.META_ACCESS_TOKEN = 'env-discovery-token';
  process.env.META_PAGE_ID = PAGE_1;
  prisma.organization.findFirst.mockResolvedValue({ id: ORG });
  prisma.auditLog.create.mockResolvedValue({ id: 'audit-1' });
  // jest.clearAllMocks() does NOT reset mock implementations — reset the
  // lookups that steer control flow so every test starts in env mode with
  // "no saved form config" unless it opts in explicitly.
  prisma.metaAdsSettings.findUnique.mockResolvedValue(undefined);
  prisma.metaLeadFormConfig.findUnique.mockResolvedValue(null);
  prisma.metaLeadFormConfig.findMany.mockResolvedValue([]);
  prisma.metaLeadSyncRun.findMany.mockResolvedValue([]);
  prisma.metaLeadSyncRun.count.mockResolvedValue(0);
  prisma.metaLeadSyncEvent.count.mockResolvedValue(0);
  admin();
});

afterEach(() => {
  jest.restoreAllMocks();
  for (const key of META_ENV_KEYS) {
    if (savedMetaEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedMetaEnv[key];
  }
});

describe('Phase 2A: Instant Form discovery', () => {
  test('lists forms per configured Page, merges saved config and flags missingFromMeta', async () => {
    prisma.metaAdsSettings.findUnique.mockResolvedValue(storedRow());
    prisma.metaLeadFormConfig.findMany.mockResolvedValue([
      { formId: '333', pageId: PAGE_1, formName: 'Old Form', isEnabled: false, fieldMapping: [{ questionKey: 'name', crmField: 'fullName' }], lastSyncedAt: new Date('2026-01-05T00:00:00Z') },
    ]);
    stubGraph({
      [`${PAGE_1}/leadgen_forms`]: { data: [{ id: '111', name: 'Site Visit Form', status: 'ACTIVE', created_time: '2026-02-01' }] },
      [`${PAGE_2}/leadgen_forms`]: { data: [{ id: '222', name: 'Brochure Form', status: 'PAUSED', created_time: '2026-01-15' }] },
    });

    const res = await get('/api/v1/meta-ads/lead-forms');
    expect(res.status).toBe(200);
    const { items, errors, statusUnavailable, pages } = res.body.data;
    expect(errors).toEqual([]);
    expect(statusUnavailable).toBe(false);
    expect(pages).toBe(2);
    expect(items).toHaveLength(3);

    const configured = items.find((i) => i.formId === '111');
    expect(configured).toMatchObject({
      formName: 'Site Visit Form', status: 'ACTIVE', pageId: PAGE_1,
      configured: false, isEnabled: true, missingFromMeta: false,
    });

    const disabled = items.find((i) => i.formId === '333');
    expect(disabled).toMatchObject({
      missingFromMeta: true, configured: true, isEnabled: false, mappingCount: 1,
    });

    // No credential material in any response; the token travels only in
    // the Authorization header, never the URL.
    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toContain('DB-TOKEN-SECRET');
    expect(serialized).not.toContain('env-discovery-token');
    const fetchMock = global.fetch;
    for (const call of fetchMock.mock.calls) {
      expect(String(call[0])).not.toContain('DB-TOKEN-SECRET');
      expect(String(call[0])).not.toContain('env-discovery-token');
      expect(call[1].headers.Authorization).toBe('Bearer DB-TOKEN-SECRET');
    }
  });

  test('walks paginated leadgen_forms cursors until exhausted', async () => {
    stubGraph({
      [`${PAGE_1}/leadgen_forms`]: ({ count }) => {
        if (count === 1) return { data: [{ id: '111', name: 'Form 1', status: 'ACTIVE' }], paging: { cursors: { after: 'cursor-1' } } };
        if (count === 2) return { data: [{ id: '112', name: 'Form 2', status: 'ACTIVE' }], paging: { cursors: { after: 'cursor-2' } } };
        return { data: [{ id: '113', name: 'Form 3', status: 'ACTIVE' }] };
      },
    });

    const res = await get('/api/v1/meta-ads/lead-forms');
    expect(res.status).toBe(200);
    expect(res.body.data.items.map((i) => i.formId).sort()).toEqual(['111', '112', '113']);
    expect(res.body.data.truncated).toBe(false);
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  test('unreadable form status degrades to basic fields honestly (statusUnavailable, status null)', async () => {
    stubGraph({
      [`${PAGE_1}/leadgen_forms`]: ({ params }) => {
        if (String(params.get('fields') || '').includes('status')) {
          return { __status: 400, __body: { error: { message: 'Unknown field status', code: 100 } } };
        }
        return { data: [{ id: '111', name: 'Form One' }] };
      },
    });

    const res = await get('/api/v1/meta-ads/lead-forms');
    expect(res.status).toBe(200);
    expect(res.body.data.statusUnavailable).toBe(true);
    expect(res.body.data.items[0].status).toBeNull(); // never invented
    expect(res.body.data.items[0].formName).toBe('Form One');
  });

  test('per-Page permission failure degrades to an error entry; rate limits still fail honestly', async () => {
    prisma.metaAdsSettings.findUnique.mockResolvedValue(storedRow());
    stubGraph({
      [`${PAGE_1}/leadgen_forms`]: { __status: 403, __body: { error: { message: 'Permission denied', code: 200 } } },
      [`${PAGE_2}/leadgen_forms`]: { data: [{ id: '222', name: 'Brochure Form', status: 'ACTIVE' }] },
    });

    const res = await get('/api/v1/meta-ads/lead-forms');
    expect(res.status).toBe(200);
    expect(res.body.data.errors).toEqual([
      expect.objectContaining({ pageId: PAGE_1, code: 'META_PERMISSION_DENIED' }),
    ]);
    expect(res.body.data.items.map((i) => i.formId)).toEqual(['222']);

    // Rate limit: whole discovery fails with the real status.
    stubGraph({
      [`${PAGE_1}/leadgen_forms`]: { __status: 429, __body: { error: { message: 'throttled', code: 80004 } } },
    });
    const limited = await get('/api/v1/meta-ads/lead-forms');
    expect(limited.status).toBe(429);
    expect(limited.body.code).toBe('META_RATE_LIMITED');
  });

  test('honest configuration errors: no Pages (409), foreign pageId (400), missing token (409)', async () => {
    delete process.env.META_PAGE_ID;
    const noPages = await get('/api/v1/meta-ads/lead-forms');
    expect(noPages.status).toBe(409);
    expect(noPages.body.code).toBe('META_NOT_CONFIGURED');

    process.env.META_PAGE_ID = PAGE_1;
    const foreign = await get('/api/v1/meta-ads/lead-forms?pageId=999000111');
    expect(foreign.status).toBe(400);
    expect(foreign.body.code).toBe('PAGE_MISMATCH');

    delete process.env.META_ACCESS_TOKEN;
    const noToken = await get('/api/v1/meta-ads/lead-forms');
    expect(noToken.status).toBe(409);
    expect(noToken.body.code).toBe('META_NOT_CONFIGURED');
    expect(JSON.stringify(noToken.body)).not.toContain('token');
  });
});

describe('Phase 2C: form questions for mapping', () => {
  test('returns Meta questions verbatim with the saved mapping attached', async () => {
    prisma.metaLeadFormConfig.findUnique.mockResolvedValue({
      id: 'cfg-1', pageId: PAGE_1, formName: 'Site Visit Form', isEnabled: true,
      fieldMapping: [{ questionKey: 'full_name', questionLabel: 'Full Name', crmField: 'fullName' }],
      lastSyncedAt: null,
    });
    stubGraph({
      '558': {
        id: '558', name: 'Site Visit Form',
        questions: [
          { key: 'full_name', label: 'Full Name', type: 'FULL_NAME', id: 'q1' },
          { key: 'budget', label: 'What is your budget?', type: 'TEXT', id: 'q2' },
        ],
      },
    });

    const res = await get('/api/v1/meta-ads/lead-forms/558/questions');
    expect(res.status).toBe(200);
    const data = res.body.data;
    expect(data.available).toBe(true);
    expect(data.formName).toBe('Site Visit Form');
    expect(data.questions).toEqual([
      { key: 'full_name', label: 'Full Name', type: 'FULL_NAME', questionId: 'q1' },
      { key: 'budget', label: 'What is your budget?', type: 'TEXT', questionId: 'q2' },
    ]);
    expect(data.fieldMapping).toEqual([{ questionKey: 'full_name', questionLabel: 'Full Name', crmField: 'fullName' }]);
    expect(data.isEnabled).toBe(true);
  });

  test('reports unavailable questions honestly instead of inventing them', async () => {
    prisma.metaLeadFormConfig.findUnique.mockResolvedValue(null);
    stubGraph({ '559': { id: '559' } }); // Meta returned no `questions` field

    const res = await get('/api/v1/meta-ads/lead-forms/559/questions');
    expect(res.status).toBe(200);
    expect(res.body.data.available).toBe(false);
    expect(res.body.data.questions).toEqual([]);
  });
});

describe('Phase 2B: enable/disable sync per form', () => {
  test('admin can disable a form after Page/form validation (upsert + audit, no secrets)', async () => {
    prisma.metaLeadFormConfig.upsert.mockResolvedValue({
      id: 'cfg-1', formId: '558', pageId: PAGE_1, formName: 'Site Visit Form',
      isEnabled: false, fieldMapping: [], lastSyncedAt: null,
    });
    stubGraph({
      [`${PAGE_1}/leadgen_forms`]: { data: [{ id: '558', name: 'Site Visit Form', status: 'ACTIVE' }] },
    });

    const res = await post('/api/v1/meta-ads/lead-forms/558/config', {
      isEnabled: false, pageId: PAGE_1, formName: 'Site Visit Form',
    });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ formId: '558', configured: true, isEnabled: false });
    expect(prisma.metaLeadFormConfig.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId_formId: { organizationId: ORG, formId: '558' } },
        update: expect.objectContaining({ isEnabled: false, pageId: PAGE_1 }),
      })
    );
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'meta.lead_forms_updated' }) })
    );
    const serialized = JSON.stringify(prisma.auditLog.create.mock.calls[0][0].data);
    expect(serialized).not.toContain('env-discovery-token');
    expect(serialized).not.toContain('DB-TOKEN-SECRET');
  });

  test('rejects a form that does not belong to the selected Page (400, no write)', async () => {
    stubGraph({
      [`${PAGE_1}/leadgen_forms`]: { data: [{ id: '999', name: 'Other Form' }] },
    });

    const res = await post('/api/v1/meta-ads/lead-forms/558/config', { isEnabled: false, pageId: PAGE_1 });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('FORM_PAGE_MISMATCH');
    expect(prisma.metaLeadFormConfig.upsert).not.toHaveBeenCalled();
  });

  test('rejects a Page outside the connected allow-list before any Meta call (400)', async () => {
    const spy = jest.spyOn(global, 'fetch');
    const res = await post('/api/v1/meta-ads/lead-forms/558/config', { isEnabled: false, pageId: '999000111' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('PAGE_MISMATCH');
    expect(spy).not.toHaveBeenCalled();
    expect(prisma.metaLeadFormConfig.upsert).not.toHaveBeenCalled();
  });
});

describe('Phase 2C: field mapping persistence and validation', () => {
  test('saves a mapping with original labels and unmapped rows (update + audit counts only)', async () => {
    prisma.metaLeadFormConfig.findUnique.mockResolvedValue({
      id: 'cfg-1', formId: '558', pageId: PAGE_1, isEnabled: true,
      fieldMapping: [], lastSyncedAt: null,
    });
    prisma.metaLeadFormConfig.update.mockResolvedValue({
      id: 'cfg-1', formId: '558', pageId: PAGE_1, isEnabled: true,
      fieldMapping: [
        { questionKey: 'full_name', questionLabel: 'Full Name', crmField: 'fullName' },
        { questionKey: 'city', questionLabel: 'City', crmField: null },
      ],
      lastSyncedAt: null,
    });

    const res = await put('/api/v1/meta-ads/lead-forms/558/mapping', {
      pageId: PAGE_1,
      mappings: [
        { questionKey: 'full_name', questionLabel: 'Full Name', crmField: 'fullName' },
        { questionKey: 'city', questionLabel: 'City', crmField: null },
      ],
    });
    expect(res.status).toBe(200);
    expect(res.body.data.fieldMapping).toEqual([
      { questionKey: 'full_name', questionLabel: 'Full Name', crmField: 'fullName' },
      { questionKey: 'city', questionLabel: 'City', crmField: null },
    ]);
    expect(res.body.data.mappingCount).toBe(2);
    expect(prisma.metaLeadFormConfig.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'cfg-1' },
        data: { fieldMapping: expect.arrayContaining([
          expect.objectContaining({ questionKey: 'city', crmField: null }),
        ]) },
      })
    );
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({
        action: 'meta.lead_mapping_updated',
        metadata: { formId: '558', mapped: 1, unmapped: 1 },
      }) })
    );
    // Audit carries counts only — never the question labels or answers.
    const serialized = JSON.stringify(prisma.auditLog.create.mock.calls[0][0].data);
    expect(serialized).not.toContain('Full Name');
  });

  test('rejects duplicate CRM targets and unknown fields (400, no write)', async () => {
    prisma.metaLeadFormConfig.findUnique.mockResolvedValue({
      id: 'cfg-1', formId: '558', pageId: PAGE_1, isEnabled: true, fieldMapping: [], lastSyncedAt: null,
    });

    const dup = await put('/api/v1/meta-ads/lead-forms/558/mapping', {
      mappings: [
        { questionKey: 'a', crmField: 'fullName' },
        { questionKey: 'b', crmField: 'fullName' },
      ],
    });
    expect(dup.status).toBe(400);
    expect(dup.body.message).toContain('more than once');

    const unknown = await put('/api/v1/meta-ads/lead-forms/558/mapping', {
      mappings: [{ questionKey: 'a', crmField: 'favoriteColor' }],
    });
    expect(unknown.status).toBe(400);

    expect(prisma.metaLeadFormConfig.update).not.toHaveBeenCalled();
    expect(prisma.metaLeadFormConfig.create).not.toHaveBeenCalled();
  });

  test('first-time mapping requires a valid Page and creates the config row enabled', async () => {
    prisma.metaLeadFormConfig.findUnique.mockResolvedValue(null);
    prisma.metaLeadFormConfig.create.mockResolvedValue({
      id: 'cfg-new', formId: '777', pageId: PAGE_1, formName: null,
      isEnabled: true, fieldMapping: [{ questionKey: 'name', questionLabel: 'Name', crmField: 'fullName' }], lastSyncedAt: null,
    });
    stubGraph({
      [`${PAGE_1}/leadgen_forms`]: { data: [{ id: '777', name: 'New Form' }] },
    });

    const res = await put('/api/v1/meta-ads/lead-forms/777/mapping', {
      pageId: PAGE_1,
      mappings: [{ questionKey: 'name', questionLabel: 'Name', crmField: 'fullName' }],
    });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ configured: true, isEnabled: true });
    expect(prisma.metaLeadFormConfig.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ organizationId: ORG, formId: '777', isEnabled: true }) })
    );
  });

  test('first-time mapping without a Page is rejected (400)', async () => {
    prisma.metaLeadFormConfig.findUnique.mockResolvedValue(null);
    const res = await put('/api/v1/meta-ads/lead-forms/777/mapping', {
      mappings: [{ questionKey: 'name', crmField: 'fullName' }],
    });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(prisma.metaLeadFormConfig.create).not.toHaveBeenCalled();
  });

  test('concurrent first-save race on the unique key falls back to upsert (P2002)', async () => {
    prisma.metaLeadFormConfig.findUnique.mockResolvedValue(null);
    prisma.metaLeadFormConfig.create.mockRejectedValue({ code: 'P2002' });
    prisma.metaLeadFormConfig.upsert.mockResolvedValue({
      id: 'cfg-race', formId: '777', pageId: PAGE_1, isEnabled: true,
      fieldMapping: [{ questionKey: 'name', questionLabel: 'Name', crmField: 'fullName' }], lastSyncedAt: null,
    });
    stubGraph({
      [`${PAGE_1}/leadgen_forms`]: { data: [{ id: '777', name: 'New Form' }] },
    });

    const res = await put('/api/v1/meta-ads/lead-forms/777/mapping', {
      pageId: PAGE_1,
      mappings: [{ questionKey: 'name', questionLabel: 'Name', crmField: 'fullName' }],
    });
    expect(res.status).toBe(200);
    expect(prisma.metaLeadFormConfig.upsert).toHaveBeenCalled();
  });
});

describe('Phase 2: RBAC on lead form routes', () => {
  test('executives are denied on every lead-form/lead-sync route (403)', async () => {
    exec();
    const routes = [
      ['get', '/api/v1/meta-ads/lead-forms'],
      ['get', '/api/v1/meta-ads/lead-forms/558/questions'],
      ['post', '/api/v1/meta-ads/lead-forms/558/config'],
      ['put', '/api/v1/meta-ads/lead-forms/558/mapping'],
      ['get', '/api/v1/meta-ads/lead-sync/history'],
      ['post', '/api/v1/meta-ads/lead-sync/backfill'],
      ['post', '/api/v1/meta-ads/lead-sync/retry'],
    ];
    for (const [method, path] of routes) {
      const res = await request(app)[method](path)
        .set('Cookie', 'spaceezy_session=exec-token')
        .send({ isEnabled: false, pageId: PAGE_1, runId: '11111111-1111-4111-8111-111111111111', formId: '558' });
      expect(res.status).toBe(403);
    }
    expect(prisma.metaLeadFormConfig.upsert).not.toHaveBeenCalled();
  });

  test('managers can view but cannot change (view 200, config/mapping/sync 403)', async () => {
    manager();
    stubGraph({ [`${PAGE_1}/leadgen_forms`]: { data: [] } });

    const view = await get('/api/v1/meta-ads/lead-forms', 'spaceezy_session=manager-token');
    expect(view.status).toBe(200);

    const history = await get('/api/v1/meta-ads/lead-sync/history', 'spaceezy_session=manager-token');
    expect(history.status).toBe(200);

    for (const [method, path, body] of [
      ['post', '/api/v1/meta-ads/lead-forms/558/config', { isEnabled: false, pageId: PAGE_1 }],
      ['put', '/api/v1/meta-ads/lead-forms/558/mapping', { pageId: PAGE_1, mappings: [] }],
      ['post', '/api/v1/meta-ads/lead-sync/backfill', { pageId: PAGE_1, formId: '558' }],
      ['post', '/api/v1/meta-ads/lead-sync/retry', { runId: '11111111-1111-4111-8111-111111111111' }],
    ]) {
      const res = await request(app)[method](path)
        .set('Cookie', 'spaceezy_session=manager-token')
        .send(body);
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('FORBIDDEN');
    }
    expect(prisma.metaLeadFormConfig.upsert).not.toHaveBeenCalled();
    expect(prisma.metaLeadFormConfig.create).not.toHaveBeenCalled();
  });
});
