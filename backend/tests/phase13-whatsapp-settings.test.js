const crypto = require('crypto');
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
    lead: { findFirst: jest.fn() },
    whatsAppMessage: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    whatsAppConversation: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    leadActivity: { create: jest.fn() },
    auditLog: { create: jest.fn() },
    $transaction: jest.fn(),
  };
  mock.$transaction.mockImplementation(async (fn) => fn(mock));
  return mock;
});

const ORG = '11111111-1111-4111-8111-111111111111';
const ORG_B = '22222222-2222-4222-8222-222222222222';
const TEST_KEY = '0123456789abcdef'.repeat(4);
const ENV_KEYS = ['WHATSAPP_SETTINGS_KEY', 'WHATSAPP_PROVIDER', 'WHATSAPP_PHONE_NUMBER_ID', 'WHATSAPP_API_KEY', 'WHATSAPP_ACCESS_TOKEN', 'WHATSAPP_APP_SECRET', 'WHATSAPP_VERIFY_TOKEN', 'WHATSAPP_WEBHOOK_SECRET', 'WHATSAPP_GRAPH_VERSION'];
let savedEnv;

const mockSession = (role, userId, organizationId = ORG) => {
  prisma.session.findUnique.mockResolvedValue({
    expiresAt: new Date(Date.now() + 60_000),
    user: { id: userId, organizationId, role, status: 'ACTIVE' },
  });
};

const admin = () => mockSession('ADMIN', 'admin-user');
const superAdmin = () => mockSession('SUPER_ADMIN', 'root-user');
const exec = () => mockSession('SALES_EXECUTIVE', 'exec-user');
const manager = () => mockSession('SALES_MANAGER', 'manager-user');
const cookie = (jar) => `spaceezy_session=${jar}`;

const settingsRow = (overrides = {}) => ({
  id: 'set-1',
  organizationId: ORG,
  appId: '1547702967068886',
  wabaId: null,
  phoneNumberId: '1411466198708019',
  graphVersion: 'v21.0',
  providerMode: 'mock',
  accessTokenEnc: null,
  appSecretEnc: null,
  verifyTokenEnc: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

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
  const { resetWhatsAppProvider } = require('../src/providers/whatsapp');
  resetWhatsAppProvider();
});

afterEach(() => {
  jest.restoreAllMocks();
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
  const { resetWhatsAppProvider } = require('../src/providers/whatsapp');
  resetWhatsAppProvider();
});

