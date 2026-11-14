const request = require('supertest');
const app = require('../src/app');
const prisma = require('../src/db/prisma');
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
  mock.$transaction = jest.fn(async (fn) => fn(mock));
  return mock;
});

// Meta OAuth App Domain configuration (issue: "Can't load URL — the domain
// of this URL isn't included in the app's domains").
//
// Verifies that the redirect_uri is built, sent to Meta, consumed by the
// callback and reported by the admin-only diagnostic from ONE source of
// truth (BACKEND_URL + the registered callback path), that the diagnostic
// validates internal consistency without ever mutating configuration, and
// that no secret ever appears in the diagnostic payload.
// All Meta API calls are mocked — nothing here talks to production Meta.

const ORG = '11111111-1111-4111-8111-111111111111';
const META_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const CALLBACK_PATH = '/api/v1/meta-ads/oauth/callback';

const META_ENV_KEYS = [
  'META_APP_ID', 'META_APP_SECRET', 'META_ACCESS_TOKEN', 'META_AD_ACCOUNT_ID',
  'META_PAGE_ID', 'META_GRAPH_VERSION', 'META_WEBHOOK_VERIFY_TOKEN',
  'META_ADS_SETTINGS_KEY', 'META_OAUTH_CONFIG_ID',
  'BACKEND_URL', 'FRONTEND_URL', 'SESSION_COOKIE_NAME',
];
let savedMetaEnv;

const mockSession = (role, userId) => {
  prisma.session.findUnique.mockResolvedValue({
    expiresAt: new Date(Date.now() + 60_000),
    user: { id: userId, organizationId: ORG, role, status: 'ACTIVE' },
  });
};
const admin = () => mockSession('ADMIN', 'admin-user');
const superAdmin = () => mockSession('SUPER_ADMIN', 'root-user');
const manager = () => mockSession('SALES_MANAGER', 'manager-user');
const exec = () => mockSession('SALES_EXECUTIVE', 'exec-user');

const get = (path, jar = 'admin-token') =>
  request(app).get(path).set('Cookie', `spaceezy_session=${jar}`);
const post = (path, body, jar = 'admin-token') =>
  request(app).post(path).set('Cookie', `spaceezy_session=${jar}`).send(body || {});

