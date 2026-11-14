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

// Phase 5 — creative library, ad creatives, ads and previews. Everything
// Graph-facing is stubbed: no live credentials, no network, no real Meta
// account. Safety contracts under test: size-gated uploads before decode,
// validate_only pre-flight before every create, ads forced PAUSED at
// creation, activation only via confirm:true, ?confirm=true on every
// permanent delete, duplicate forced to status_option=PAUSED, honest
// per-format preview errors, RBAC (marketing:view / marketing:manage) and
// zero credential leakage in responses.

const ORG = '11111111-1111-4111-8111-111111111111';
const PAGE_1 = '111222333444';
const META_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const ENC = { keyEnv: 'META_ADS_SETTINGS_KEY', label: 'Meta Ads settings' };
const IMAGE_HASH = 'a1b2c3d4e5f67890a1b2c3d4e5f67890';

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

// Routes Graph calls by the LAST path segment (same trick as the Phase 3+4
// suite). A handler may be a plain payload or a function receiving the
// request so one segment can answer GET/POST/DELETE differently.
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

const fetchSpy = () => jest.spyOn(global, 'fetch').mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
const bodyOf = (callIndex = 0) => JSON.parse(global.fetch.mock.calls[callIndex][1].body);

const baseCreative = {
  name: 'Wave City — Hero',
  mediaType: 'image',
  imageHash: IMAGE_HASH,
  pageId: PAGE_1,
  link: 'https://example.com/wave-city',
  message: 'Book your site visit this weekend',
  headline: 'Wave City Villas',
  ctaType: 'BOOK_NOW',
};

const baseAd = { name: 'Wave — Ad 1', adsetId: '9100', creativeId: '5001' };

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

describe('Phase 5: form options expose creative/preview/upload constants', () => {
  test('returns CTA types, ad formats, compatibility labels and upload caps', async () => {
    admin();
    const res = await get('/api/v1/meta-ads/options');
    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(d.ctaTypes).toEqual(expect.arrayContaining(['BOOK_NOW', 'GET_QUOTE', 'LEARN_MORE', 'CONTACT_US']));
    expect(d.adFormats).toEqual(expect.arrayContaining(['DESKTOP_FEED_STANDARD', 'INSTAGRAM_STORY', 'INSTAGRAM_REELS']));
    const reels = d.previewFormats.find((f) => f.format === 'INSTAGRAM_REELS');
    expect(reels).toMatchObject({ compatibility: 'extended' });
    const feed = d.previewFormats.find((f) => f.format === 'DESKTOP_FEED_STANDARD');
    expect(feed).toMatchObject({ compatibility: 'documented' });
    expect(d.imageMimeTypes).toEqual(expect.arrayContaining(['image/jpeg', 'image/png']));
    expect(d.videoMimeTypes).toEqual(expect.arrayContaining(['video/mp4']));
    expect(d.limits).toEqual({ maxImageBytes: 8 * 1024 * 1024, maxVideoBytes: 50 * 1024 * 1024 });
    expect(d.budgetUnit).toBe('minor');
    expect(JSON.stringify(res.body)).not.toContain('DB-TOKEN-SECRET');
  });
});

