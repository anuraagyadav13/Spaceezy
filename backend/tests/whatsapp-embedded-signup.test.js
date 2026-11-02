const request = require('supertest');
const app = require('../src/app');
const prisma = require('../src/db/prisma');
const { encryptSecret } = require('../src/utils/whatsappSecrets');

jest.mock('../src/db/prisma', () => {
  const mock = {
    session: { findUnique: jest.fn() },
    organization: { findFirst: jest.fn() },
    whatsappSettings: {
      findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn(),
      update: jest.fn(), upsert: jest.fn(), delete: jest.fn(), count: jest.fn(),
    },
    auditLog: { create: jest.fn() },
    $transaction: jest.fn(),
  };
  mock.$transaction.mockImplementation(async (fn) => fn(mock));
  return mock;
});

// WhatsApp Business App Coexistence — Embedded Signup completion endpoint.
// Meta network calls are fully mocked; no real Graph call is ever made here.
// Coverage: coexistence success, cancellation, invalid response, failure
// handling (requirement 14), plus invariants: admin-only, org scoping,
// encrypted-at-rest storage, no secret leakage, and NO number lifecycle
// calls (register/migrate/deregister) anywhere in the flow.

const ORG = '11111111-1111-4111-8111-111111111111';
const TEST_KEY = '0123456789abcdef'.repeat(4);
const ENV_KEYS = ['WHATSAPP_SETTINGS_KEY', 'WHATSAPP_PROVIDER', 'WHATSAPP_PHONE_NUMBER_ID', 'WHATSAPP_ACCESS_TOKEN', 'WHATSAPP_APP_SECRET', 'WHATSAPP_VERIFY_TOKEN', 'WHATSAPP_WEBHOOK_SECRET', 'WHATSAPP_GRAPH_VERSION'];
let savedEnv;

const WABA = '4021318311354952';
const PNID = '111222333444555';
const BUSINESS_TOKEN = 'EAABUSINESS_TOKEN_DO_NOT_LEAK';
const APP_SECRET = 'meta-app-secret-do-not-leak';

const mockSession = (role, userId, organizationId = ORG) => {
  prisma.session.findUnique.mockResolvedValue({
    expiresAt: new Date(Date.now() + 60_000),
    user: { id: userId, organizationId, role, status: 'ACTIVE' },
  });
};
const admin = () => mockSession('ADMIN', 'admin-user');
const cookie = (jar) => `spaceezy_session=${jar}`;

const settingsRow = (overrides = {}) => ({
  organizationId: ORG,
  appId: null,
  wabaId: null,
  phoneNumberId: null,
  graphVersion: 'v21.0',
  providerMode: 'mock',
  notifyEnabled: false,
  notifyRecipients: null,
  notifyTemplateName: null,
  accessTokenEnc: encryptSecret('old-expired-token'),
  appSecretEnc: encryptSecret(APP_SECRET),
  verifyTokenEnc: null,
  updatedAt: new Date(),
  ...overrides,
});

const jsonResponse = (body, { ok = true, status = 200 } = {}) => ({
  ok,
  status,
  json: async () => body,
});

// Route outbound fetches by Graph path — order-independent and strict
// (any unexpected outbound URL throws).
const mockFetchByRoute = ({ exchange, numbers, subscribe = () => jsonResponse({ success: true }) }) =>
  jest.spyOn(global, 'fetch').mockImplementation(async (input, init = {}) => {
    const url = String(input);
    if (url.includes('/oauth/access_token')) return exchange(url, init);
    if (url.includes('/phone_numbers')) return numbers(url, init);
    if (url.includes('/subscribed_apps')) return subscribe(url, init);
    throw new Error(`unexpected outbound call: ${url}`);
  });

const post = (jar, body) => request(app)
  .post('/api/v1/whatsapp/settings/embedded-signup')
  .set('Cookie', cookie(jar))
  .send(body);

const upsertData = () => prisma.whatsappSettings.upsert.mock.calls[0][0];

const embeddedAudit = () => prisma.auditLog.create.mock.calls
  .map((c) => c[0] && c[0].data)
  .find((data) => data && data.action === 'whatsapp.embedded_signup');

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.SESSION_COOKIE_NAME;
  savedEnv = {};
  for (const key of ENV_KEYS) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
  process.env.WHATSAPP_SETTINGS_KEY = TEST_KEY;
  process.env.WHATSAPP_PROVIDER = 'mock';
  prisma.organization.findFirst.mockResolvedValue({ id: ORG });
  prisma.auditLog.create.mockResolvedValue({ id: 'audit-1' });
  prisma.whatsappSettings.upsert.mockImplementation(async ({ where, create, update }) => {
    const payload = create || update || {};
    return {
      organizationId: ORG,
      appId: payload.appId || null,
      wabaId: payload.wabaId || null,
      phoneNumberId: payload.phoneNumberId || null,
      graphVersion: payload.graphVersion || 'v21.0',
      providerMode: payload.providerMode || 'mock',
      notifyEnabled: payload.notifyEnabled !== undefined ? payload.notifyEnabled : false,
      notifyRecipients: payload.notifyRecipients,
      notifyTemplateName: payload.notifyTemplateName,
      accessTokenEnc: payload.accessTokenEnc || encryptSecret('old-expired-token'),
      appSecretEnc: payload.appSecretEnc || encryptSecret(APP_SECRET),
      verifyTokenEnc: payload.verifyTokenEnc || null,
      updatedAt: new Date(),
    };
  });
});