describe('Phase 13: encryption envelope', () => {
  test('round-trips with a fresh nonce per operation', () => {
    const { encryptSecret: enc, decryptSecret: dec } = require('../src/utils/whatsappSecrets');
    const a = enc('token-abc');
    const b = enc('token-abc');
    expect(a).not.toBe(b);
    expect(a).toMatch(/^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(dec(a)).toBe('token-abc');
    expect(dec(b)).toBe('token-abc');
  });

  test('tampered ciphertext, wrong key and missing key fail closed', () => {
    const mod = require('../src/utils/whatsappSecrets');
    const good = mod.encryptSecret('token-abc');
    const tampered = `${good.slice(0, -2)}${good.endsWith('AA') ? 'BB' : 'AA'}`;
    expect(() => mod.decryptSecret(tampered)).toThrow('cannot be decrypted');
    expect(() => mod.decryptSecret('not-an-envelope')).toThrow('cannot be decrypted');
    expect(() => mod.decryptSecret(null)).toThrow('cannot be decrypted');
    process.env.WHATSAPP_SETTINGS_KEY = 'ff'.repeat(32);
    expect(() => mod.decryptSecret(good)).toThrow('cannot be decrypted');
    process.env.WHATSAPP_SETTINGS_KEY = TEST_KEY;
    delete process.env.WHATSAPP_SETTINGS_KEY;
    expect(() => mod.encryptSecret('x')).toThrow('not configured');
    process.env.WHATSAPP_SETTINGS_KEY = TEST_KEY;
  });
});

describe('Phase 13: settings endpoints and authorization', () => {
  test('GET returns flags, never secret values', async () => {
    admin();
    prisma.whatsappSettings.findUnique.mockResolvedValue(settingsRow({
      accessTokenEnc: encryptSecret('tok'), appSecretEnc: encryptSecret('sec'), verifyTokenEnc: encryptSecret('vt'),
    }));

    const res = await request(app).get('/api/v1/whatsapp/settings').set('Cookie', cookie('t1'));
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ configured: true, hasAccessToken: true, hasAppSecret: true, hasVerifyToken: true });
    const serialized = JSON.stringify(res.body);
    for (const secret of ['tok', 'sec', 'vt']) expect(serialized).not.toContain(secret);
    expect(res.body.data).not.toHaveProperty('accessTokenEnc');
    expect(res.body.data).not.toHaveProperty('accessToken');
  });

  test('GET with no row reports unconfigured mock defaults', async () => {
    admin();
    prisma.whatsappSettings.findUnique.mockResolvedValue(null);

    const res = await request(app).get('/api/v1/whatsapp/settings').set('Cookie', cookie('t2'));
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ configured: false, providerMode: 'mock', hasAccessToken: false });
  });

  test('non-admin roles are denied on every settings endpoint (403)', async () => {
    for (const [role, jar] of [['SALES_EXECUTIVE', 'e1'], ['SALES_MANAGER', 'e2'], ['CHANNEL_PARTNER', 'e3']]) {
      mockSession(role, 'u1');
      expect((await request(app).get('/api/v1/whatsapp/settings').set('Cookie', cookie(jar))).status).toBe(403);
      expect((await request(app).put('/api/v1/whatsapp/settings').set('Cookie', cookie(jar)).send({ providerMode: 'mock' })).status).toBe(403);
      expect((await request(app).post('/api/v1/whatsapp/settings/test-connection').set('Cookie', cookie(jar))).status).toBe(403);
      expect((await request(app).post('/api/v1/whatsapp/settings/rotate').set('Cookie', cookie(jar)).send({ field: 'accessToken', value: 'x' })).status).toBe(403);
      expect((await request(app).delete('/api/v1/whatsapp/settings/secrets/accessToken').set('Cookie', cookie(jar))).status).toBe(403);
    }
  });

  test('SUPER_ADMIN is allowed (200)', async () => {
    superAdmin();
    prisma.whatsappSettings.findUnique.mockResolvedValue(null);
    const res = await request(app).get('/api/v1/whatsapp/settings').set('Cookie', cookie('t3'));
    expect(res.status).toBe(200);
  });

  test('cross-organization isolation: reads and writes scope to the session org', async () => {
    mockSession('ADMIN', 'admin-b', ORG_B);
    prisma.whatsappSettings.findUnique.mockResolvedValue(settingsRow({ organizationId: ORG_B }));
    prisma.whatsappSettings.upsert.mockResolvedValue(settingsRow({ organizationId: ORG_B }));

    const got = await request(app).get('/api/v1/whatsapp/settings').set('Cookie', cookie('t4'));
    expect(got.status).toBe(200);
    expect(prisma.whatsappSettings.findUnique).toHaveBeenCalledWith({ where: { organizationId: ORG_B } });

    const saved = await request(app).put('/api/v1/whatsapp/settings').set('Cookie', cookie('t4')).send({ providerMode: 'mock' });
    expect(saved.status).toBe(200);
    expect(prisma.whatsappSettings.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: ORG_B } })
    );
  });
});