describe('Phase 5: image media library', () => {
  test('uploads an image, audits it, and never leaks the token', async () => {
    admin();
    prisma.metaAdsSettings.findUnique.mockResolvedValue(storedRow());
    stubGraph({
      adimages: () => ({ 'hero.jpg': { hash: IMAGE_HASH, url: 'https://cdn/hero.jpg', url_128: 'https://cdn/128.jpg', width: 1200, height: 628 } }),
    });

    const res = await post('/api/v1/meta-ads/creative/images', {
      fileName: 'hero.jpg',
      mimeType: 'image/jpeg',
      dataBase64: 'aGVsbG8=',
      name: 'Hero',
    });

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ hash: IMAGE_HASH, width: 1200, height: 628 });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = global.fetch.mock.calls[0];
    expect(String(url)).toContain('/v22.0/act_999000/adimages');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer DB-TOKEN-SECRET');
    expect(bodyOf(0)).toEqual({ bytes: 'aGVsbG8=' });

    const auditCall = prisma.auditLog.create.mock.calls[0][0].data;
    expect(auditCall.action).toBe('meta.media_uploaded');
    expect(auditCall.entityId).toBe(IMAGE_HASH);
    expect(auditCall.metadata).toMatchObject({ mediaType: 'image', fileName: 'hero.jpg' });

    expect(JSON.stringify(res.body)).not.toContain('DB-TOKEN-SECRET');
    expect(String(url)).not.toContain('DB-TOKEN-SECRET');
  });

  test('rejects oversized payloads and bad filenames before any Meta call', async () => {
    admin();
    prisma.metaAdsSettings.findUnique.mockResolvedValue(storedRow());
    const spy = fetchSpy();

    // >8 MB decoded (12M base64 chars ≈ 9 MB > 8,388,608 bytes).
    const oversize = await post('/api/v1/meta-ads/creative/images', {
      fileName: 'big.jpg', mimeType: 'image/jpeg', dataBase64: 'A'.repeat(12_000_000),
    });
    expect(oversize.status).toBe(400);
    expect(oversize.body.code).toBe('VALIDATION_ERROR');

    // Filename must carry its extension (Meta derives type from it).
    const noExt = await post('/api/v1/meta-ads/creative/images', {
      fileName: 'hero', mimeType: 'image/jpeg', dataBase64: 'aGVsbG8=',
    });
    expect(noExt.status).toBe(400);

    // MIME type must be in the documented image set.
    const badMime = await post('/api/v1/meta-ads/creative/images', {
      fileName: 'hero.svg', mimeType: 'image/svg+xml', dataBase64: 'aGVsbG8=',
    });
    expect(badMime.status).toBe(400);

    expect(spy).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  test('deletes an image only with ?confirm=true, passing the hash as a query param', async () => {
    admin();
    prisma.metaAdsSettings.findUnique.mockResolvedValue(storedRow());

    const denied = fetchSpy();
    const noConfirm = await del(`/api/v1/meta-ads/creative/images/${IMAGE_HASH}`);
    expect(noConfirm.status).toBe(400);
    expect(denied).not.toHaveBeenCalled();

    stubGraph({ adimages: () => ({ success: true }) });
    const ok = await del(`/api/v1/meta-ads/creative/images/${IMAGE_HASH}?confirm=true`);
    expect(ok.status).toBe(200);
    expect(ok.body.data).toMatchObject({ hash: IMAGE_HASH, deleted: true });

    const [url, init] = global.fetch.mock.calls[0];
    expect(init.method).toBe('DELETE');
    // DELETE params ride on the query string (required by adimages delete).
    expect(String(url)).toContain(`hash=${IMAGE_HASH}`);
    expect(prisma.auditLog.create.mock.calls[0][0].data.action).toBe('meta.media_deleted');
    expect(JSON.stringify(ok.body)).not.toContain('DB-TOKEN-SECRET');
  });
});