afterEach(() => {
  jest.restoreAllMocks();
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
});

describe('Embedded Signup: coexistence success', () => {
  test('exchanges the code, discovers the number read-only, stores encrypted and subscribes webhooks', async () => {
    admin();
    // 1st read: getEffectiveConfig (pre-save row). 2nd read: getSettings()
    // after the upsert, which saveSettings returns to the caller.
    prisma.whatsappSettings.findUnique
      .mockResolvedValueOnce(settingsRow())
      .mockResolvedValue(settingsRow({
        appId: '1536498651554499',
        wabaId: WABA,
        phoneNumberId: PNID,
        providerMode: 'meta',
        accessTokenEnc: encryptSecret(BUSINESS_TOKEN),
      }));

    const fetchSpy = mockFetchByRoute({
      exchange: (url) => {
        // server-to-server exchange with the EXISTING App ID
        expect(url).toContain('client_id=1536498651554499');
        expect(url).toContain(`client_secret=${encodeURIComponent(APP_SECRET)}`);
        expect(url).toContain('code=SHORT_LIVED_CODE');
        return jsonResponse({ access_token: BUSINESS_TOKEN, token_type: 'bearer' });
      },
      numbers: (url, init) => {
        expect(init.headers.Authorization).toBe(`Bearer ${BUSINESS_TOKEN}`);
        return jsonResponse({ data: [
          { id: PNID, display_phone_number: '917683020204', status: 'CONNECTED' },
        ] });
      },
      subscribe: (url, init) => {
        expect(init.method).toBe('POST');
        return jsonResponse({ success: true, subscribed_apps: [] });
      },
    });

    const res = await post('es1', {
      code: 'SHORT_LIVED_CODE',
      wabaId: WABA,
      event: 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING',
    });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      wabaId: WABA,
      phoneNumberId: PNID,
      displayPhoneNumber: '917683020204',
      webhookSubscribed: true,
      providerMode: 'meta',
      appId: '1536498651554499',
      hasAccessToken: true,
      hasAppSecret: true,
    });

    // stored through the existing encrypted settings service (AES-256-GCM),
    // org-scoped upsert, plaintext token never persisted
    const call = upsertData();
    expect(call.where).toMatchObject({ organizationId: ORG });
    expect(call.update).toMatchObject({
      appId: '1536498651554499',
      wabaId: WABA,
      phoneNumberId: PNID,
      providerMode: 'meta',
    });
    expect(call.update.accessTokenEnc).toMatch(/^v1\./);
    expect(call.update.accessTokenEnc).not.toContain(BUSINESS_TOKEN);

    // audit row for the embedded signup, display-safe metadata only
    const audit = embeddedAudit();
    expect(audit).toBeTruthy();
    expect(audit.metadata).toMatchObject({
      wabaId: WABA,
      phoneNumberId: PNID,
      appId: '1536498651554499',
      displayPhoneNumber: '917683020204',
      webhookSubscribed: true,
    });

    // no secret leakage in the response or in any audit row
    const surface = JSON.stringify(res.body) + JSON.stringify(prisma.auditLog.create.mock.calls);
    expect(surface).not.toContain(BUSINESS_TOKEN);
    expect(surface).not.toContain('SHORT_LIVED_CODE');
    expect(surface).not.toContain(APP_SECRET);

    // requirement: no number registration/migration/deregistration ever
    for (const [url] of fetchSpy.mock.calls) {
      expect(String(url)).not.toMatch(/\/(register|migrate|deregister|disconnect)(\?|$)/);
    }
  });

  test('a failed webhook subscription is non-fatal: credentials still saved, flag reported', async () => {
    admin();
    prisma.whatsappSettings.findUnique.mockResolvedValue(settingsRow());
    mockFetchByRoute({
      exchange: () => jsonResponse({ access_token: BUSINESS_TOKEN }),
      numbers: () => jsonResponse({ data: [{ id: PNID, display_phone_number: '+91 76830 20204' }] }),
      subscribe: () => jsonResponse({ error: { message: 'subscription temporarily unavailable', code: 1 } }, { ok: false, status: 500 }),
    });

    const res = await post('es2', { code: 'SHORT_LIVED_CODE', wabaId: WABA });

    expect(res.status).toBe(200);
    expect(res.body.data.webhookSubscribed).toBe(false);
    expect(prisma.whatsappSettings.upsert).toHaveBeenCalledTimes(1);
  });
});