beforeEach(() => {
  jest.clearAllMocks();
  savedMetaEnv = {};
  for (const key of META_ENV_KEYS) {
    savedMetaEnv[key] = process.env[key];
    delete process.env[key];
  }
  process.env.META_ADS_SETTINGS_KEY = META_KEY;
  process.env.META_APP_ID = '1234567890';
  process.env.META_APP_SECRET = 'ENV-APP-SECRET-VALUE';
  process.env.META_ACCESS_TOKEN = 'ENV-ACCESS-TOKEN-VALUE';
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

describe('Meta OAuth: redirect URI construction (single source of truth)', () => {
  test('authorize URL redirect_uri is BACKEND_URL + the registered callback path', async () => {
    admin();
    process.env.BACKEND_URL = 'https://spaceezy.com';

    const res = await post('/api/v1/meta-ads/oauth/state', {});

    expect(res.status).toBe(200);
    const redirectUri = new URL(res.body.data.authorizeUrl).searchParams.get('redirect_uri');
    expect(redirectUri).toBe('https://spaceezy.com/api/v1/meta-ads/oauth/callback');
    expect(new URL(redirectUri).pathname).toBe(CALLBACK_PATH);
  });

  test('token exchange sends the IDENTICAL redirect_uri as the authorize URL', async () => {
    admin();
    process.env.BACKEND_URL = 'https://spaceezy.com';
    const authorizeUrl = (await post('/api/v1/meta-ads/oauth/state', {})).body.data.authorizeUrl;
    const authorizeRedirect = new URL(authorizeUrl).searchParams.get('redirect_uri');
    const state = new URL(authorizeUrl).searchParams.get('state');

    let exchangeUrl = null;
    jest.spyOn(global, 'fetch').mockImplementation(async (url) => {
      exchangeUrl = String(url);
      return { ok: true, status: 200, json: async () => ({ access_token: 'EXCHANGED', expires_in: 3600 }) };
    });
    prisma.metaAdsSettings.upsert.mockImplementation(async ({ create }) => ({
      id: 'row-1', createdAt: new Date(), updatedAt: new Date(), ...create,
    }));

    const cb = await request(app)
      .get(`/api/v1/meta-ads/oauth/callback?code=C&state=${encodeURIComponent(state)}`)
      .set('Cookie', 'spaceezy_session=admin-token');

    expect(cb.status).toBe(302);
    expect(cb.headers.location).toContain('oauth=connected');
    const exchangeRedirect = new URL(exchangeUrl).searchParams.get('redirect_uri');
    expect(exchangeRedirect).toBe(authorizeRedirect); // initiation === callback handling
  });

  test('the constructed redirect URI resolves to the registered callback route (302, not 404)', async () => {
    process.env.BACKEND_URL = 'https://spaceezy.com';
    const { oauthRedirectUri } = MetaAdsSettingsService.getOauthDiagnostics();

    const res = await request(app).get(new URL(oauthRedirectUri).pathname); // no session
    expect(res.status).toBe(302); // route exists; safe ?oauth=login_required flag
    expect(res.headers.location).toContain('oauth=login_required');
  });
});

describe('Meta OAuth: admin-only configuration diagnostic', () => {
  test('reports App Domain, redirect URI, frontend URL, backend URL and consistency', async () => {
    admin();
    process.env.BACKEND_URL = 'https://spaceezy.com';
    process.env.FRONTEND_URL = 'https://www.spaceezy.com';

    const res = await get('/api/v1/meta-ads/settings/oauth-diagnostics');

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      appDomain: 'spaceezy.com', // www stripped — the value for Meta's App Domains field
      oauthRedirectUri: 'https://spaceezy.com/api/v1/meta-ads/oauth/callback',
      frontendUrl: 'https://www.spaceezy.com',
      backendUrl: 'https://spaceezy.com',
      consistent: true,
      issues: [],
    });
    expect(res.body.data.troubleshooting).toContain('App Domains');
    expect(res.body.data.troubleshooting).toContain('Valid OAuth Redirect URIs');
    expect(res.body.data.troubleshooting).toContain("Can't load URL");
  });

  test('flags a missing BACKEND_URL without fabricating a redirect URI', async () => {
    admin();
    delete process.env.BACKEND_URL;

    const res = await get('/api/v1/meta-ads/settings/oauth-diagnostics');

    expect(res.status).toBe(200);
    expect(res.body.data.oauthRedirectUri).toBeNull();
    expect(res.body.data.appDomain).toBeNull();
    expect(res.body.data.consistent).toBe(false);
    expect(res.body.data.issues.join(' ')).toContain('BACKEND_URL');
  });

  test('flags a relative BACKEND_URL and a missing FRONTEND_URL', async () => {
    admin();
    process.env.BACKEND_URL = '/not-an-absolute-url';
    delete process.env.FRONTEND_URL;

    const res = await get('/api/v1/meta-ads/settings/oauth-diagnostics');

    expect(res.body.data.consistent).toBe(false);
    expect(res.body.data.issues.join(' ')).toContain('BACKEND_URL is not an absolute');
    expect(res.body.data.issues.join(' ')).toContain('FRONTEND_URL is not set');
  });

  test('flags a non-HTTPS production backend (Meta requires https redirect URIs)', async () => {
    admin();
    process.env.BACKEND_URL = 'http://spaceezy.com';
    process.env.FRONTEND_URL = 'http://spaceezy.com';

    const res = await get('/api/v1/meta-ads/settings/oauth-diagnostics');

    expect(res.body.data.consistent).toBe(false);
    expect(res.body.data.issues.join(' ')).toContain('HTTPS');
  });

  test('flags backend/frontend served from genuinely different domains', async () => {
    admin();
    process.env.BACKEND_URL = 'https://spaceezy.com';
    process.env.FRONTEND_URL = 'https://other-domain.com';

    const res = await get('/api/v1/meta-ads/settings/oauth-diagnostics');

    expect(res.body.data.consistent).toBe(false);
    expect(res.body.data.issues.join(' ')).toContain('different domains');
  });

  test('apex vs www and localhost http are internally consistent', async () => {
    admin();
    process.env.BACKEND_URL = 'https://spaceezy.com';
    process.env.FRONTEND_URL = 'https://www.spaceezy.com';
    expect(MetaAdsSettingsService.getOauthDiagnostics().consistent).toBe(true);

    process.env.BACKEND_URL = 'http://localhost:8000'; // dev: http allowed
    process.env.FRONTEND_URL = 'http://localhost:3000';
    expect(MetaAdsSettingsService.getOauthDiagnostics().consistent).toBe(true);
  });

  test('never mutates the configured URLs or credentials', async () => {
    admin();
    process.env.BACKEND_URL = 'https://spaceezy.com';
    process.env.FRONTEND_URL = 'https://spaceezy.com';
    const before = { ...process.env };

    await get('/api/v1/meta-ads/settings/oauth-diagnostics');
    MetaAdsSettingsService.getOauthDiagnostics();

    expect(process.env.BACKEND_URL).toBe(before.BACKEND_URL);
    expect(process.env.FRONTEND_URL).toBe(before.FRONTEND_URL);
    expect(process.env.META_APP_SECRET).toBe('ENV-APP-SECRET-VALUE');
    expect(process.env.META_ACCESS_TOKEN).toBe('ENV-ACCESS-TOKEN-VALUE');
  });

  test('never exposes the App Secret, access tokens or the settings key', async () => {
    admin();
    process.env.BACKEND_URL = 'https://spaceezy.com';
    process.env.FRONTEND_URL = 'https://spaceezy.com';

    const res = await get('/api/v1/meta-ads/settings/oauth-diagnostics');

    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toContain('ENV-APP-SECRET-VALUE');
    expect(serialized).not.toContain('ENV-ACCESS-TOKEN-VALUE');
    expect(serialized).not.toContain(META_KEY);
    expect(serialized).not.toMatch(/appSecret|accessToken|"token"/i);
    expect(Object.keys(res.body.data).sort()).toEqual([
      'appDomain', 'backendUrl', 'consistent', 'frontendUrl',
      'issues', 'oauthConfigId', 'oauthFlowNote', 'oauthMode',
      'oauthRedirectUri', 'troubleshooting',
    ]);
  });
});

