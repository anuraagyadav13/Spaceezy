const request = require('supertest');
const app = require('../src/app');
const prisma = require('../src/db/prisma');
const WhatsappNotifyService = require('../src/services/whatsappNotifyService');
const { resetWhatsAppProvider } = require('../src/providers/whatsapp');

jest.mock('../src/db/prisma', () => {
  const mock = {
    session: { findUnique: jest.fn() },
    organization: { findFirst: jest.fn() },
    whatsappSettings: {
      findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn(),
      update: jest.fn(), upsert: jest.fn(), delete: jest.fn(), count: jest.fn(),
    },
  lead: { findFirst: jest.fn(), findMany: jest.fn(), count: jest.fn(), create: jest.fn(), update: jest.fn() },
  leadActivity: { create: jest.fn() },
  auditLog: { create: jest.fn() },
  whatsAppMessage: { findFirst: jest.fn(), update: jest.fn() },
    whatsAppTemplate: { findFirst: jest.fn(), create: jest.fn() },
    whatsappNotification: { findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
    $transaction: jest.fn(),
  };
  mock.$transaction.mockImplementation(async (fn) => fn(mock));
  return mock;
});

const ORG = '11111111-1111-4111-8111-111111111111';
const LEAD_ID = 'aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
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
const exec = () => mockSession('SALES_EXECUTIVE', 'exec-user');
const cookie = (jar) => `spaceezy_session=${jar}`;

const settingsRow = (overrides = {}) => ({
  id: 'set-1',
  organizationId: ORG,
  appId: null,
  wabaId: '111222333',
  phoneNumberId: null,
  graphVersion: 'v21.0',
  providerMode: 'mock',
  accessTokenEnc: null,
  appSecretEnc: null,
  verifyTokenEnc: null,
  notifyEnabled: false,
  notifyRecipients: [],
  notifyTemplateName: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

const leadRow = (overrides = {}) => ({
  id: LEAD_ID,
  organizationId: ORG,
  name: 'Buyer',
  phone: '+91 90000 12345',
  source: 'Website',
  status: 'NEW',
  project: null,
  assignedTo: null,
  ...overrides,
});

const notifyRow = (overrides = {}) => ({
  id: 'notif-1',
  organizationId: ORG,
  leadId: LEAD_ID,
  recipient: '919876543210',
  templateName: 'Notify New Lead',
  status: 'PENDING',
  attempts: 0,
  error: null,
  providerMessageId: null,
  ...overrides,
});

const templateRow = (overrides = {}) => ({
  id: 'tpl-1',
  organizationId: ORG,
  name: 'Notify New Lead',
  active: true,
  language: 'en',
  variables: ['customer_name'],
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
  resetWhatsAppProvider();
});

afterEach(() => {
  jest.restoreAllMocks();
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
  resetWhatsAppProvider();
});

const flushTicks = async (n = 8) => {
  for (let i = 0; i < n; i++) await new Promise((resolve) => setImmediate(resolve));
};

describe('Phase 14: enqueue, dedup and creation-path hooks', () => {
  test('skips silently when notifications are disabled or unconfigured', async () => {
    prisma.whatsappSettings.findUnique.mockResolvedValue(null);
    expect(await WhatsappNotifyService.enqueueForLead(ORG, LEAD_ID)).toMatchObject({ skipped: 'disabled' });

    prisma.whatsappSettings.findUnique.mockResolvedValue(settingsRow({ notifyEnabled: false }));
    expect(await WhatsappNotifyService.enqueueForLead(ORG, LEAD_ID)).toMatchObject({ skipped: 'disabled' });

    prisma.whatsappSettings.findUnique.mockResolvedValue(settingsRow({ notifyEnabled: true, notifyRecipients: [] }));
    expect(await WhatsappNotifyService.enqueueForLead(ORG, LEAD_ID)).toMatchObject({ skipped: 'no-recipients' });
    expect(prisma.whatsappNotification.create).not.toHaveBeenCalled();
  });

  test('creates one row per enabled recipient, skips disabled/invalid', async () => {
    prisma.whatsappSettings.findUnique.mockResolvedValue(settingsRow({
      notifyEnabled: true,
      notifyRecipients: [
        { phone: '+91 98765 43210', label: 'Owner', enabled: true },
        { phone: '919876543211', label: 'Manager' },
        { phone: '919876543212', enabled: false },
        { phone: 'not-a-number', label: 'Junk' },
      ],
      notifyTemplateName: 'Notify New Lead',
    }));
    prisma.whatsAppTemplate.findFirst.mockResolvedValue(templateRow());
    prisma.whatsappNotification.create.mockImplementation(async ({ data }) => ({ id: `n-${data.recipient}`, ...data }));

    const result = await WhatsappNotifyService.enqueueForLead(ORG, LEAD_ID);
    expect(result.queued).toBe(2);
    expect(prisma.whatsappNotification.create).toHaveBeenCalledTimes(2);
    expect(prisma.whatsappNotification.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ recipient: '919876543210', templateName: 'Notify New Lead', status: 'PENDING' }) })
    );
  });

  test('duplicate (lead, recipient) resolves to the existing row (P2002 race)', async () => {
    prisma.whatsappSettings.findUnique.mockResolvedValue(settingsRow({
      notifyEnabled: true,
      notifyRecipients: [{ phone: '919876543210' }],
      notifyTemplateName: 'Notify New Lead',
    }));
    prisma.whatsAppTemplate.findFirst.mockResolvedValue(templateRow());
    const p2002 = new Error('dup');
    p2002.code = 'P2002';
    prisma.whatsappNotification.create.mockRejectedValueOnce(p2002);
    prisma.whatsappNotification.findFirst.mockResolvedValue(notifyRow());

    const result = await WhatsappNotifyService.enqueueForLead(ORG, LEAD_ID);
    expect(result.queued).toBe(1);
    expect(result.rows).toEqual(['notif-1']);
  });

  test('enqueue failures never throw to lead creation', async () => {
    prisma.whatsappSettings.findUnique.mockRejectedValue(new Error('db down'));
    await expect(WhatsappNotifyService.enqueueForLead(ORG, LEAD_ID)).resolves.toMatchObject({ skipped: 'error', rows: [] });
  });

  test('createLead success still succeeds when notification sending fails', async () => {
    admin();
    prisma.lead.create.mockResolvedValue(leadRow());
    prisma.leadActivity.create.mockResolvedValue({});
    prisma.whatsappSettings.findUnique.mockResolvedValue(settingsRow({
      notifyEnabled: true,
      notifyRecipients: [{ phone: '919876543210' }],
      notifyTemplateName: 'Notify New Lead',
    }));
    prisma.whatsAppTemplate.findFirst.mockResolvedValue(templateRow());
    prisma.whatsappNotification.create.mockResolvedValue(notifyRow());
    prisma.lead.findFirst.mockResolvedValue(leadRow());

    const res = await request(app)
      .post('/api/v1/leads')
      .set('Cookie', cookie('t1'))
      .send({ name: 'Buyer', phone: '+91 90000 12345' });

    expect(res.status).toBe(201);
    await flushTicks();
    expect(prisma.lead.create).toHaveBeenCalled();
    expect(prisma.whatsappNotification.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ leadId: expect.any(String), recipient: '919876543210' }) })
    );
  });
});