describe('Embedded Signup: cancellation', () => {
  test('a cancelled dialog never reaches this endpoint — a missing code is rejected with no Meta call and no write', async () => {
    admin();
    const fetchSpy = jest.spyOn(global, 'fetch');

    const res = await post('es3', { wabaId: WABA }); // FB.login returned no code

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(prisma.whatsappSettings.upsert).not.toHaveBeenCalled();
  });

  test('a blank (whitespace-only) code is rejected as invalid input', async () => {
    admin();
    const fetchSpy = jest.spyOn(global, 'fetch');

    const res = await post('es3b', { code: '   ', wabaId: WABA });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(prisma.whatsappSettings.upsert).not.toHaveBeenCalled();
  });
});

describe('Embedded Signup: invalid response handling', () => {
  test('Meta rejecting the code maps to 502 and stores nothing', async () => {
    admin();
    prisma.whatsappSettings.findUnique.mockResolvedValue(settingsRow());
    mockFetchByRoute({
      exchange: () => jsonResponse(
        { error: { message: 'invalid verification code', code: 100, fbtrace_id: 'AbCd' } },
        { ok: false, status: 400 }
      ),
      numbers: () => jsonResponse({ data: [] }), // must never be reached
    });

    const res = await post('es4', { code: 'BAD_CODE', wabaId: WABA });

    expect(res.status).toBe(502);
    expect(res.body.message).toContain('invalid verification code');
    expect(res.body.message).not.toContain('BAD_CODE');
    expect(res.body.message).not.toContain(APP_SECRET);
    expect(prisma.whatsappSettings.upsert).not.toHaveBeenCalled();
    expect(embeddedAudit()).toBeFalsy();
  });

  test('a session phone_number_id that contradicts the discovered number is rejected and nothing is saved', async () => {
    admin();
    prisma.whatsappSettings.findUnique.mockResolvedValue(settingsRow());
    mockFetchByRoute({
      exchange: () => jsonResponse({ access_token: BUSINESS_TOKEN }),
      numbers: () => jsonResponse({ data: [{ id: PNID, display_phone_number: '917683020204' }] }),
    });

    const res = await post('es5', { code: 'SHORT_LIVED_CODE', wabaId: WABA, phoneNumberId: '999888777666555' });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('EMBEDDED_SIGNUP_MISMATCH');
    expect(prisma.whatsappSettings.upsert).not.toHaveBeenCalled();
  });
});

describe('Embedded Signup: failure handling', () => {
  test('the phone-number discovery call failing maps to 502 and stores nothing', async () => {
    admin();
    prisma.whatsappSettings.findUnique.mockResolvedValue(settingsRow());
    mockFetchByRoute({
      exchange: () => jsonResponse({ access_token: BUSINESS_TOKEN }),
      numbers: () => jsonResponse({ error: { message: '(#10) Application does not have permission', code: 10 } }, { ok: false, status: 403 }),
    });

    const res = await post('es6', { code: 'SHORT_LIVED_CODE', wabaId: WABA });

    expect(res.status).toBe(502);
    expect(prisma.whatsappSettings.upsert).not.toHaveBeenCalled();
    expect(embeddedAudit()).toBeFalsy();
  });

  test('connecting a number other than the configured business number is refused (no test numbers)', async () => {
    admin();
    prisma.whatsappSettings.findUnique.mockResolvedValue(settingsRow());
    mockFetchByRoute({
      exchange: () => jsonResponse({ access_token: BUSINESS_TOKEN }),
      // only a TEST number is present in the connected WABA
      numbers: () => jsonResponse({ data: [{ id: '999', display_phone_number: '911234567890' }] }),
    });

    const res = await post('es7', { code: 'SHORT_LIVED_CODE', wabaId: WABA });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('EMBEDDED_SIGNUP_NUMBER_MISMATCH');
    expect(res.body.message).toContain('911234567890'); // tells the admin what was found
    expect(prisma.whatsappSettings.upsert).not.toHaveBeenCalled();
    expect(embeddedAudit()).toBeFalsy();
  });

  test('missing App Secret in settings fails fast with 409 before any Meta call', async () => {
    admin();
    prisma.whatsappSettings.findUnique.mockResolvedValue(settingsRow({ appSecretEnc: null }));
    const fetchSpy = jest.spyOn(global, 'fetch');

    const res = await post('es8', { code: 'SHORT_LIVED_CODE', wabaId: WABA });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('WHATSAPP_NOT_CONFIGURED');
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(prisma.whatsappSettings.upsert).not.toHaveBeenCalled();
  });

  test('non-admin roles are forbidden', async () => {
    mockSession('SALES_EXECUTIVE', 'exec-user');
    prisma.whatsappSettings.findUnique.mockResolvedValue(settingsRow());
    const fetchSpy = jest.spyOn(global, 'fetch');

    const res = await post('es9', { code: 'SHORT_LIVED_CODE', wabaId: WABA });

    expect(res.status).toBe(403);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(prisma.whatsappSettings.upsert).not.toHaveBeenCalled();
  });
});
