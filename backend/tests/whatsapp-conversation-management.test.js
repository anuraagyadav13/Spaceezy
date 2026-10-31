// WhatsApp shared-inbox conversation management: close/reopen, assignment,
// mark-as-read, plus the additive list filters (q search, assignedToId).
//
// Assignment deliberately REUSES the lead's assignedToId (no separate
// assignment mechanism, no schema change): these tests pin that contract,
// the RBAC around it (lead:assign → admins/managers only; executives stay
// scoped to their own conversations), and the shared-unread-counter
// semantics (reset-on-open, per-conversation).
//
// NOTE: every provider/webhook interaction below is MOCKED (mock transport,
// HMAC-signed mock webhook route against the local test secret). Green here
// proves the CRM-side logic — it does NOT prove live Meta WhatsApp
// connectivity, which is only verified against a configured WABA.
const request = require('supertest');
const crypto = require('crypto');
const app = require('../src/app');

jest.mock('../src/db/prisma', () => {
  const mock = {
    session: { findUnique: jest.fn() },
    organization: { findFirst: jest.fn() },
    user: { findFirst: jest.fn(), findMany: jest.fn() },
    lead: { findFirst: jest.fn(), findMany: jest.fn(), count: jest.fn(), update: jest.fn() },
    leadActivity: { create: jest.fn() },
    property: { findFirst: jest.fn() },
    whatsAppConversation: { findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn(), count: jest.fn() },
    whatsAppMessage: { findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn(), count: jest.fn() },
    whatsAppTemplate: { findFirst: jest.fn(), findMany: jest.fn() },
    whatsappSettings: { findUnique: jest.fn(), findMany: jest.fn() },
    auditLog: { create: jest.fn() },
    $transaction: jest.fn(),
  };
  mock.$transaction.mockImplementation(async (fn) => fn(mock));
  return mock;
});

const prisma = require('../src/db/prisma');
const { resetWhatsAppProvider } = require('../src/providers/whatsapp');

const ORG = '11111111-1111-4111-8111-111111111111';
const LEAD = 'aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CONV = 'fffffff1-ffff-4fff-8fff-ffffffffffff';
const ADMIN_ID = 'admin-user-1';
const EXEC_ID = '55555555-5555-4555-8555-555555555555';
const ASSIGNEE_A = 'aaaaaaa3-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ASSIGNEE_B = 'aaaaaaa4-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PHONE = '+91 90000 12345';

const mockSession = (role, userId) => {
  prisma.session.findUnique.mockResolvedValue({
    expiresAt: new Date(Date.now() + 60_000),
    user: { id: userId, organizationId: ORG, role, status: 'ACTIVE' },
  });
};
const admin = () => mockSession('ADMIN', ADMIN_ID);
const exec = (userId = EXEC_ID) => mockSession('SALES_EXECUTIVE', userId);
const cookie = (jar) => `spaceezy_session=${jar}`;

const convRow = (overrides = {}) => ({
  id: CONV,
  organizationId: ORG,
  leadId: LEAD,
  customerId: null,
  provider: 'mock',
  providerContactId: '919000012345',
  status: 'ACTIVE',
  unreadCount: 0,
  lastMessageAt: new Date(),
  lead: { id: LEAD, name: 'Kamal Rao', phone: PHONE, status: 'NEW', assignedToId: ADMIN_ID },
  customer: null,
  ...overrides,
});

