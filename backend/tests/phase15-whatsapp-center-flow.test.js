// Phase 15: WhatsApp Center send → persistence → history flow.
//
// Covers the exact failure reported from the field ("sent" messages never
// appearing in the thread):
// - a successful send persists an OUTBOUND record under the URL
//   conversation id and the very next history read contains it;
// - a provider failure persists NOTHING (no phantom messages) and surfaces
//   an error instead of a false success;
// - template sends store the ordered variables + templateName contract, and
//   missing variables are rejected before the provider is ever called;
// - cross-org and out-of-scope sends are rejected without persistence.
const request = require('supertest');
const app = require('../src/app');

jest.mock('../src/db/prisma', () => {
  const mock = {
    session: { findUnique: jest.fn() },
    organization: { findFirst: jest.fn() },
    user: { findFirst: jest.fn() },
    lead: { findFirst: jest.fn() },
    leadActivity: { create: jest.fn() },
    property: { findFirst: jest.fn() },
    whatsAppConversation: { findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn(), count: jest.fn() },
    whatsAppMessage: { findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn(), count: jest.fn() },
    whatsAppTemplate: { findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
    whatsappSettings: { findUnique: jest.fn(), findMany: jest.fn() },
    auditLog: { create: jest.fn() },
    $transaction: jest.fn(),
  };
  mock.$transaction.mockImplementation(async (fn) => fn(mock));
  return mock;
});

const prisma = require('../src/db/prisma');
const { resetWhatsAppProvider, getWhatsAppProvider } = require('../src/providers/whatsapp');

const ORG = '11111111-1111-4111-8111-111111111111';
const LEAD = 'aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CONV = 'fffffff1-ffff-4fff-8fff-ffffffffffff';
const ADMIN_ID = 'admin-user-1';
const EXEC_ID = '55555555-5555-4555-8555-555555555555';

const mockSession = (role, userId) => {
  prisma.session.findUnique.mockResolvedValue({
    expiresAt: new Date(Date.now() + 60_000),
    user: { id: userId, organizationId: ORG, role, status: 'ACTIVE' },
  });
};
const admin = () => mockSession('ADMIN', ADMIN_ID);
const cookie = (jar) => `spaceezy_session=${jar}`;

const convRow = (overrides = {}) => ({
  id: CONV,
  organizationId: ORG,
  leadId: LEAD,
  customerId: null,
  provider: 'mock',
  providerContactId: '919876543210',
  status: 'ACTIVE',
  lastMessageAt: new Date(),
  lead: { id: LEAD, name: 'Kamal', phone: '919876543210', status: 'NEW', assignedToId: ADMIN_ID },
  customer: null,
  ...overrides,
});

const msgRow = (overrides = {}) => ({
  id: 'msg-1',
  organizationId: ORG,
  conversationId: CONV,
  leadId: LEAD,
  direction: 'OUTBOUND',
  status: 'SENT',
  body: 'hello from center',
  templateName: null,
  variables: null,
  providerMessageId: 'mockwa_test-1',
  sentById: ADMIN_ID,
  createdAt: new Date(),
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
  process.env.WHATSAPP_PROVIDER = 'mock';
  delete process.env.WHATSAPP_PHONE_NUMBER_ID;
  delete process.env.WHATSAPP_ACCESS_TOKEN;
  resetWhatsAppProvider();
  admin();
  prisma.organization.findFirst.mockResolvedValue({ id: ORG });
  prisma.whatsappSettings.findUnique.mockResolvedValue(null);
  prisma.whatsappSettings.findMany.mockResolvedValue([]);
  prisma.whatsAppConversation.findFirst.mockResolvedValue(convRow());
  prisma.whatsAppMessage.create.mockImplementation(async ({ data }) => ({
    id: 'msg-1',
    createdAt: new Date(),
    ...data,
  }));
  prisma.whatsAppMessage.findMany.mockResolvedValue([]);
  prisma.whatsAppMessage.count.mockResolvedValue(0);
  prisma.leadActivity.create.mockResolvedValue({ id: 'act-1' });
  prisma.auditLog.create.mockResolvedValue({ id: 'audit-1' });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('Phase 15: center send → persist → history', () => {
  test('text send persists under the URL conversation id and history returns it', async () => {
    const sendRes = await request(app)
      .post(`/api/v1/whatsapp/conversations/${CONV}/messages`)
      .set('Cookie', cookie('t1'))
      .send({ body: 'hello from center' });

    expect(sendRes.status).toBe(201);
    expect(sendRes.body.success).toBe(true);
    expect(sendRes.body.data.conversationId).toBe(CONV);
    expect(sendRes.body.data.direction).toBe('OUTBOUND');
    expect(sendRes.body.data.body).toBe('hello from center');
    // Mock transport normalizes to a synthetic provider id + SENT status.
    expect(sendRes.body.data.providerMessageId).toMatch(/^mockwa_/);
    expect(sendRes.body.data.status).toBe('SENT');
    expect(prisma.whatsAppMessage.create).toHaveBeenCalledTimes(1);
    expect(prisma.whatsAppMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ conversationId: CONV, leadId: LEAD, direction: 'OUTBOUND' }),
      })
    );

    // The very next history read contains the persisted record.
    prisma.whatsAppMessage.findMany.mockResolvedValue([msgRow()]);
    prisma.whatsAppMessage.count.mockResolvedValue(1);
    const threadRes = await request(app)
      .get(`/api/v1/whatsapp/conversations/${CONV}`)
      .set('Cookie', cookie('t1'));
    expect(threadRes.status).toBe(200);
    expect(threadRes.body.data.messages).toHaveLength(1);
    expect(threadRes.body.data.messages[0].id).toBe('msg-1');
    expect(threadRes.body.data.messages[0].conversationId).toBe(CONV);
  });

  test('provider failure persists nothing and surfaces an error', async () => {
    const provider = getWhatsAppProvider();
    jest.spyOn(provider, 'sendMessage').mockRejectedValueOnce(
      Object.assign(new Error('provider down'), { statusCode: 502 })
    );

    const res = await request(app)
      .post(`/api/v1/whatsapp/conversations/${CONV}/messages`)
      .set('Cookie', cookie('t1'))
      .send({ body: 'will not persist' });

    expect(res.status).toBe(502);
    expect(res.body.success).toBe(false);
    expect(prisma.whatsAppMessage.create).not.toHaveBeenCalled();
  });

  test('template send stores ordered variables; missing variables rejected before provider call', async () => {
    prisma.whatsAppTemplate.findFirst.mockResolvedValue({
      id: 'tpl-1',
      organizationId: ORG,
      name: 'Visit Reminder',
      language: 'en',
      active: true,
      variables: ['customer_name', 'project_name'],
    });
    const provider = getWhatsAppProvider();
    const sendSpy = jest.spyOn(provider, 'sendMessage');

    const ok = await request(app)
      .post(`/api/v1/whatsapp/conversations/${CONV}/messages`)
      .set('Cookie', cookie('t1'))
      .send({ templateName: 'Visit Reminder', variables: ['Kamal', 'Skyline'] });
    expect(ok.status).toBe(201);
    expect(ok.body.data.templateName).toBe('Visit Reminder');
    expect(prisma.whatsAppMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          templateName: 'Visit Reminder',
          variables: ['Kamal', 'Skyline'],
        }),
      })
    );
    // Provider receives the same ordered contract.
    expect(sendSpy).toHaveBeenCalledWith(
      expect.objectContaining({ templateName: 'Visit Reminder', variables: ['Kamal', 'Skyline'] })
    );

    sendSpy.mockClear();
    const bad = await request(app)
      .post(`/api/v1/whatsapp/conversations/${CONV}/messages`)
      .set('Cookie', cookie('t1'))
      .send({ templateName: 'Visit Reminder', variables: ['Kamal'] });
    expect(bad.status).toBe(400);
    expect(bad.body.code).toBe('TEMPLATE_VARIABLES_MISSING');
    expect(sendSpy).not.toHaveBeenCalled();
  });

  test('cross-org conversation id is rejected without persistence', async () => {
    prisma.whatsAppConversation.findFirst.mockResolvedValue(null);
    const res = await request(app)
      .post(`/api/v1/whatsapp/conversations/${CONV}/messages`)
      .set('Cookie', cookie('t1'))
      .send({ body: 'nope' });
    expect(res.status).toBe(404);
    expect(prisma.whatsAppMessage.create).not.toHaveBeenCalled();
  });

  test('executive cannot send into a conversation assigned to someone else', async () => {
    mockSession('SALES_EXECUTIVE', EXEC_ID);
    prisma.whatsAppConversation.findFirst.mockResolvedValue(
      convRow({ lead: { id: LEAD, assignedToId: 'someone-else' } })
    );
    const res = await request(app)
      .post(`/api/v1/whatsapp/conversations/${CONV}/messages`)
      .set('Cookie', cookie('t1'))
      .send({ body: 'nope' });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
    expect(prisma.whatsAppMessage.create).not.toHaveBeenCalled();
  });

  test('closed conversation rejects the send without persistence', async () => {
    prisma.whatsAppConversation.findFirst.mockResolvedValue(convRow({ status: 'CLOSED' }));
    const res = await request(app)
      .post(`/api/v1/whatsapp/conversations/${CONV}/messages`)
      .set('Cookie', cookie('t1'))
      .send({ body: 'nope' });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('CONVERSATION_CLOSED');
    expect(prisma.whatsAppMessage.create).not.toHaveBeenCalled();
  });
});