describe('Phase 13: save, rotate, remove semantics', () => {
  test('save encrypts secrets, persists non-secrets, audits field names only', async () => {
    admin();
    prisma.whatsappSettings.findUnique.mockResolvedValue(null);
    prisma.whatsappSettings.upsert.mockResolvedValue(settingsRow());
    const fetchSpy = jest.spyOn(global, 'fetch');

    const res = await request(app)
      .put('/api/v1/whatsapp/settings')
      .set('Cookie', cookie('t5'))
      .send({ appId: '123', phoneNumberId: '1411466198708019', providerMode: 'mock', accessToken: 'tok-live', appSecret: '', verifyToken: null });

    expect(res.status).toBe(200);
    const data = prisma.whatsappSettings.upsert.mock.calls[0][0];
    expect(data.create.accessTokenEnc).toMatch(/^v1\./);
    expect(data.create.accessTokenEnc).not.toContain('tok-live');
    expect(data.create).not.toHaveProperty('appSecretEnc');
    expect(data.create).not.toHaveProperty('verifyTokenEnc');
    expect(data.create.appId).toBe('123');
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'whatsapp.settings_updated' }) })
    );
    const auditMeta = JSON.stringify(prisma.auditLog.create.mock.calls[0][0].data);
    expect(auditMeta).not.toContain('tok-live');
  });

  test('blank secret fields retain stored values', async () => {
    admin();
    prisma.whatsappSettings.findUnique.mockResolvedValue(settingsRow({ accessTokenEnc: encryptSecret('orig') }));
    prisma.whatsappSettings.upsert.mockResolvedValue(settingsRow());

    const res = await request(app)
      .put('/api/v1/whatsapp/settings')
      .set('Cookie', cookie('t6'))
      .send({ appId: '999', accessToken: '', verifyToken: null });

    expect(res.status).toBe(200);
    const arg = prisma.whatsappSettings.upsert.mock.calls[0][0];
    expect(arg.update).not.toHaveProperty('accessTokenEnc');
    expect(arg.update.appId).toBe('999');
  });

  test('duplicate phone numbers across orgs are rejected (409)', async () => {
    admin();
    prisma.whatsappSettings.findUnique.mockResolvedValue(null);
    const dup = new Error('dup');
    dup.code = 'P2002';
    prisma.whatsappSettings.upsert.mockRejectedValue(dup);

    const res = await request(app)
      .put('/api/v1/whatsapp/settings')
      .set('Cookie', cookie('t7'))
      .send({ phoneNumberId: '1411466198708019' });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('NUMBER_IN_USE');
  });

  test('rotate requires a value and audits distinctly; remove needs no value', async () => {
    admin();
    prisma.whatsappSettings.findUnique.mockResolvedValue(settingsRow({ accessTokenEnc: encryptSecret('old') }));
    prisma.whatsappSettings.update.mockResolvedValue(settingsRow());

    const empty = await request(app)
      .post('/api/v1/whatsapp/settings/rotate')
      .set('Cookie', cookie('t8'))
      .send({ field: 'accessToken', value: '' });
    expect(empty.status).toBe(400);

    const rotated = await request(app)
      .post('/api/v1/whatsapp/settings/rotate')
      .set('Cookie', cookie('t8'))
      .send({ field: 'accessToken', value: 'brand-new-token' });
    expect(rotated.status).toBe(200);
    const updateArg = prisma.whatsappSettings.update.mock.calls[0][0];
    expect(updateArg.data.accessTokenEnc).toMatch(/^v1\./);
    expect(updateArg.data.accessTokenEnc).not.toContain('brand-new-token');
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'whatsapp.secret_rotated' }) })
    );

    const removed = await request(app)
      .delete('/api/v1/whatsapp/settings/secrets/accessToken')
      .set('Cookie', cookie('t8'));
    expect(removed.status).toBe(200);
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'whatsapp.secret_removed' }) })
    );

    const badField = await request(app)
      .delete('/api/v1/whatsapp/settings/secrets/password')
      .set('Cookie', cookie('t8'));
    expect(badField.status).toBe(400);
  });

  test('graph version is validated (rejects legacy/odd formats)', async () => {
    admin();
    for (const body of [{ graphVersion: 'v19.0' }, { graphVersion: 'latest' }, { providerMode: 'live' }]) {
      const res = await request(app)
        .put('/api/v1/whatsapp/settings')
        .set('Cookie', cookie('t9'))
        .send(body);
      expect(res.status).toBe(400);
    }
    expect(prisma.whatsappSettings.upsert).not.toHaveBeenCalled();
  });

  test('whitespace-only secrets are rejected or treated as blank', async () => {
    admin();
    prisma.whatsappSettings.findUnique.mockResolvedValue(settingsRow());

    const rotated = await request(app)
      .post('/api/v1/whatsapp/settings/rotate')
      .set('Cookie', cookie('t9b'))
      .send({ field: 'accessToken', value: '   ' });
    expect(rotated.status).toBe(400);
    expect(prisma.whatsappSettings.update).not.toHaveBeenCalled();

    prisma.whatsappSettings.upsert.mockResolvedValue(settingsRow());
    const saved = await request(app)
      .put('/api/v1/whatsapp/settings')
      .set('Cookie', cookie('t9c'))
      .send({ accessToken: '   ' });
    expect(saved.status).toBe(200);
    const arg = prisma.whatsappSettings.upsert.mock.calls[0][0];
    expect(arg.update || arg.create).not.toHaveProperty('accessTokenEnc');
  });

  test('GET exposes every display field the form needs', async () => {
    admin();
    prisma.whatsappSettings.findUnique.mockResolvedValue(settingsRow({
      appId: '1547702967068886', wabaId: '1414281657440321', phoneNumberId: '1411466198708019',
      graphVersion: 'v21.0', providerMode: 'mock',
      accessTokenEnc: encryptSecret('tok'), appSecretEnc: null, verifyTokenEnc: encryptSecret('vt'),
    }));

    const res = await request(app).get('/api/v1/whatsapp/settings').set('Cookie', cookie('t9d'));
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      configured: true, providerMode: 'mock',
      appId: '1547702967068886', wabaId: '1414281657440321', phoneNumberId: '1411466198708019',
      graphVersion: 'v21.0', hasAccessToken: true, hasAppSecret: false, hasVerifyToken: true,
    });
  });

  test('missing encryption key fails closed with 500 (no plaintext path)', async () => {
    admin();
    delete process.env.WHATSAPP_SETTINGS_KEY;
    prisma.whatsappSettings.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .put('/api/v1/whatsapp/settings')
      .set('Cookie', cookie('t9e'))
      .send({ accessToken: 'tok-live' });

    expect(res.status).toBe(500);
    expect(res.body.code).toBe('SETTINGS_KEY_MISSING');
  });
});