const whSign = (rawBody, secret = process.env.WHATSAPP_WEBHOOK_SECRET) =>
  `sha256=${crypto.createHmac('sha256', secret).update(rawBody).digest('hex')}`;

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
  prisma.whatsAppConversation.findMany.mockResolvedValue([]);
  // Echo the merged row so response assertions see the written values.
  prisma.whatsAppConversation.update.mockImplementation(async ({ data }) => ({ ...convRow(), ...data }));
  prisma.whatsAppMessage.create.mockImplementation(async ({ data }) => ({
    id: 'msg-1',
    createdAt: new Date(),
    ...data,
  }));
  prisma.whatsAppMessage.findMany.mockResolvedValue([]);
  prisma.whatsAppMessage.count.mockResolvedValue(0);
  prisma.lead.update.mockResolvedValue({ id: LEAD });
  prisma.leadActivity.create.mockResolvedValue({ id: 'act-1' });
  prisma.auditLog.create.mockResolvedValue({ id: 'audit-1' });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('PATCH /api/v1/whatsapp/conversations/:id (close / reopen)', () => {
  test('admin closes an active conversation and writes the status audit', async () => {
    const res = await request(app)
      .patch(`/api/v1/whatsapp/conversations/${CONV}`)
      .set('Cookie', cookie('t1'))
      .send({ status: 'CLOSED' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBe(CONV);
    expect(res.body.data.status).toBe('CLOSED');
    expect(prisma.whatsAppConversation.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: CONV },
      data: { status: 'CLOSED' },
    }));
    const audit = prisma.auditLog.create.mock.calls[0][0].data;
    expect(audit.action).toBe('whatsapp.conversation_status');
    expect(audit.entityId).toBe(CONV);
    expect(audit.metadata).toMatchObject({ status: 'CLOSED', previousStatus: 'ACTIVE' });
  });

  test('admin reopens a closed conversation', async () => {
    prisma.whatsAppConversation.findFirst.mockResolvedValue(convRow({ status: 'CLOSED' }));

    const res = await request(app)
      .patch(`/api/v1/whatsapp/conversations/${CONV}`)
      .set('Cookie', cookie('t1'))
      .send({ status: 'ACTIVE' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('ACTIVE');
    expect(prisma.whatsAppConversation.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: CONV },
      data: { status: 'ACTIVE' },
    }));
  });

  test('same status is a no-op: no DB write, no audit row', async () => {
    prisma.whatsAppConversation.findFirst.mockResolvedValue(convRow({ status: 'CLOSED' }));

    const res = await request(app)
      .patch(`/api/v1/whatsapp/conversations/${CONV}`)
      .set('Cookie', cookie('t1'))
      .send({ status: 'CLOSED' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('CLOSED');
    expect(prisma.whatsAppConversation.update).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  test('invalid status value is rejected by validation before any lookup', async () => {
    const res = await request(app)
      .patch(`/api/v1/whatsapp/conversations/${CONV}`)
      .set('Cookie', cookie('t1'))
      .send({ status: 'BOGUS' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(prisma.whatsAppConversation.findFirst).not.toHaveBeenCalled();
    expect(prisma.whatsAppConversation.update).not.toHaveBeenCalled();
  });

  test('executive can close their OWN conversation (scope allows own lead)', async () => {
    prisma.whatsAppConversation.findFirst.mockResolvedValue(
      convRow({ lead: { id: LEAD, name: 'Kamal Rao', phone: PHONE, status: 'NEW', assignedToId: EXEC_ID } })
    );
    exec();

    const res = await request(app)
      .patch(`/api/v1/whatsapp/conversations/${CONV}`)
      .set('Cookie', cookie('t1'))
      .send({ status: 'CLOSED' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('CLOSED');
  });

  test('executive cannot close a conversation assigned to someone else', async () => {
    exec();

    const res = await request(app)
      .patch(`/api/v1/whatsapp/conversations/${CONV}`)
      .set('Cookie', cookie('t1'))
      .send({ status: 'CLOSED' });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
    expect(prisma.whatsAppConversation.update).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  test('conversation outside the organization is not found', async () => {
    prisma.whatsAppConversation.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .patch(`/api/v1/whatsapp/conversations/${CONV}`)
      .set('Cookie', cookie('t1'))
      .send({ status: 'CLOSED' });

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
    expect(prisma.whatsAppConversation.update).not.toHaveBeenCalled();
  });
});

describe('POST /api/v1/whatsapp/conversations/:id/assign (reuses lead assignment)', () => {
  test('admin assigns an active employee: lead owner updated + audited', async () => {
    prisma.user.findFirst.mockResolvedValue({ id: ASSIGNEE_A, name: 'Ravi Kumar', status: 'ACTIVE' });

    const res = await request(app)
      .post(`/api/v1/whatsapp/conversations/${CONV}/assign`)
      .set('Cookie', cookie('t1'))
      .send({ assignedToId: ASSIGNEE_A });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.changed).toBe(true);
    expect(res.body.data.leadId).toBe(LEAD);
    expect(res.body.data.assignedTo).toEqual({ id: ASSIGNEE_A, name: 'Ravi Kumar' });
    // Assignment IS lead assignment — exactly one write, to the lead.
    expect(prisma.lead.update).toHaveBeenCalledTimes(1);
    expect(prisma.lead.update).toHaveBeenCalledWith({
      where: { id: LEAD },
      data: { assignedToId: ASSIGNEE_A },
    });
    expect(prisma.whatsAppConversation.update).not.toHaveBeenCalled();
    const audit = prisma.auditLog.create.mock.calls[0][0].data;
    expect(audit.action).toBe('whatsapp.conversation_assigned');
    expect(audit.metadata).toMatchObject({ leadId: LEAD, from: ADMIN_ID, to: ASSIGNEE_A });
  });

  test('unassign (null) clears the lead owner', async () => {
    const res = await request(app)
      .post(`/api/v1/whatsapp/conversations/${CONV}/assign`)
      .set('Cookie', cookie('t1'))
      .send({ assignedToId: null });

    expect(res.status).toBe(200);
    expect(res.body.data.changed).toBe(true);
    expect(res.body.data.assignedToId).toBeNull();
    expect(prisma.lead.update).toHaveBeenCalledWith({
      where: { id: LEAD },
      data: { assignedToId: null },
    });
    const audit = prisma.auditLog.create.mock.calls[0][0].data;
    expect(audit.metadata).toMatchObject({ from: ADMIN_ID, to: null });
  });

  test('re-assigning the same employee is an honest no-op (no write, no audit)', async () => {
    prisma.whatsAppConversation.findFirst.mockResolvedValue(
      convRow({ lead: { id: LEAD, name: 'Kamal Rao', phone: PHONE, status: 'NEW', assignedToId: ASSIGNEE_A } })
    );
    prisma.user.findFirst.mockResolvedValue({ id: ASSIGNEE_A, name: 'Ravi Kumar', status: 'ACTIVE' });

    const res = await request(app)
      .post(`/api/v1/whatsapp/conversations/${CONV}/assign`)
      .set('Cookie', cookie('t1'))
      .send({ assignedToId: ASSIGNEE_A });

    expect(res.status).toBe(200);
    expect(res.body.data.changed).toBe(false);
    expect(prisma.lead.update).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  test('reassignment to a different employee updates the owner', async () => {
    prisma.whatsAppConversation.findFirst.mockResolvedValue(
      convRow({ lead: { id: LEAD, name: 'Kamal Rao', phone: PHONE, status: 'NEW', assignedToId: ASSIGNEE_A } })
    );
    prisma.user.findFirst.mockResolvedValue({ id: ASSIGNEE_B, name: 'Priya Nair', status: 'ACTIVE' });

    const res = await request(app)
      .post(`/api/v1/whatsapp/conversations/${CONV}/assign`)
      .set('Cookie', cookie('t1'))
      .send({ assignedToId: ASSIGNEE_B });

    expect(res.status).toBe(200);
    expect(res.body.data.changed).toBe(true);
    expect(prisma.lead.update).toHaveBeenCalledWith({
      where: { id: LEAD },
      data: { assignedToId: ASSIGNEE_B },
    });
    const audit = prisma.auditLog.create.mock.calls[0][0].data;
    // `from` is the lead's previous owner — the assignment being replaced.
    expect(audit.metadata).toMatchObject({ from: ASSIGNEE_A, to: ASSIGNEE_B });
  });

  test('inactive assignee is rejected without any write', async () => {
    prisma.user.findFirst.mockResolvedValue({ id: ASSIGNEE_A, name: 'Ravi Kumar', status: 'INACTIVE' });

    const res = await request(app)
      .post(`/api/v1/whatsapp/conversations/${CONV}/assign`)
      .set('Cookie', cookie('t1'))
      .send({ assignedToId: ASSIGNEE_A });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('BAD_REQUEST');
    expect(prisma.lead.update).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  test('assignee outside the organization is not found', async () => {
    prisma.user.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .post(`/api/v1/whatsapp/conversations/${CONV}/assign`)
      .set('Cookie', cookie('t1'))
      .send({ assignedToId: ASSIGNEE_A });

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
    expect(prisma.lead.update).not.toHaveBeenCalled();
  });

  test('executive (no lead:assign) is refused before any lookup', async () => {
    exec();

    const res = await request(app)
      .post(`/api/v1/whatsapp/conversations/${CONV}/assign`)
      .set('Cookie', cookie('t1'))
      .send({ assignedToId: ASSIGNEE_A });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
    expect(prisma.lead.update).not.toHaveBeenCalled();
  });

  test('unknown conversation is not found', async () => {
    prisma.whatsAppConversation.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .post(`/api/v1/whatsapp/conversations/${CONV}/assign`)
      .set('Cookie', cookie('t1'))
      .send({ assignedToId: ASSIGNEE_A });

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
    expect(prisma.lead.update).not.toHaveBeenCalled();
  });
});

describe('POST /api/v1/whatsapp/conversations/:id/read (shared unread counter)', () => {
  test('resets a non-zero unread counter', async () => {
    prisma.whatsAppConversation.findFirst.mockResolvedValue(convRow({ unreadCount: 3 }));

    const res = await request(app)
      .post(`/api/v1/whatsapp/conversations/${CONV}/read`)
      .set('Cookie', cookie('t1'))
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ id: CONV, unreadCount: 0 });
    expect(prisma.whatsAppConversation.update).toHaveBeenCalledWith({
      where: { id: CONV },
      data: { unreadCount: 0 },
    });
  });

  test('a zero counter does not write to the database', async () => {
    const res = await request(app)
      .post(`/api/v1/whatsapp/conversations/${CONV}/read`)
      .set('Cookie', cookie('t1'))
      .send({});

    expect(res.status).toBe(200);
    expect(prisma.whatsAppConversation.update).not.toHaveBeenCalled();
  });

  test('executive cannot mark someone else\'s conversation read', async () => {
    exec();

    const res = await request(app)
      .post(`/api/v1/whatsapp/conversations/${CONV}/read`)
      .set('Cookie', cookie('t1'))
      .send({});

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
    expect(prisma.whatsAppConversation.update).not.toHaveBeenCalled();
  });
});

describe('GET /api/v1/whatsapp/conversations (additive filters)', () => {
  test('assignedToId=unassigned filters on a null lead owner', async () => {
    const res = await request(app)
      .get('/api/v1/whatsapp/conversations')
      .query({ assignedToId: 'unassigned' })
      .set('Cookie', cookie('t1'));

    expect(res.status).toBe(200);
    expect(prisma.whatsAppConversation.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { organizationId: ORG, lead: { assignedToId: null } },
    }));
  });

  test('q searches lead name and phone case-insensitively and returns the assignee', async () => {
    const res = await request(app)
      .get('/api/v1/whatsapp/conversations')
      .query({ q: 'kamal' })
      .set('Cookie', cookie('t1'));

    expect(res.status).toBe(200);
    const args = prisma.whatsAppConversation.findMany.mock.calls[0][0];
    expect(args.where.lead.OR).toEqual([
      { name: { contains: 'kamal', mode: 'insensitive' } },
      { phone: { contains: 'kamal', mode: 'insensitive' } },
    ]);
    expect(args.include.lead.select.assignedTo).toEqual({ select: { id: true, name: true } });
  });

  test('restricted role cannot use assignedToId to widen scope (forced to own leads)', async () => {
    exec();

    const res = await request(app)
      .get('/api/v1/whatsapp/conversations')
      .query({ assignedToId: ASSIGNEE_A })
      .set('Cookie', cookie('t1'));

    expect(res.status).toBe(200);
    // The query asked for ASSIGNEE_A but an executive is always pinned to
    // conversations whose lead they own — the filter is ignored, never widened.
    expect(prisma.whatsAppConversation.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { organizationId: ORG, lead: { assignedToId: EXEC_ID } },
    }));
  });

  test('invalid assignedToId value is rejected by validation', async () => {
    const res = await request(app)
      .get('/api/v1/whatsapp/conversations')
      .query({ assignedToId: 'not-a-uuid' })
      .set('Cookie', cookie('t1'));

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(prisma.whatsAppConversation.findMany).not.toHaveBeenCalled();
  });

  test('status filter keeps working alongside the new filters (regression)', async () => {
    const res = await request(app)
      .get('/api/v1/whatsapp/conversations')
      .query({ status: 'ACTIVE', limit: 50 })
      .set('Cookie', cookie('t1'));

    expect(res.status).toBe(200);
    expect(prisma.whatsAppConversation.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { organizationId: ORG, status: 'ACTIVE' },
    }));
  });
});

describe('multi-agent regressions (mocked, no live provider)', () => {
  test('outbound send still records sentById (sender attribution)', async () => {
    const res = await request(app)
      .post(`/api/v1/whatsapp/conversations/${CONV}/messages`)
      .set('Cookie', cookie('t1'))
      .send({ body: 'reply from the shared inbox' });

    expect(res.status).toBe(201);
    expect(res.body.data.direction).toBe('OUTBOUND');
    expect(prisma.whatsAppMessage.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ sentById: ADMIN_ID, direction: 'OUTBOUND' }),
    }));
  });

  test('inbound webhook still increments the shared unread counter', async () => {
    prisma.whatsAppMessage.findFirst.mockResolvedValue(null);
    prisma.lead.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: LEAD, organizationId: ORG, name: 'Kamal Rao', phone: PHONE, status: 'NEW', assignedToId: ADMIN_ID });

    const payload = {
      type: 'message',
      organizationId: ORG,
      leadId: LEAD,
      providerMessageId: 'wamid.unread-1',
      phone: PHONE,
      body: 'one more question',
    };
    const res = await request(app)
      .post('/api/v1/webhooks/whatsapp/mock')
      .set('Content-Type', 'application/json')
      .set('x-webhook-signature', whSign(JSON.stringify(payload)))
      .send(JSON.stringify(payload));

    expect(res.status).toBe(200);
    expect(res.body.data.messageId).toBe('msg-1');
    expect(prisma.whatsAppConversation.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: CONV },
      data: expect.objectContaining({ unreadCount: { increment: 1 } }),
    }));
  });

  test('duplicate inbound webhook is still idempotent by providerMessageId', async () => {
    prisma.whatsAppMessage.findFirst.mockResolvedValue({ id: 'msg-existing' });
    const payload = { type: 'message', providerMessageId: 'wamid.dup-1', body: 'dup' };

    const res = await request(app)
      .post('/api/v1/webhooks/whatsapp/mock')
      .set('Content-Type', 'application/json')
      .set('x-webhook-signature', whSign(JSON.stringify(payload)))
      .send(JSON.stringify(payload));

    expect(res.status).toBe(200);
    expect(res.body.data.duplicate).toBe(true);
    expect(prisma.whatsAppMessage.create).not.toHaveBeenCalled();
  });
});