describe('Meta OAuth: diagnostic RBAC (admin-only)', () => {
  test('admin and super-admin may read the diagnostic', async () => {
    admin();
    expect((await get('/api/v1/meta-ads/settings/oauth-diagnostics')).status).toBe(200);

    superAdmin();
    expect((await get('/api/v1/meta-ads/settings/oauth-diagnostics', 'root-token')).status).toBe(200);
  });

  test('manager and executive are forbidden', async () => {
    manager();
    const asManager = await get('/api/v1/meta-ads/settings/oauth-diagnostics', 'manager-token');
    expect(asManager.status).toBe(403);

    exec();
    const asExec = await get('/api/v1/meta-ads/settings/oauth-diagnostics', 'exec-token');
    expect(asExec.status).toBe(403);
  });

  test('unauthenticated requests are rejected', async () => {
    const res = await request(app).get('/api/v1/meta-ads/settings/oauth-diagnostics');
    expect(res.status).toBe(401);
  });
});

describe('Meta OAuth: Facebook Login for Business config_id (META_OAUTH_CONFIG_ID)', () => {
  const CONFIG_ID = '2088777191773830';

  test('authorize URL uses config_id + override_default_response_type and NO scope', async () => {
    admin();
    process.env.BACKEND_URL = 'https://spaceezy.com';
    process.env.META_OAUTH_CONFIG_ID = CONFIG_ID;

    const res = await post('/api/v1/meta-ads/oauth/state', {});

    expect(res.status).toBe(200);
    const url = new URL(res.body.data.authorizeUrl);
    expect(url.searchParams.get('config_id')).toBe(CONFIG_ID);
    expect(url.searchParams.get('override_default_response_type')).toBe('true');
    // response_type, state and the exact callback URL are unchanged.
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('state')).toMatch(/^v1\./);
    expect(url.searchParams.get('redirect_uri')).toBe('https://spaceezy.com/api/v1/meta-ads/oauth/callback');
    // config_id REPLACES scope — Meta: scope "should not be used" with a configuration.
    expect(url.searchParams.has('scope')).toBe(false);
    expect(res.body.data.authorizeUrl).not.toContain('public_profile');
    expect(res.body.data.authorizeUrl).not.toContain('client_secret');
  });

  test('without META_OAUTH_CONFIG_ID the legacy scope flow is preserved', async () => {
    admin();

    const res = await post('/api/v1/meta-ads/oauth/state', {});

    expect(res.status).toBe(200);
    const url = new URL(res.body.data.authorizeUrl);
    expect(url.searchParams.has('config_id')).toBe(false);
    expect(url.searchParams.has('override_default_response_type')).toBe(false);
    expect(url.searchParams.get('scope')).toContain('ads_read');
    expect(url.searchParams.get('scope')).not.toContain('public_profile');
  });

  test('diagnostics report the config id, mode and flow note (no secrets)', async () => {
    admin();
    process.env.BACKEND_URL = 'https://spaceezy.com';
    process.env.FRONTEND_URL = 'https://spaceezy.com';
    process.env.META_OAUTH_CONFIG_ID = CONFIG_ID;

    const res = await get('/api/v1/meta-ads/settings/oauth-diagnostics');

    expect(res.status).toBe(200);
    expect(res.body.data.oauthConfigId).toBe(CONFIG_ID);
    expect(res.body.data.oauthMode).toBe('config_id');
    expect(res.body.data.oauthFlowNote).toContain('config_id');
    expect(res.body.data.oauthFlowNote).toContain('override_default_response_type');
    expect(res.body.data.consistent).toBe(true);

    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toContain('ENV-APP-SECRET-VALUE');
    expect(serialized).not.toContain('ENV-ACCESS-TOKEN-VALUE');
    expect(serialized).not.toContain(META_KEY);
  });

  test('diagnostics default to legacy_scopes with a null config id when unset', async () => {
    admin();
    process.env.BACKEND_URL = 'https://spaceezy.com';
    process.env.FRONTEND_URL = 'https://spaceezy.com';

    const res = await get('/api/v1/meta-ads/settings/oauth-diagnostics');

    expect(res.body.data.oauthConfigId).toBeNull();
    expect(res.body.data.oauthMode).toBe('legacy_scopes');
    expect(res.body.data.oauthFlowNote).toContain('META_OAUTH_CONFIG_ID');
    expect(res.body.data.consistent).toBe(true);
  });

  test('a malformed META_OAUTH_CONFIG_ID fails closed and is flagged as an issue', async () => {
    admin();
    process.env.BACKEND_URL = 'https://spaceezy.com';
    process.env.FRONTEND_URL = 'https://spaceezy.com';
    process.env.META_OAUTH_CONFIG_ID = 'not-a-numeric-id';

    // The authorize URL builder refuses to send a malformed config id to Meta…
    await expect(MetaAdsSettingsService.createAuthorizeUrl())
      .rejects.toThrow('META_OAUTH_CONFIG_ID');

    // …and the diagnostic reports it without throwing or leaking the raw value.
    const res = await get('/api/v1/meta-ads/settings/oauth-diagnostics');
    expect(res.status).toBe(200);
    expect(res.body.data.consistent).toBe(false);
    expect(res.body.data.issues.join(' ')).toContain('META_OAUTH_CONFIG_ID');
    expect(res.body.data.oauthConfigId).toBeNull();
    expect(res.body.data.oauthMode).toBe('legacy_scopes');
  });
});