describe('Phase 5: video media library', () => {
  test('uploads a video via multipart form and audits it', async () => {
    admin();
    prisma.metaAdsSettings.findUnique.mockResolvedValue(storedRow());
    stubGraph({ advideos: () => ({ id: '7001', success: true }) });

    const res = await post('/api/v1/meta-ads/creative/videos', {
      fileName: 'tour.mp4',
      mimeType: 'video/mp4',
      dataBase64: 'aGVsbG8=',
      name: 'Project tour',
      description: '60s walkthrough',
    });

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ id: '7001' });

    const [url, init] = global.fetch.mock.calls[0];
    expect(String(url)).toContain('/v22.0/act_999000/advideos');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer DB-TOKEN-SECRET');
    // Multipart upload — the file rides as FormData, not JSON.
    expect(init.body).toBeInstanceOf(FormData);
    expect(prisma.auditLog.create.mock.calls[0][0].data.action).toBe('meta.media_uploaded');
    expect(JSON.stringify(res.body)).not.toContain('DB-TOKEN-SECRET');
  });

  test('service re-checks the decoded video size before any network work', async () => {
    admin();
    prisma.metaAdsSettings.findUnique.mockResolvedValue(storedRow());
    const spy = fetchSpy();
    const MetaCreativeService = require('../src/services/metaCreativeService');

    await expect(MetaCreativeService.uploadVideo({
      organizationId: ORG,
      userId: 'admin-user',
      fileName: 'huge.mp4',
      mimeType: 'video/mp4',
      // >50 MB decoded.
      dataBase64: 'A'.repeat(68 * 1024 * 1024),
    })).rejects.toMatchObject({ statusCode: 400, code: 'VALIDATION_ERROR' });

    expect(spy).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  test('video delete requires ?confirm=true', async () => {
    admin();
    prisma.metaAdsSettings.findUnique.mockResolvedValue(storedRow());
    const spy = fetchSpy();

    const noConfirm = await del('/api/v1/meta-ads/creative/videos/7001');
    expect(noConfirm.status).toBe(400);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('Phase 5: ad creatives', () => {
  test('creates a creative after a validate_only dry-run, with a JSON story spec', async () => {
    admin();
    prisma.metaAdsSettings.findUnique.mockResolvedValue(storedRow());
    const bodies = [];
    stubGraph({
      adcreatives: ({ init }) => {
        bodies.push(JSON.parse(init.body));
        return bodies.length === 1 ? { success: true } : { id: '5001' };
      },
    });

    const res = await post('/api/v1/meta-ads/creatives', baseCreative);

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      id: '5001',
      pageId: PAGE_1,
      callToActionType: 'BOOK_NOW',
      imageHash: IMAGE_HASH,
      mediaType: 'image',
    });

    // Two calls: validate_only first, real create second.
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(bodies[0].execution_options).toEqual(['validate_only']);
    expect(bodies[1].execution_options).toBeUndefined();
    expect(bodies[1].name).toBe('Wave City — Hero');
    // object_story_spec travels as a JSON STRING with the required page.
    expect(typeof bodies[1].object_story_spec).toBe('string');
    const spec = JSON.parse(bodies[1].object_story_spec);
    expect(spec.page_id).toBe(PAGE_1);
    expect(spec.link_data).toMatchObject({
      link: 'https://example.com/wave-city',
      name: 'Wave City Villas',
      image_hash: IMAGE_HASH,
      call_to_action: { type: 'BOOK_NOW', value: { link: 'https://example.com/wave-city' } },
    });

    const auditCall = prisma.auditLog.create.mock.calls[0][0].data;
    expect(auditCall.action).toBe('meta.creative_created');
    expect(auditCall.entityId).toBe('5001');
    expect(JSON.stringify(res.body)).not.toContain('DB-TOKEN-SECRET');
    expect(String(global.fetch.mock.calls[0][0])).not.toContain('DB-TOKEN-SECRET');
  });

  test('explicit validate endpoint dry-runs only — one call, no audit row', async () => {
    admin();
    prisma.metaAdsSettings.findUnique.mockResolvedValue(storedRow());
    stubGraph({ adcreatives: () => ({ success: true }) });

    const res = await post('/api/v1/meta-ads/creatives/validate', baseCreative);

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ ok: true, dryRun: true });
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(bodyOf(0).execution_options).toEqual(['validate_only']);
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  test('rejects media mismatches before any Meta call', async () => {
    admin();
    prisma.metaAdsSettings.findUnique.mockResolvedValue(storedRow());
    const spy = fetchSpy();

    const invalidBodies = [
      { ...baseCreative, imageHash: undefined },                       // image without hash
      { ...baseCreative, mediaType: 'video' },                         // video without videoId
      { ...baseCreative, mediaType: 'video', videoId: '7001', imageHash: IMAGE_HASH }, // both media
      { ...baseCreative, ctaType: 'NOT_A_CTA' },                       // unknown enum
      { ...baseCreative, link: 'not-a-url' },                          // bad URL
      { ...baseCreative, message: '' },                                // empty copy
      { ...baseCreative, headline: 'x'.repeat(26) },                   // headline > 25
    ];
    for (const body of invalidBodies) {
      const res = await post('/api/v1/meta-ads/creatives', body);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    }
    expect(spy).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  test('rename is the only editable creative field and says content is immutable', async () => {
    admin();
    prisma.metaAdsSettings.findUnique.mockResolvedValue(storedRow());
    stubGraph({ '5001': () => ({ success: true }) });

    const res = await patch('/api/v1/meta-ads/creatives/5001', { name: 'Wave — Hero v2' });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ id: '5001', updated: ['name'], contentEditable: false });
    expect(res.body.data.note).toContain('immutable');
    expect(bodyOf(0)).toEqual({ name: 'Wave — Hero v2' });
    expect(prisma.auditLog.create.mock.calls[0][0].data.action).toBe('meta.creative_updated');
  });

  test('creative delete requires ?confirm=true and audits the deletion', async () => {
    admin();
    prisma.metaAdsSettings.findUnique.mockResolvedValue(storedRow());

    const denied = fetchSpy();
    const noConfirm = await del('/api/v1/meta-ads/creatives/5001');
    expect(noConfirm.status).toBe(400);
    expect(denied).not.toHaveBeenCalled();

    stubGraph({ '5001': () => ({ success: true }) });
    const ok = await del('/api/v1/meta-ads/creatives/5001?confirm=true');
    expect(ok.status).toBe(200);
    expect(ok.body.data).toMatchObject({ id: '5001', deleted: true });
    expect(global.fetch.mock.calls[0][1].method).toBe('DELETE');
    expect(prisma.auditLog.create.mock.calls[0][0].data.action).toBe('meta.creative_deleted');
  });
});

describe('Phase 5: ads — PAUSED by construction', () => {
  test('creates a PAUSED ad after validate + review dry-run, audits it, never leaks the token', async () => {
    admin();
    prisma.metaAdsSettings.findUnique.mockResolvedValue(storedRow());
    const bodies = [];
    stubGraph({
      ads: ({ init }) => {
        bodies.push(JSON.parse(init.body));
        return bodies.length === 1 ? { success: true } : { id: '8001', success: true };
      },
    });

    const res = await post('/api/v1/meta-ads/ads', baseAd);

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      id: '8001',
      status: 'PAUSED',
      adsetId: '9100',
      creativeId: '5001',
      nextStep: 'PENDING_REVIEW',
    });

    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(bodies[0].execution_options).toEqual(['validate_only', 'synchronous_ad_review']);
    expect(bodies[1].execution_options).toBeUndefined();
    expect(bodies[1].status).toBe('PAUSED');
    expect(bodies[1].adset_id).toBe('9100');
    expect(bodies[1].creative).toBe('{"creative_id":"5001"}');
    expect(String(global.fetch.mock.calls[0][0])).toContain('/v22.0/act_999000/ads');
    expect(global.fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer DB-TOKEN-SECRET');

    const auditCall = prisma.auditLog.create.mock.calls[0][0].data;
    expect(auditCall.action).toBe('meta.ad_created');
    expect(auditCall.entityId).toBe('8001');
    expect(auditCall.metadata).toMatchObject({ status: 'PAUSED', adsetId: '9100' });

    expect(JSON.stringify(res.body)).not.toContain('DB-TOKEN-SECRET');
    expect(String(global.fetch.mock.calls[0][0])).not.toContain('DB-TOKEN-SECRET');
  });

  test('rejects ACTIVE creation and invalid payloads before any Meta call', async () => {
    admin();
    prisma.metaAdsSettings.findUnique.mockResolvedValue(storedRow());
    const spy = fetchSpy();

    const invalidBodies = [
      { ...baseAd, status: 'ACTIVE' },              // activation must be explicit
      { ...baseAd, status: 'NOT_A_STATUS' },        // unknown enum
      { ...baseAd, adsetId: 'not-digits' },         // bad id
      { ...baseAd, creativeId: undefined },         // missing creative
      { name: '', adsetId: '9100', creativeId: '5001' }, // empty name
    ];
    for (const body of invalidBodies) {
      const res = await post('/api/v1/meta-ads/ads', body);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    }
    expect(spy).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  test('explicit validate endpoint dry-runs only — one call, no audit row', async () => {
    admin();
    prisma.metaAdsSettings.findUnique.mockResolvedValue(storedRow());
    stubGraph({ ads: () => ({ success: true }) });

    const res = await post('/api/v1/meta-ads/ads/validate', baseAd);

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ ok: true, dryRun: true });
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(bodyOf(0).execution_options).toEqual(['validate_only', 'synchronous_ad_review']);
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  test('lists ads by campaign edge and maps fields', async () => {
    admin();
    prisma.metaAdsSettings.findUnique.mockResolvedValue(storedRow());
    stubGraph({
      ads: () => ({
        data: [{
          id: '8001', name: 'Wave — Ad 1', adset_id: '9100', campaign_id: '9001',
          status: 'PAUSED', configured_status: 'PAUSED', effective_status: 'PENDING_REVIEW',
          creative: { id: '5001' }, created_time: '2026-11-01T00:00:00+0000',
        }],
        summary: { total_count: 1 },
      }),
    });

    const res = await get('/api/v1/meta-ads/ads?campaignId=9001');
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ campaignId: '9001', totalCount: 1 });
    expect(res.body.data.items[0]).toMatchObject({
      id: '8001', campaignId: '9001', effectiveStatus: 'PENDING_REVIEW', creativeId: '5001',
    });
    expect(String(global.fetch.mock.calls[0][0])).toContain('/9001/ads');
  });

  test('campaignId and adsetId filters are mutually exclusive', async () => {
    admin();
    const spy = fetchSpy();
    const res = await get('/api/v1/meta-ads/ads?campaignId=9001&adsetId=9100');
    expect(res.status).toBe(400);
    expect(spy).not.toHaveBeenCalled();
  });

  test('ad detail maps the creative id', async () => {
    admin();
    prisma.metaAdsSettings.findUnique.mockResolvedValue(storedRow());
    stubGraph({
      '8001': () => ({
        id: '8001', name: 'Wave — Ad 1', adset_id: '9100', campaign_id: '9001',
        status: 'PAUSED', effective_status: 'ACTIVE', creative: { id: '5001' },
        preview_shareable_link: 'https://fb.me/abc',
      }),
    });

    const res = await get('/api/v1/meta-ads/ads/8001');
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ id: '8001', creativeId: '5001', previewShareableLink: 'https://fb.me/abc' });
  });
});