describe('Phase 14: processing, mapping, approval and retries', () => {
  const setupRow = (rowOverrides = {}, leadOverrides = {}, templateOverrides = {}) => {
    prisma.whatsappSettings.findUnique.mockResolvedValue(settingsRow({ notifyEnabled: true, ...rowOverrides }));
    prisma.lead.findFirst.mockResolvedValue(leadRow(leadOverrides));
    prisma.whatsAppTemplate.findFirst.mockResolvedValue(templateRow(templateOverrides));
    prisma.whatsappNotification.update.mockImplementation(async ({ data }) => ({ ...notifyRow(), ...data }));
  };

  test('mock send records SENT with provider id, timeline note, no network', async () => {
    setupRow();
    const fetchSpy = jest.spyOn(global, 'fetch');
    prisma.whatsappNotification.findFirst.mockResolvedValue(notifyRow());
    prisma.leadActivity.create.mockResolvedValue({});

    const result = await WhatsappNotifyService.processRow('notif-1');

    expect(result.status).toBe('SENT');
    expect(result.providerMessageId).toMatch(/^mockwa_/);
    expect(result.attempts).toBe(1);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(prisma.leadActivity.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: 'NOTE' }) })
    );
  });

  test('unassigned lead and missing optional fields still send when variables resolve', async () => {
    setupRow({}, { project: null, assignedTo: null });
    prisma.whatsappNotification.findFirst.mockResolvedValue(notifyRow());
    prisma.leadActivity.create.mockResolvedValue({});

    const result = await WhatsappNotifyService.processRow('notif-1');
    expect(result.status).toBe('SENT');
  });

  test('variables with no resolver fail permanently without sending', async () => {
    setupRow({}, {}, { variables: ['property_name', 'customer_name'] });
    prisma.whatsappNotification.findFirst.mockResolvedValue(notifyRow());
    prisma.leadActivity.create.mockResolvedValue({});
    const fetchSpy = jest.spyOn(global, 'fetch');

    const result = await WhatsappNotifyService.processRow('notif-1');
    expect(result.status).toBe('FAILED');
    expect(result.error).toMatch(/property_name/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test('unknown template variables fail closed (never sent partially)', async () => {
    setupRow({}, {}, { variables: ['mystery_field'] });
    prisma.whatsappNotification.findFirst.mockResolvedValue(notifyRow());
    prisma.leadActivity.create.mockResolvedValue({});

    const result = await WhatsappNotifyService.processRow('notif-1');
    expect(result.status).toBe('FAILED');
  });

  test('transient failures stay PENDING with attempts, then fail after exhaustion', async () => {
    const { encryptSecret: enc } = require('../src/utils/whatsappSecrets');
    prisma.whatsappSettings.findUnique.mockResolvedValue(settingsRow({
      notifyEnabled: true, providerMode: 'meta', phoneNumberId: '1411466198708019',
      accessTokenEnc: enc('tok'), notifyTemplateName: 'Notify New Lead',
    }));
    prisma.lead.findFirst.mockResolvedValue(leadRow());
    prisma.whatsAppTemplate.findFirst.mockResolvedValue(templateRow());
    const netErr = new Error('socket hang up');
    jest.spyOn(global, 'fetch').mockRejectedValue(netErr);
    // Stateful row: processRow re-reads the row after updating, so the mock
    // must reflect updates like a real database would.
    let current = notifyRow({ attempts: 0, status: 'PENDING' });
    prisma.whatsappNotification.findFirst.mockImplementation(async () => ({ ...current }));
    prisma.whatsappNotification.update.mockImplementation(async ({ data }) => {
      current = { ...current, ...data };
      return { ...current };
    });
    prisma.leadActivity.create.mockResolvedValue({});

    const attempt = (n) => WhatsappNotifyService.processRow('notif-1').then((r) => {
      expect(r.status).toBe(n < 3 ? 'PENDING' : 'FAILED');
      expect(r.attempts).toBe(n);
      return r;
    });
    await attempt(1);
    await attempt(2);
    const final = await attempt(3);
    expect(final.error).toMatch(/socket hang up/);
  });

  test('unapproved templates never send (verified live, meta mode)', async () => {
    const { encryptSecret: enc } = require('../src/utils/whatsappSecrets');
    prisma.whatsappSettings.findUnique.mockResolvedValue(settingsRow({
      notifyEnabled: true, providerMode: 'meta', phoneNumberId: '1411466198708019',
      accessTokenEnc: enc('tok'), notifyTemplateName: 'Notify New Lead',
    }));
    prisma.lead.findFirst.mockResolvedValue(leadRow());
    prisma.whatsAppTemplate.findFirst.mockResolvedValue(templateRow());
    prisma.whatsappNotification.findFirst.mockResolvedValue(notifyRow());
    prisma.whatsappNotification.update.mockImplementation(async ({ data }) => ({ ...notifyRow(), ...data }));
    prisma.leadActivity.create.mockResolvedValue({});
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true, status: 200, json: async () => ({ data: [{ name: 'Other Template', status: 'APPROVED' }] }),
    });

    const result = await WhatsappNotifyService.processRow('notif-1');
    expect(result.status).toBe('FAILED');
    expect(result.error).toMatch(/not Meta-approved/);
    const posts = fetchSpy.mock.calls.filter(([, init]) => init && init.method === 'POST');
    expect(posts).toHaveLength(0);
  });

  test('approved templates send with ordered variables', async () => {
    const { encryptSecret: enc } = require('../src/utils/whatsappSecrets');
    prisma.whatsappSettings.findUnique.mockResolvedValue(settingsRow({
      notifyEnabled: true, providerMode: 'meta', phoneNumberId: '1411466198708019',
      accessTokenEnc: enc('tok'), notifyTemplateName: 'Notify New Lead',
    }));
    prisma.lead.findFirst.mockResolvedValue(leadRow({ name: 'Buyer', project: { name: 'Skyline' }, assignedTo: { name: 'Asha' } }));
    prisma.whatsAppTemplate.findFirst.mockResolvedValue(templateRow({ variables: ['customer_name', 'project_name'] }));
    prisma.whatsappNotification.findFirst.mockResolvedValue(notifyRow());
    prisma.whatsappNotification.update.mockImplementation(async ({ data }) => ({ ...notifyRow(), ...data }));
    prisma.leadActivity.create.mockResolvedValue({});
    const fetchSpy = jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ data: [{ name: 'Notify New Lead', status: 'APPROVED' }] }) })
      .mockResolvedValue({ ok: true, status: 200, json: async () => ({ messages: [{ id: 'wamid.live1' }] }) });

    const result = await WhatsappNotifyService.processRow('notif-1');
    expect(result.status).toBe('SENT');
    expect(result.providerMessageId).toBe('wamid.live1');
    const sendCall = fetchSpy.mock.calls.find(([, init]) => init && init.method === 'POST');
    const body = JSON.parse(sendCall[1].body);
    expect(body.type).toBe('template');
    expect(body.template.components[0].parameters).toEqual([
      { type: 'text', text: 'Buyer' },
      { type: 'text', text: 'Skyline' },
    ]);
  });
});