describe('inbound replies reopen a closed conversation (M3)', () => {
  const inboundLead = () => ({
    id: LEAD, organizationId: ORG, name: 'Kamal Rao', phone: PHONE, status: 'NEW', assignedToId: ADMIN_ID,
  });

  test('reply to a CLOSED conversation reopens the SAME thread instead of creating a duplicate row', async () => {
    const closedRow = {
      id: CONV,
      organizationId: ORG,
      leadId: LEAD,
      status: 'CLOSED',
      providerContactId: PHONE,
      lastMessageAt: new Date(),
    };
    prisma.whatsAppMessage.findFirst.mockResolvedValue(null);
    prisma.lead.findFirst
      .mockResolvedValueOnce(null) // explicit leadId lookup (phone-routing path resolves it below)
      .mockResolvedValueOnce(inboundLead());
    prisma.whatsAppConversation.findFirst
      .mockResolvedValueOnce(null)         // no ACTIVE conversation exists
      .mockResolvedValueOnce(closedRow);   // most recent conversation for the lead (CLOSED)
    prisma.whatsAppConversation.update
      .mockResolvedValueOnce({ ...closedRow, status: 'ACTIVE' }) // the reopen write
      .mockResolvedValue({});              // subsequent unread-increment write

    const payload = {
      type: 'message',
      organizationId: ORG,
      leadId: LEAD,
      providerMessageId: 'wamid.reopen-1',
      phone: PHONE,
      body: 'still interested, can we talk?',
    };
    const res = await request(app)
      .post('/api/v1/webhooks/whatsapp/mock')
      .set('Content-Type', 'application/json')
      .set('x-webhook-signature', whSign(JSON.stringify(payload)))
      .send(JSON.stringify(payload));

    expect(res.status).toBe(200);
    // The SAME row was reopened — status write only, nothing else touched.
    expect(prisma.whatsAppConversation.update.mock.calls[0][0]).toEqual({
      where: { id: CONV },
      data: { status: 'ACTIVE' },
    });
    // No second conversation row for the same lead.
    expect(prisma.whatsAppConversation.create).not.toHaveBeenCalled();
    // The reply attached to the reopened thread, so all previous messages
    // (same conversationId) remain in one history.
    expect(prisma.whatsAppMessage.create.mock.calls[0][0].data).toMatchObject({
      conversationId: CONV,
      direction: 'INBOUND',
    });
    expect(res.body.data.messageId).toBe('msg-1');
  });

  test('an already-ACTIVE conversation is reused with no reopen write', async () => {
    prisma.whatsAppMessage.findFirst.mockResolvedValue(null);
    prisma.lead.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(inboundLead());
    // beforeEach default: convRow() with status ACTIVE.
    prisma.whatsAppConversation.findFirst.mockResolvedValue(convRow());

    const payload = {
      type: 'message',
      organizationId: ORG,
      leadId: LEAD,
      providerMessageId: 'wamid.active-1',
      phone: PHONE,
      body: 'quick follow up',
    };
    const res = await request(app)
      .post('/api/v1/webhooks/whatsapp/mock')
      .set('Content-Type', 'application/json')
      .set('x-webhook-signature', whSign(JSON.stringify(payload)))
      .send(JSON.stringify(payload));

    expect(res.status).toBe(200);
    expect(prisma.whatsAppConversation.create).not.toHaveBeenCalled();
    // Exactly ONE conversation write — the unread increment, not a reopen.
    expect(prisma.whatsAppConversation.update).toHaveBeenCalledTimes(1);
    expect(prisma.whatsAppConversation.update.mock.calls[0][0].data).toEqual({
      lastMessageAt: expect.any(Date),
      unreadCount: { increment: 1 },
    });
  });

  test('lead with NO conversation at all still creates one (existing behaviour preserved)', async () => {
    prisma.whatsAppMessage.findFirst.mockResolvedValue(null);
    prisma.lead.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(inboundLead());
    prisma.whatsAppConversation.findFirst.mockResolvedValue(null); // both lookups: none
    prisma.whatsAppConversation.create.mockResolvedValue({ id: 'conv-new' });

    const payload = {
      type: 'message',
      organizationId: ORG,
      leadId: LEAD,
      providerMessageId: 'wamid.brand-new-1',
      phone: PHONE,
      body: 'first ever message',
    };
    const res = await request(app)
      .post('/api/v1/webhooks/whatsapp/mock')
      .set('Content-Type', 'application/json')
      .set('x-webhook-signature', whSign(JSON.stringify(payload)))
      .send(JSON.stringify(payload));

    expect(res.status).toBe(200);
    expect(prisma.whatsAppConversation.create).toHaveBeenCalledTimes(1);
    expect(prisma.whatsAppConversation.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'ACTIVE' }) })
    );
  });
});