describe('Phase 5: ad status, duplicate and delete — explicit confirmations', () => {
  test('pausing does not need confirm; activating requires confirm:true', async () => {
    admin();
    prisma.metaAdsSettings.findUnique.mockResolvedValue(storedRow());

    const spy = fetchSpy();
    const activeNoConfirm = await post('/api/v1/meta-ads/ads/8001/status', { status: 'ACTIVE' });
    expect(activeNoConfirm.status).toBe(400);
    expect(spy).not.toHaveBeenCalled();

    stubGraph({ '8001': () => ({ success: true }) });
    const paused = await post('/api/v1/meta-ads/ads/8001/status', { status: 'PAUSED' });
    expect(paused.status).toBe(200);
    expect(paused.body.data).toMatchObject({ id: '8001', status: 'PAUSED' });
    expect(bodyOf(0)).toEqual({ status: 'PAUSED' });
    expect(prisma.auditLog.create.mock.calls[0][0].data.action).toBe('meta.ad_status');
  });

  test('activation with confirm:true is the only path that can start delivery', async () => {
    admin();
    prisma.metaAdsSettings.findUnique.mockResolvedValue(storedRow());
    stubGraph({ '8001': () => ({ success: true }) });

    const res = await post('/api/v1/meta-ads/ads/8001/status', { status: 'ACTIVE', confirm: true });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ message: 'Ad activated' });
    expect(bodyOf(0)).toEqual({ status: 'ACTIVE' });
    const auditCall = prisma.auditLog.create.mock.calls[0][0].data;
    expect(auditCall.action).toBe('meta.ad_status');
    expect(auditCall.metadata).toMatchObject({ status: 'ACTIVE' });
    expect(JSON.stringify(res.body)).not.toContain('DB-TOKEN-SECRET');
  });

  test('duplicate always forces status_option PAUSED, even if a status is smuggled in', async () => {
    admin();
    prisma.metaAdsSettings.findUnique.mockResolvedValue(storedRow());
    stubGraph({ copies: () => ({ copied_ad_id: '8002' }) });

    // Unknown keys are stripped by zod — no status input exists at all.
    const res = await post('/api/v1/meta-ads/ads/8001/duplicate', { status: 'ACTIVE' });

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ id: '8002', sourceAdId: '8001', status: 'PAUSED' });
    expect(bodyOf(0)).toEqual({ status_option: 'PAUSED' });
    const auditCall = prisma.auditLog.create.mock.calls[0][0].data;
    expect(auditCall.action).toBe('meta.ad_duplicated');
    expect(auditCall.metadata).toMatchObject({ sourceAdId: '8001', status: 'PAUSED' });
  });

  test('duplicate to another ad set keeps the PAUSED status option', async () => {
    admin();
    prisma.metaAdsSettings.findUnique.mockResolvedValue(storedRow());
    stubGraph({ copies: () => ({ copied_ad_id: '8003' }) });

    const res = await post('/api/v1/meta-ads/ads/8001/duplicate', { adsetId: '9200' });

    expect(res.status).toBe(201);
    expect(bodyOf(0)).toEqual({ status_option: 'PAUSED', adset_id: '9200' });
  });

  test('ad delete requires ?confirm=true and audits the deletion', async () => {
    admin();
    prisma.metaAdsSettings.findUnique.mockResolvedValue(storedRow());

    const denied = fetchSpy();
    const noConfirm = await del('/api/v1/meta-ads/ads/8001');
    expect(noConfirm.status).toBe(400);
    expect(denied).not.toHaveBeenCalled();

    stubGraph({ '8001': () => ({ success: true }) });
    const ok = await del('/api/v1/meta-ads/ads/8001?confirm=true');
    expect(ok.status).toBe(200);
    expect(ok.body.data).toMatchObject({ id: '8001', deleted: true });
    expect(global.fetch.mock.calls[0][1].method).toBe('DELETE');
    expect(prisma.auditLog.create.mock.calls[0][0].data.action).toBe('meta.ad_deleted');
    expect(JSON.stringify(ok.body)).not.toContain('DB-TOKEN-SECRET');
  });

  test('ad rename sends only the name field', async () => {
    admin();
    prisma.metaAdsSettings.findUnique.mockResolvedValue(storedRow());
    stubGraph({ '8001': () => ({ success: true }) });

    const res = await patch('/api/v1/meta-ads/ads/8001', { name: 'Wave — Ad 1 v2' });
    expect(res.status).toBe(200);
    expect(bodyOf(0)).toEqual({ name: 'Wave — Ad 1 v2' });
    expect(prisma.auditLog.create.mock.calls[0][0].data.action).toBe('meta.ad_updated');
  });
});