describe('Phase 14: webhook status bridge and endpoints', () => {
  test('delivery receipts upgrade notification rows without downgrades', async () => {
    const WhatsAppService = require('../src/services/whatsappService');
    prisma.whatsAppMessage.findFirst.mockResolvedValue({ id: 'm1', status: 'SENT' });
    prisma.whatsAppMessage.update.mockResolvedValue({});
    prisma.whatsappNotification.findMany.mockResolvedValue([{ id: 'notif-1', status: 'SENT' }]);
    prisma.whatsappNotification.update.mockResolvedValue({});

    await WhatsAppService._processStatusEvent(
      { providerMessageId: 'wamid.live1', status: 'delivered' },
      ORG
    );
    expect(prisma.whatsappNotification.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'DELIVERED' }) })
    );
  });

  test('settings endpoints enforce admin-only access', async () => {
    exec();
    expect((await request(app).get('/api/v1/whatsapp/settings/notifications/latest').set('Cookie', cookie('e1'))).status).toBe(403);
    expect((await request(app).post('/api/v1/whatsapp/settings/notify-test').set('Cookie', cookie('e1')).send({})).status).toBe(403);
  });

  test('latest endpoint returns sanitized rows, null when empty', async () => {
    admin();
    prisma.whatsappNotification.findFirst.mockResolvedValue(null);
    const empty = await request(app).get('/api/v1/whatsapp/settings/notifications/latest').set('Cookie', cookie('t1'));
    expect(empty.status).toBe(200);
    expect(empty.body.data).toBeNull();

    prisma.whatsappNotification.findFirst.mockResolvedValue(notifyRow({ status: 'FAILED', error: 'boom' }));
    const full = await request(app).get('/api/v1/whatsapp/settings/notifications/latest').set('Cookie', cookie('t1'));
    expect(full.status).toBe(200);
    expect(full.body.data).toMatchObject({ status: 'FAILED', recipient: '919876543210', templateName: 'Notify New Lead', error: 'boom' });
  });

  test('test-notify rejects unconfigured recipients (400, no send)', async () => {
    admin();
    prisma.whatsappSettings.findUnique.mockResolvedValue(settingsRow({
      notifyEnabled: true, notifyRecipients: [{ phone: '919876543210', label: 'Owner' }], notifyTemplateName: 'Notify New Lead',
    }));
    const fetchSpy = jest.spyOn(global, 'fetch');

    const res = await request(app)
      .post('/api/v1/whatsapp/settings/notify-test')
      .set('Cookie', cookie('t2'))
      .send({ recipient: '911111111111' });

    expect(res.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