describe('regression gaps from the security review (L6)', () => {
  test('executive can mark their OWN conversation as read (success path)', async () => {
    prisma.whatsAppConversation.findFirst.mockResolvedValue(
      convRow({
        unreadCount: 2,
        lead: { id: LEAD, name: 'Kamal Rao', phone: PHONE, status: 'NEW', assignedToId: EXEC_ID },
      })
    );
    exec();

    const res = await request(app)
      .post(`/api/v1/whatsapp/conversations/${CONV}/read`)
      .set('Cookie', cookie('t1'))
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ id: CONV, unreadCount: 0 });
    expect(prisma.whatsAppConversation.update).toHaveBeenCalledWith({
      where: { id: CONV },
      data: { unreadCount: 0 },
    });
  });

  test('assign endpoint without the required assignedToId returns 400', async () => {
    const res = await request(app)
      .post(`/api/v1/whatsapp/conversations/${CONV}/assign`)
      .set('Cookie', cookie('t1'))
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
    expect(prisma.lead.update).not.toHaveBeenCalled();
  });

  test('mark-read for a conversation from another organization is not found', async () => {
    prisma.whatsAppConversation.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .post(`/api/v1/whatsapp/conversations/${CONV}/read`)
      .set('Cookie', cookie('t1'))
      .send({});

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
    expect(prisma.whatsAppConversation.update).not.toHaveBeenCalled();
  });

  test('non-UUID conversation id is rejected with 400 on every new route', async () => {
    const bad = 'not-a-uuid';
    const patchRes = await request(app)
      .patch(`/api/v1/whatsapp/conversations/${bad}`)
      .set('Cookie', cookie('t1'))
      .send({ status: 'ACTIVE' });
    const assignRes = await request(app)
      .post(`/api/v1/whatsapp/conversations/${bad}/assign`)
      .set('Cookie', cookie('t1'))
      .send({ assignedToId: ASSIGNEE_A });
    const readRes = await request(app)
      .post(`/api/v1/whatsapp/conversations/${bad}/read`)
      .set('Cookie', cookie('t1'))
      .send({});

    for (const res of [patchRes, assignRes, readRes]) {
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    }
    expect(prisma.whatsAppConversation.findFirst).not.toHaveBeenCalled();
    expect(prisma.lead.update).not.toHaveBeenCalled();
  });
});