describe('Phase 5: previews — honest per-format results', () => {
  const iframe = '<iframe src="https://www.facebook.com/plugins/preview.php?x=1" width="300"></iframe>';

  test('returns provider iframes per format with the 24h validity note', async () => {
    admin();
    prisma.metaAdsSettings.findUnique.mockResolvedValue(storedRow());
    stubGraph({
      previews: () => ({ data: [{ body: iframe }] }),
    });

    const res = await get('/api/v1/meta-ads/ads/8001/previews?formats=DESKTOP_FEED_STANDARD,MOBILE_FEED_STANDARD');

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ source: 'meta', validHours: 24 });
    expect(res.body.data.previews).toHaveLength(2);
    for (const preview of res.body.data.previews) {
      expect(preview.html).toBe(iframe);
      expect(preview.error).toBeNull();
      expect(preview.source).toBe('meta');
    }
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(String(global.fetch.mock.calls[0][0])).toContain('ad_format=DESKTOP_FEED_STANDARD');
    expect(JSON.stringify(res.body)).not.toContain('DB-TOKEN-SECRET');
  });

  test('a format Meta rejects comes back as an honest error, not a fake preview', async () => {
    admin();
    prisma.metaAdsSettings.findUnique.mockResolvedValue(storedRow());
    stubGraph({
      previews: ({ url }) => {
        const format = new URL(url).searchParams.get('ad_format');
        if (format === 'INSTAGRAM_STORY') {
          return { __status: 400, error: { message: 'Story placement not supported for this creative', code: 100 } };
        }
        return { data: [{ body: iframe }] };
      },
    });

    const res = await get('/api/v1/meta-ads/ads/8001/previews?formats=DESKTOP_FEED_STANDARD,INSTAGRAM_STORY');

    expect(res.status).toBe(200);
    const [feed, story] = res.body.data.previews;
    expect(feed).toMatchObject({ format: 'DESKTOP_FEED_STANDARD', html: iframe, error: null });
    expect(story).toMatchObject({ format: 'INSTAGRAM_STORY', html: null });
    expect(story.error).toContain('Story placement not supported');
  });

  test('when every format fails the request fails — no silent empty gallery', async () => {
    admin();
    prisma.metaAdsSettings.findUnique.mockResolvedValue(storedRow());
    stubGraph({
      previews: () => ({ __status: 400, error: { message: 'Ad not found', code: 803 } }),
    });

    const res = await get('/api/v1/meta-ads/ads/8001/previews?formats=DESKTOP_FEED_STANDARD');
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.body.success).toBe(false);
  });

  test('unknown preview formats are rejected before any Meta call', async () => {
    admin();
    const spy = fetchSpy();
    const res = await get('/api/v1/meta-ads/ads/8001/previews?formats=NOT_A_FORMAT');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(spy).not.toHaveBeenCalled();
  });

  test('creative previews work the same way', async () => {
    admin();
    prisma.metaAdsSettings.findUnique.mockResolvedValue(storedRow());
    stubGraph({ previews: () => ({ data: [{ body: iframe }] }) });

    const res = await get('/api/v1/meta-ads/creatives/5001/previews?formats=INSTAGRAM_STANDARD');
    expect(res.status).toBe(200);
    expect(res.body.data.previews[0]).toMatchObject({ format: 'INSTAGRAM_STANDARD', html: iframe });
    expect(String(global.fetch.mock.calls[0][0])).toContain('/5001/previews');
  });

  test('unsaved-spec preview posts the same story spec, gated by marketing:view only', async () => {
    // SALES_MANAGER has marketing:view but NOT marketing:manage — proving
    // this endpoint is read-only (generatepreviews performs no mutation).
    manager();
    prisma.metaAdsSettings.findUnique.mockResolvedValue(storedRow());
    stubGraph({ generatepreviews: () => ({ data: [{ body: iframe }] }) });

    const res = await post('/api/v1/meta-ads/previews/creative?formats=INSTAGRAM_STANDARD', baseCreative, 'spaceezy_session=manager-token');

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ source: 'meta', unsaved: true, validHours: 24 });
    expect(res.body.data.previews[0].html).toBe(iframe);
    const [url] = global.fetch.mock.calls[0];
    expect(String(url)).toContain('generatepreviews');
    const params = new URL(String(url)).searchParams;
    const creative = JSON.parse(params.get('creative'));
    expect(creative.object_story_spec.page_id).toBe(PAGE_1);
    expect(params.get('ad_format')).toBe('INSTAGRAM_STANDARD');
    // Read-only: nothing is audited and no POST hits a mutating edge.
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });
});