describe('Phase 13: connection test and mock default', () => {
  test('test-connection without credentials fails closed (409, no network)', async () => {
    admin();
    prisma.whatsappSettings.findUnique.mockResolvedValue(null);
    const fetchSpy = jest.spyOn(global, 'fetch');

    const res = await request(app)
      .post('/api/v1/whatsapp/settings/test-connection')
      .set('Cookie', cookie('t10'));

    expect(res.status).toBe(409);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test('test-connection success returns display identifiers only', async () => {
    admin();
    prisma.whatsappSettings.findUnique.mockResolvedValue(settingsRow({
      accessTokenEnc: encryptSecret('tok'), phoneNumberId: '1411466198708019',
    }));
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({ display_phone_number: '+1 555-0100', verified_name: 'SpaceEzy' }),
    });

    const res = await request(app)
      .post('/api/v1/whatsapp/settings/test-connection')
      .set('Cookie', cookie('t11'));

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ ok: true, displayPhoneNumber: '+1 555-0100', verifiedName: 'SpaceEzy' });
    expect(JSON.stringify(res.body)).not.toContain('tok');
    expect(prisma.whatsappSettings.upsert).not.toHaveBeenCalled();
    expect(prisma.whatsappSettings.create).not.toHaveBeenCalled();
  });

  test('test-connection maps provider failures without leaking', async () => {
    admin();
    prisma.whatsappSettings.findUnique.mockResolvedValue(settingsRow({
      accessTokenEnc: encryptSecret('tok'), phoneNumberId: '1411466198708019',
    }));
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: false, status: 400, json: async () => ({ error: { message: 'Bad request', code: 100 } }),
    });

    const res = await request(app)
      .post('/api/v1/whatsapp/settings/test-connection')
      .set('Cookie', cookie('t12'));

    expect(res.status).toBe(502);
    expect(JSON.stringify(res.body)).not.toContain('tok');
  });

  test('saving credentials without flipping mode keeps mock effective', async () => {
    admin();
    prisma.whatsappSettings.findUnique.mockResolvedValue(null);
    prisma.whatsappSettings.upsert.mockResolvedValue(settingsRow({ providerMode: 'mock', accessTokenEnc: encryptSecret('tok') }));

    const res = await request(app)
      .put('/api/v1/whatsapp/settings')
      .set('Cookie', cookie('t13'))
      .send({ accessToken: 'tok-live' });

    expect(res.status).toBe(200);
    expect(res.body.data.providerMode).toBe('mock');
  });
});