// The header "More options" menu is a thin client over these same endpoints
// (manual mark-as-read + close/reopen on the open thread). No frontend test
// harness exists in this repo, so these pin the exact request patterns the
// menu performs, including the idempotent mark-read that can race the
// auto-reset on open.
describe('conversation header menu actions', () => {
  test('manual mark-as-read on an already-read conversation is idempotent (200, no write)', async () => {
    // The auto mark-read on open may have reset the counter first; the menu's
    // explicit action must still succeed without a redundant DB write.
    prisma.whatsAppConversation.findFirst.mockResolvedValue(convRow({ unreadCount: 0 }));

    const res = await request(app)
      .post(`/api/v1/whatsapp/conversations/${CONV}/read`)
      .set('Cookie', cookie('t1'))
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ id: CONV, unreadCount: 0 });
    expect(prisma.whatsAppConversation.update).not.toHaveBeenCalled();
  });

  test('menu close-then-reopen sequence transitions the same conversation row', async () => {
    prisma.whatsAppConversation.findFirst.mockResolvedValue(convRow({ status: 'ACTIVE' }));

    const closeRes = await request(app)
      .patch(`/api/v1/whatsapp/conversations/${CONV}`)
      .set('Cookie', cookie('t1'))
      .send({ status: 'CLOSED' });

    expect(closeRes.status).toBe(200);
    expect(closeRes.body.data.status).toBe('CLOSED');
    expect(prisma.whatsAppConversation.update).toHaveBeenNthCalledWith(1,
      expect.objectContaining({
        where: { id: CONV },
        data: { status: 'CLOSED' },
      })
    );

    // The same menu (now offering "Reopen") flips it back on the same row —
    // no second conversation, no lead-side writes.
    prisma.whatsAppConversation.findFirst.mockResolvedValue(convRow({ status: 'CLOSED' }));
    const reopenRes = await request(app)
      .patch(`/api/v1/whatsapp/conversations/${CONV}`)
      .set('Cookie', cookie('t1'))
      .send({ status: 'ACTIVE' });

    expect(reopenRes.status).toBe(200);
    expect(reopenRes.body.data.status).toBe('ACTIVE');
    expect(prisma.whatsAppConversation.update).toHaveBeenNthCalledWith(2,
      expect.objectContaining({
        where: { id: CONV },
        data: { status: 'ACTIVE' },
      })
    );
    expect(prisma.whatsAppConversation.create).not.toHaveBeenCalled();
    expect(prisma.lead.update).not.toHaveBeenCalled();
  });
});

describe('rate limiting on conversation mutations (M2)', () => {
  // Kept LAST in this file on purpose: the limiter is per-process/per-IP and
  // this test intentionally exhausts the shared budget for all four routes.
  test('shared mutation budget (120 / 5 min) eventually answers 429, after letting plenty of human-paced requests through', async () => {
    let saw429 = false;
    let allowed = 0;
    for (let i = 0; i < 130 && !saw429; i += 1) {
      const res = await request(app)
        .post(`/api/v1/whatsapp/conversations/${CONV}/read`)
        .set('Cookie', cookie('t1'))
        .send({});
      if (res.status === 429) {
        saw429 = true;
        expect(res.body.code).toBe('TOO_MANY_REQUESTS');
        expect(res.body.success).toBe(false);
      } else {
        expect(res.status).toBe(200);
        allowed += 1;
      }
    }
    expect(saw429).toBe(true);
    // Generous budget: at least a few dozen requests passed before it bit
    // (earlier tests in this file already consumed part of the shared 120).
    expect(allowed).toBeGreaterThanOrEqual(50);
  });
});