describe('Phase 5: RBAC', () => {
  test('SALES_MANAGER (marketing:view only) can read but never mutate', async () => {
    manager();
    prisma.metaAdsSettings.findUnique.mockResolvedValue(storedRow());
    stubGraph({ ads: () => ({ data: [], summary: { total_count: 0 } }) });

    const read = await get('/api/v1/meta-ads/ads', 'spaceezy_session=manager-token');
    expect(read.status).toBe(200);

    // spyOn on an already-spied fetch returns the same mock with its call
    // history — clear it so only the mutation attempts are counted below.
    global.fetch.mockClear();
    const spy = fetchSpy();
    const mutations = [
      post('/api/v1/meta-ads/ads', baseAd, 'spaceezy_session=manager-token'),
      post('/api/v1/meta-ads/creatives', baseCreative, 'spaceezy_session=manager-token'),
      post('/api/v1/meta-ads/creative/images', { fileName: 'x.jpg', mimeType: 'image/jpeg', dataBase64: 'aGVsbG8=' }, 'spaceezy_session=manager-token'),
      post('/api/v1/meta-ads/ads/8001/status', { status: 'PAUSED' }, 'spaceezy_session=manager-token'),
      patch('/api/v1/meta-ads/ads/8001', { name: 'x' }, 'spaceezy_session=manager-token'),
      del('/api/v1/meta-ads/ads/8001?confirm=true', 'spaceezy_session=manager-token'),
      del('/api/v1/meta-ads/creatives/5001?confirm=true', 'spaceezy_session=manager-token'),
    ];
    for (const call of mutations) {
      const res = await call;
      expect(res.status).toBe(403);
    }
    expect(spy).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  test('SALES_EXECUTIVE (no marketing permission) is denied even reads', async () => {
    exec();
    const spy = fetchSpy();
    const reads = [
      get('/api/v1/meta-ads/creatives', 'spaceezy_session=exec-token'),
      get('/api/v1/meta-ads/ads', 'spaceezy_session=exec-token'),
      get('/api/v1/meta-ads/creative/images', 'spaceezy_session=exec-token'),
    ];
    for (const call of reads) {
      const res = await call;
      expect(res.status).toBe(403);
    }
    expect(spy).not.toHaveBeenCalled();
  });
});