describe('Phase 13: DB-backed webhook secrets and number routing', () => {
  const metaEnvelope = (numberId) => ({
    object: 'whatsapp_business_account',
    entry: [{
      id: 'WABA-1',
      changes: [{
        field: 'messages',
        value: {
          messaging_product: 'whatsapp',
          metadata: { display_phone_number: '+1 555-0100', phone_number_id: numberId },
          messages: [{ from: '919000012345', id: 'wamid.routed1', timestamp: '1700000000', type: 'text', text: { body: 'hello routed' } }],
        },
      }],
    }],
  });

  const postMeta = (payload, secret) => {
    const raw = JSON.stringify(payload);
    const sig = `sha256=${crypto.createHmac('sha256', secret).update(raw).digest('hex')}`;
    return request(app)
      .post('/api/v1/webhooks/whatsapp/meta')
      .set('Content-Type', 'application/json')
      .set('X-Hub-Signature-256', sig)
      .send(raw);
  };

  test('verifies with the stored DB secret and routes by number', async () => {
    prisma.whatsappSettings.findMany.mockResolvedValue([
      { organizationId: ORG, phoneNumberId: '1411466198708019', wabaId: null },
    ]);
    prisma.whatsappSettings.findUnique.mockResolvedValue(settingsRow({
      providerMode: 'meta',
      accessTokenEnc: encryptSecret('tok'),
      appSecretEnc: encryptSecret('db-secret'),
    }));
    prisma.lead.findFirst.mockResolvedValue({ id: 'lead-1', organizationId: ORG, phone: '919000012345' });
    prisma.whatsAppMessage.findFirst.mockResolvedValue(null);
    prisma.whatsAppConversation.findFirst.mockResolvedValue(null);
    prisma.whatsAppConversation.create.mockResolvedValue({ id: 'conv-1' });
    prisma.whatsAppMessage.create.mockResolvedValue({ id: 'msg-1' });
    prisma.whatsAppConversation.update.mockResolvedValue({});
    prisma.leadActivity.create.mockResolvedValue({});

    const res = await postMeta(metaEnvelope('1411466198708019'), 'db-secret');
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ ok: true, processed: 1 });
    expect(prisma.whatsAppConversation.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ organizationId: ORG }) })
    );
  });

  test('rejects unknown sender numbers when settings exist (400)', async () => {
    prisma.whatsappSettings.findMany.mockResolvedValue([
      { organizationId: ORG, phoneNumberId: '1411466198708019', wabaId: null },
    ]);

    const res = await postMeta(metaEnvelope('999000111222'), 'db-secret');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('UNKNOWN_SENDER');
    expect(prisma.whatsAppMessage.create).not.toHaveBeenCalled();
  });

  test('rejects wrong signatures even with correct routing data (401)', async () => {
    prisma.whatsappSettings.findMany.mockResolvedValue([
      { organizationId: ORG, phoneNumberId: '1411466198708019', wabaId: null },
    ]);
    prisma.whatsappSettings.findUnique.mockResolvedValue(settingsRow({
      providerMode: 'meta',
      accessTokenEnc: encryptSecret('tok'),
      appSecretEnc: encryptSecret('db-secret'),
    }));

    const raw = JSON.stringify(metaEnvelope('1411466198708019'));
    const res = await request(app)
      .post('/api/v1/webhooks/whatsapp/meta')
      .set('Content-Type', 'application/json')
      .set('X-Hub-Signature-256', 'sha256=deadbeef')
      .send(raw);
    expect(res.status).toBe(401);
  });

  test('GET challenge uses the stored DB verify token', async () => {
    prisma.organization.findFirst.mockResolvedValue({ id: ORG });
    prisma.whatsappSettings.findUnique.mockResolvedValue(settingsRow({
      verifyTokenEnc: encryptSecret('db-verify-token'),
    }));

    const good = await request(app)
      .get('/api/v1/webhooks/whatsapp/meta?hub.mode=subscribe&hub.verify_token=db-verify-token&hub.challenge=4242');
    expect(good.status).toBe(200);
    expect(good.text).toBe('4242');

    const bad = await request(app)
      .get('/api/v1/webhooks/whatsapp/meta?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=4242');
    expect(bad.status).toBe(403);
  });
});
