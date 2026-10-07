const crypto = require('crypto');
const request = require('supertest');
const app = require('../src/app');

jest.mock('../src/db/prisma', () => {
  const mock = {
    session: { findUnique: jest.fn() },
    user: { findFirst: jest.fn(), findMany: jest.fn() },
    lead: { findFirst: jest.fn(), findMany: jest.fn(), count: jest.fn(), update: jest.fn(), create: jest.fn() },
    leadActivity: { create: jest.fn(), findMany: jest.fn() },
    call: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      aggregate: jest.fn(),
    },
    callEvent: { create: jest.fn(), findFirst: jest.fn(), findMany: jest.fn() },
    task: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      delete: jest.fn(),
      groupBy: jest.fn(),
      aggregate: jest.fn(),
    },
    siteVisit: { findMany: jest.fn(), count: jest.fn(), groupBy: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
    quotation: { findMany: jest.fn(), count: jest.fn(), findFirst: jest.fn() },
    booking: { findMany: jest.fn(), count: jest.fn(), findFirst: jest.fn() },
    whatsAppConversation: { findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn(), count: jest.fn() },
    whatsAppMessage: { findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn(), count: jest.fn() },
    whatsAppTemplate: { findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
    auditLog: { create: jest.fn() },
    $transaction: jest.fn(),
  };
  mock.$transaction.mockImplementation(async (fn) => fn(mock));
  return mock;
});

const prisma = require('../src/db/prisma');
const { resetTelephonyProvider } = require('../src/providers/telephony');
const { resetWhatsAppProvider } = require('../src/providers/whatsapp');

const ORG = '11111111-1111-4111-8111-111111111111';
const LEAD = 'aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const LEAD_OTHER = 'aaaaaaa2-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const EXEC = '55555555-5555-4555-8555-555555555555';
const EXEC_OTHER = '44444444-4444-4444-8444-444444444444';
const CALL_ID = 'ccccccc1-cccc-4ccc-8ccc-cccccccccccc';
const TASK_ID = 'eeeeeee1-eeee-4eee-8eee-eeeeeeeeeeee';
const CONV_ID = 'fffffff1-ffff-4fff-8fff-ffffffffffff';
const PHONE = '+91 90000 12345';

const mockSession = (role, userId) => {
  prisma.session.findUnique.mockResolvedValue({
    expiresAt: new Date(Date.now() + 60_000),
    user: { id: userId, organizationId: ORG, role, status: 'ACTIVE' },
  });
};
const admin = () => mockSession('ADMIN', 'admin-user');
const exec = (userId = EXEC) => mockSession('SALES_EXECUTIVE', userId);
const cookie = (jar) => `spaceezy_session=${jar}`;

const lead = (overrides = {}) => ({
  id: LEAD,
  organizationId: ORG,
  name: 'Rohit Sharma',
  phone: PHONE,
  email: 'rohit@example.com',
  status: 'NEW',
  assignedToId: EXEC,
  ...overrides,
});

const callRow = (overrides = {}) => ({
  id: CALL_ID,
  organizationId: ORG,
  leadId: LEAD,
  userId: EXEC,
  direction: 'OUTBOUND',
  status: 'RINGING',
  fromNumber: '+10000000000',
  toNumber: PHONE,
  provider: 'mock',
  disposition: null,
  vendorCallId: 'mock_v1',
  recordingUrl: null,
  startedAt: new Date(),
  endedAt: null,
  duration: null,
  notes: null,
  createdAt: new Date(),
  ...overrides,
});

const sign = (rawBody, secret = process.env.TELEPHONY_WEBHOOK_SECRET) =>
  `sha256=${crypto.createHmac('sha256', secret).update(rawBody).digest('hex')}`;

const whSign = (rawBody, secret = process.env.WHATSAPP_WEBHOOK_SECRET) =>
  `sha256=${crypto.createHmac('sha256', secret).update(rawBody).digest('hex')}`;

beforeEach(() => {
  jest.clearAllMocks();
  process.env.TELEPHONY_PROVIDER = 'mock';
  process.env.WHATSAPP_PROVIDER = 'mock';
  resetTelephonyProvider();
  resetWhatsAppProvider();
  prisma.auditLog.create.mockResolvedValue({ id: 'audit-1' });
});

afterEach(() => {
  resetTelephonyProvider();
  resetWhatsAppProvider();
});

describe('Phase 4 - telephony status & RBAC', () => {
  test('anon gets 401 on /calls', async () => {
    const res = await request(app).get('/api/v1/calls');
    expect(res.status).toBe(401);
  });

  test('mock provider is reported as configured + simulated', async () => {
    admin();
    const res = await request(app)
      .get('/api/v1/calls/status')
      .set('Cookie', cookie('t1'));
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ provider: 'mock', configured: true, simulated: true });
  });

  test('null provider -> not configured, never fake success', async () => {
    process.env.TELEPHONY_PROVIDER = 'none';
    resetTelephonyProvider();
    admin();
    const res = await request(app)
      .get('/api/v1/calls/status')
      .set('Cookie', cookie('t1'));
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ provider: 'none', configured: false, simulated: false });
  });

  test('initiate call with unconfigured provider -> 409 TELEPHONY_NOT_CONFIGURED', async () => {
    process.env.TELEPHONY_PROVIDER = 'none';
    resetTelephonyProvider();
    exec();
    prisma.lead.findFirst.mockResolvedValue(lead());
    const res = await request(app)
      .post('/api/v1/calls')
      .set('Cookie', cookie('t2'))
      .send({ leadId: LEAD });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('TELEPHONY_NOT_CONFIGURED');
    expect(prisma.call.create).not.toHaveBeenCalled();
  });

  test('initiate call validation -> 400 without leadId', async () => {
    exec();
    const res = await request(app)
      .post('/api/v1/calls')
      .set('Cookie', cookie('t3'))
      .send({});
    expect(res.status).toBe(400);
  });
});

describe('Phase 4 - call lifecycle', () => {
  test('exec can call own lead: creates record, rings, audits', async () => {
    exec();
    prisma.lead.findFirst.mockResolvedValue(lead());
    prisma.call.create.mockResolvedValue(callRow({ status: 'INITIATED', vendorCallId: null }));
    prisma.call.update.mockResolvedValue(callRow());
    prisma.callEvent.create.mockResolvedValue({});

    const res = await request(app)
      .post('/api/v1/calls')
      .set('Cookie', cookie('t4'))
      .send({ leadId: LEAD, notes: 'intro' });

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('RINGING');
    expect(prisma.call.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ toNumber: PHONE, provider: 'mock', status: 'INITIATED' }),
    }));
    expect(prisma.auditLog.create).toHaveBeenCalledTimes(1);
    const auditRow = prisma.auditLog.create.mock.calls[0][0].data;
    expect(JSON.stringify(auditRow.metadata)).not.toContain('12345'); // masked number only
  });

  test('exec cannot call a lead assigned to someone else -> 403', async () => {
    exec();
    prisma.lead.findFirst.mockResolvedValue(lead({ assignedToId: EXEC_OTHER }));
    const res = await request(app)
      .post('/api/v1/calls')
      .set('Cookie', cookie('t5'))
      .send({ leadId: LEAD });
    expect(res.status).toBe(403);
    expect(prisma.call.create).not.toHaveBeenCalled();
  });

  test('lead without phone -> 400', async () => {
    exec();
    prisma.lead.findFirst.mockResolvedValue(lead({ phone: null }));
    const res = await request(app)
      .post('/api/v1/calls')
      .set('Cookie', cookie('t6'))
      .send({ leadId: LEAD });
    expect(res.status).toBe(400);
  });

  test('provider failure: record FAILED and surface 502', async () => {
    exec();
    prisma.lead.findFirst.mockResolvedValue(lead());
    prisma.call.create.mockResolvedValue(callRow({ status: 'INITIATED', vendorCallId: null }));
    prisma.call.update.mockResolvedValue(callRow({ status: 'FAILED' }));

    const MockTelephonyProvider = require('../src/providers/telephony/mockProvider');
    const original = MockTelephonyProvider.prototype.initiateCall;
    MockTelephonyProvider.prototype.initiateCall = async () => {
      throw new Error('gateway down');
    };

    let res;
    try {
      res = await request(app)
        .post('/api/v1/calls')
        .set('Cookie', cookie('t7'))
        .send({ leadId: LEAD });
    } finally {
      MockTelephonyProvider.prototype.initiateCall = original;
    }

    expect(res.status).toBe(502);
    expect(res.body.code).toBe('TELEPHONY_PROVIDER_ERROR');
    expect(prisma.call.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'FAILED' }),
    }));
  });

  test('hangup completes the call; second hangup is idempotent', async () => {
    exec();
    prisma.call.findFirst.mockResolvedValue(callRow({ status: 'RINGING' }));
    prisma.call.updateMany.mockResolvedValue({ count: 1 });
    prisma.callEvent.create.mockResolvedValue({});

    const first = await request(app)
      .post(`/api/v1/calls/${CALL_ID}/hangup`)
      .set('Cookie', cookie('t8'))
      .send({});
    expect(first.status).toBe(200);
    expect(prisma.call.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'COMPLETED' }),
    }));

    // already terminal -> returned as-is, no provider hangup call
    prisma.call.findFirst.mockResolvedValue(callRow({ status: 'COMPLETED' }));
    prisma.call.updateMany.mockClear();
    const second = await request(app)
      .post(`/api/v1/calls/${CALL_ID}/hangup`)
      .set('Cookie', cookie('t8'))
      .send({});
    expect(second.status).toBe(200);
    expect(prisma.call.updateMany).not.toHaveBeenCalled();
  });

  test("exec cannot hang up another exec's call -> 403", async () => {
    exec();
    prisma.call.findFirst.mockResolvedValue(callRow({ userId: EXEC_OTHER }));
    const res = await request(app)
      .post(`/api/v1/calls/${CALL_ID}/hangup`)
      .set('Cookie', cookie('t9'))
      .send({});
    expect(res.status).toBe(403);
  });

  test('list calls masks toNumber for exec, full for admin', async () => {
    exec();
    prisma.call.findMany.mockResolvedValue([callRow()]);
    prisma.call.count.mockResolvedValue(1);
    const asExec = await request(app)
      .get('/api/v1/calls')
      .set('Cookie', cookie('t10'));
    expect(asExec.status).toBe(200);
    expect(asExec.body.data.calls[0].toNumber).toContain('*');
    expect(asExec.body.data.calls[0].piiMasked).toBe(true);

    admin();
    const asAdmin = await request(app)
      .get('/api/v1/calls')
      .set('Cookie', cookie('t11'));
    expect(asAdmin.body.data.calls[0].toNumber).toBe(PHONE);
  });

  test('call detail for admin audits pii.viewed; exec sees masked', async () => {
    prisma.call.findFirst.mockResolvedValue(callRow({ includeLead: true }));
    exec();
    const asExec = await request(app)
      .get(`/api/v1/calls/${CALL_ID}`)
      .set('Cookie', cookie('t12'));
    expect(asExec.status).toBe(200);
    expect(asExec.body.data.toNumber).toContain('*');
    expect(prisma.auditLog.create).not.toHaveBeenCalled();

    admin();
    const asAdmin = await request(app)
      .get(`/api/v1/calls/${CALL_ID}`)
      .set('Cookie', cookie('t13'));
    expect(asAdmin.body.data.toNumber).toBe(PHONE);
    expect(prisma.auditLog.create).toHaveBeenCalledTimes(1);
    expect(prisma.auditLog.create.mock.calls[0][0].data.action).toBe('pii.viewed');
  });

  test('call detail 404 for unknown id', async () => {
    admin();
    prisma.call.findFirst.mockResolvedValue(null);
    const res = await request(app)
      .get(`/api/v1/calls/${CALL_ID}`)
      .set('Cookie', cookie('t14'));
    expect(res.status).toBe(404);
  });

  test('recording endpoint: 404 without recording, 200 + audit with one', async () => {
    admin();
    prisma.call.findFirst.mockResolvedValue(callRow({ recordingUrl: null }));
    const missing = await request(app)
      .get(`/api/v1/calls/${CALL_ID}/recording`)
      .set('Cookie', cookie('t15'));
    expect(missing.status).toBe(404);

    prisma.call.findFirst.mockResolvedValue(callRow({ recordingUrl: 'https://rec/x.wav' }));
    const ok = await request(app)
      .get(`/api/v1/calls/${CALL_ID}/recording`)
      .set('Cookie', cookie('t15'));
    expect(ok.status).toBe(200);
    expect(JSON.stringify(ok.body.data)).not.toContain('https://rec'); // no public URL leakage
    expect(prisma.auditLog.create.mock.calls[0][0].data.action).toBe('recording.accessed');
  });
});

describe('Phase 4 - call outcome & follow-ups', () => {
  test('outcome before call ends -> 409 CALL_NOT_ENDED', async () => {
    exec();
    prisma.call.findFirst.mockResolvedValue(callRow({ status: 'RINGING', disposition: null }));
    const res = await request(app)
      .post(`/api/v1/calls/${CALL_ID}/outcome`)
      .set('Cookie', cookie('t16'))
      .send({ disposition: 'INTERESTED' });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('CALL_NOT_ENDED');
  });

  test('follow-up outcome creates one linked task + lead stage updates', async () => {
    exec();
    const terminal = callRow({ status: 'COMPLETED', disposition: null });
    prisma.call.findFirst.mockResolvedValue(terminal);
    prisma.call.update.mockResolvedValue(callRow({ status: 'COMPLETED', disposition: 'FOLLOW_UP_REQUIRED' }));
    prisma.lead.findFirst.mockResolvedValue(lead({ status: 'CONTACTED' }));
    prisma.task.create.mockResolvedValue({ id: TASK_ID, title: 'Follow-up: Rohit Sharma', status: 'PENDING', type: 'FOLLOW_UP', dueDate: new Date() });
    prisma.lead.update.mockResolvedValue({});
    prisma.leadActivity.create.mockResolvedValue({});

    const scheduledAt = new Date(Date.now() + 86_400_000).toISOString();
    const res = await request(app)
      .post(`/api/v1/calls/${CALL_ID}/outcome`)
      .set('Cookie', cookie('t17'))
      .send({ disposition: 'FOLLOW_UP_REQUIRED', nextAction: { type: 'FOLLOW_UP', scheduledAt, title: 'Follow-up' } });

    expect(res.status).toBe(200);
    expect(res.body.data.followUp).toBeTruthy();
    expect(prisma.task.create).toHaveBeenCalledTimes(1);
    expect(prisma.task.create.mock.calls[0][0].data).toMatchObject({
      type: 'FOLLOW_UP',
      status: 'PENDING',
      sourceCallId: CALL_ID,
      assignedToId: EXEC,
    });
    expect(prisma.lead.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { nextFollowUpAt: expect.any(Date) },
    }));
    // CONTACTED -> FOLLOW_UP stage transition activity
    const activities = prisma.leadActivity.create.mock.calls.map((c) => c[0].data.type);
    expect(activities).toContain('FOLLOW_UP');
    expect(activities).toContain('STATUS_CHANGE');
  });

  test('callback outcome on a NEW lead advances NEW -> CONTACTED -> FOLLOW_UP', async () => {
    exec();
    prisma.call.findFirst.mockResolvedValue(callRow({ status: 'COMPLETED', disposition: null }));
    prisma.call.update.mockResolvedValue(callRow({ status: 'COMPLETED', disposition: 'CALL_BACK' }));
    prisma.lead.findFirst.mockResolvedValue(lead({ status: 'NEW' }));
    prisma.task.create.mockResolvedValue({ id: TASK_ID, status: 'PENDING', type: 'FOLLOW_UP' });
    prisma.lead.update.mockResolvedValue({});
    prisma.leadActivity.create.mockResolvedValue({});

    const res = await request(app)
      .post(`/api/v1/calls/${CALL_ID}/outcome`)
      .set('Cookie', cookie('t18'))
      .send({ disposition: 'CALL_BACK', nextAction: { type: 'CALL_BACK', scheduledAt: new Date(Date.now() + 3600_000).toISOString() } });

    expect(res.status).toBe(200);
    const statuses = prisma.lead.update.mock.calls
      .map((c) => c[0].data.status)
      .filter(Boolean);
    expect(statuses).toEqual(expect.arrayContaining(['CONTACTED', 'FOLLOW_UP']));
  });

  test('second outcome -> 409 OUTCOME_ALREADY_RECORDED', async () => {
    exec();
    prisma.call.findFirst.mockResolvedValue(callRow({ status: 'COMPLETED', disposition: 'INTERESTED' }));
    const res = await request(app)
      .post(`/api/v1/calls/${CALL_ID}/outcome`)
      .set('Cookie', cookie('t19'))
      .send({ disposition: 'OTHER' });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('OUTCOME_ALREADY_RECORDED');
  });

  test('FOLLOW_UP outcome without scheduledAt -> 400', async () => {
    exec();
    prisma.call.findFirst.mockResolvedValue(callRow({ status: 'COMPLETED', disposition: null }));
    const res = await request(app)
      .post(`/api/v1/calls/${CALL_ID}/outcome`)
      .set('Cookie', cookie('t20'))
      .send({ disposition: 'FOLLOW_UP_REQUIRED', nextAction: { type: 'FOLLOW_UP' } });
    expect(res.status).toBe(400);
  });

  test('TASK outcome without title -> 400', async () => {
    exec();
    prisma.call.findFirst.mockResolvedValue(callRow({ status: 'COMPLETED', disposition: null }));
    const res = await request(app)
      .post(`/api/v1/calls/${CALL_ID}/outcome`)
      .set('Cookie', cookie('t21'))
      .send({ disposition: 'OTHER', nextAction: { type: 'TASK' } });
    expect(res.status).toBe(400);
  });

  test('invalid disposition -> 400', async () => {
    exec();
    const res = await request(app)
      .post(`/api/v1/calls/${CALL_ID}/outcome`)
      .set('Cookie', cookie('t22'))
      .send({ disposition: 'MAYBE' });
    expect(res.status).toBe(400);
  });

  test('none disposition has no follow-up side effects', async () => {
    exec();
    prisma.call.findFirst.mockResolvedValue(callRow({ status: 'COMPLETED', disposition: null }));
    prisma.call.update.mockResolvedValue(callRow({ status: 'COMPLETED', disposition: 'NOT_INTERESTED' }));
    prisma.lead.findFirst.mockResolvedValue(lead({ status: 'QUOTATION' }));
    prisma.leadActivity.create.mockResolvedValue({});

    const res = await request(app)
      .post(`/api/v1/calls/${CALL_ID}/outcome`)
      .set('Cookie', cookie('t23'))
      .send({ disposition: 'NOT_INTERESTED', nextAction: { type: 'NONE' } });

    expect(res.status).toBe(200);
    expect(prisma.task.create).not.toHaveBeenCalled();
    expect(prisma.lead.update).not.toHaveBeenCalled();
    // QUOTATION stage must not change from a communication outcome
    expect(res.body.data.leadId).toBe(LEAD);
  });
});

describe('Phase 4 - tasks lifecycle', () => {
  const taskRow = (overrides = {}) => ({
    id: TASK_ID,
    organizationId: ORG,
    title: 'Follow-up: Rohit',
    type: 'FOLLOW_UP',
    status: 'PENDING',
    priority: 'MEDIUM',
    dueDate: new Date(Date.now() + 3600_000),
    leadId: LEAD,
    assignedToId: EXEC,
    completedAt: null,
    rescheduledAt: null,
    sourceCallId: null,
    ...overrides,
  });

  test('complete a pending task with valid transition', async () => {
    exec();
    prisma.task.findFirst.mockResolvedValue(taskRow());
    prisma.task.update.mockResolvedValue(taskRow({ status: 'COMPLETED', completedAt: new Date() }));
    prisma.lead.update.mockResolvedValue({});
    prisma.leadActivity.create.mockResolvedValue({});
    prisma.lead.findFirst.mockResolvedValue(lead({ status: 'FOLLOW_UP', nextFollowUpAt: new Date() }));

    const res = await request(app)
      .patch(`/api/v1/tasks/${TASK_ID}/status`)
      .set('Cookie', cookie('t24'))
      .send({ status: 'COMPLETED' });
    expect(res.status).toBe(200);
    expect(prisma.task.update.mock.calls[0][0].data).toMatchObject({ status: 'COMPLETED' });
  });

  test('invalid transition COMPLETED -> CANCELLED -> 409', async () => {
    exec();
    prisma.task.findFirst.mockResolvedValue(taskRow({ status: 'COMPLETED' }));
    const res = await request(app)
      .patch(`/api/v1/tasks/${TASK_ID}/status`)
      .set('Cookie', cookie('t25'))
      .send({ status: 'CANCELLED' });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('INVALID_TASK_TRANSITION');
  });

  test('reschedule keeps one task (updates dueDate, no duplicate)', async () => {
    exec();
    prisma.task.findFirst.mockResolvedValue(taskRow());
    const newDue = new Date(Date.now() + 3 * 86_400_000).toISOString();
    prisma.task.update.mockResolvedValue(taskRow({ dueDate: new Date(newDue), rescheduledAt: new Date() }));
    prisma.lead.update.mockResolvedValue({});
    prisma.leadActivity.create.mockResolvedValue({});
    prisma.lead.findFirst.mockResolvedValue(lead({ status: 'FOLLOW_UP' }));

    const res = await request(app)
      .patch(`/api/v1/tasks/${TASK_ID}/reschedule`)
      .set('Cookie', cookie('t26'))
      .send({ dueDate: newDue, reason: 'customer busy' });

    expect(res.status).toBe(200);
    expect(prisma.task.create).not.toHaveBeenCalled();
    expect(prisma.task.update.mock.calls[0][0].data.dueDate).toEqual(new Date(newDue));
    expect(prisma.auditLog.create.mock.calls[0][0].data.action).toBe('followup.rescheduled');
  });

  test('reschedule a completed task -> 409 TASK_NOT_PENDING', async () => {
    exec();
    prisma.task.findFirst.mockResolvedValue(taskRow({ status: 'COMPLETED' }));
    const res = await request(app)
      .patch(`/api/v1/tasks/${TASK_ID}/reschedule`)
      .set('Cookie', cookie('t27'))
      .send({ dueDate: new Date().toISOString() });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('TASK_NOT_PENDING');
  });

  test('task status transition validation with invalid uuid -> 400', async () => {
    exec();
    const res = await request(app)
      .patch('/api/v1/tasks/not-a-uuid/status')
      .set('Cookie', cookie('t28'))
      .send({ status: 'COMPLETED' });
    expect(res.status).toBe(400);
  });

  test('create task with priority and optional source call', async () => {
    exec();
    prisma.call.findFirst.mockResolvedValue(callRow());
    prisma.lead.findFirst.mockResolvedValue(lead());
    prisma.task.create.mockResolvedValue(taskRow({ priority: 'URGENT' }));

    const res = await request(app)
      .post('/api/v1/tasks')
      .set('Cookie', cookie('t29'))
      .send({ title: 'Urgent call back', dueDate: new Date().toISOString(), priority: 'URGENT', leadId: LEAD, sourceCallId: CALL_ID });

    expect(res.status).toBe(201);
    expect(prisma.task.create.mock.calls[0][0].data).toMatchObject({ priority: 'URGENT', sourceCallId: CALL_ID });
  });

  test('create task with unknown source call -> 404', async () => {
    exec();
    prisma.call.findFirst.mockResolvedValue(null);
    prisma.lead.findFirst.mockResolvedValue(lead());
    const res = await request(app)
      .post('/api/v1/tasks')
      .set('Cookie', cookie('t30'))
      .send({ title: 'x', dueDate: new Date().toISOString(), leadId: LEAD, sourceCallId: CALL_ID });
    expect(res.status).toBe(404);
  });

  test('task list masks lead phone for exec', async () => {
    exec();
    prisma.task.findMany.mockResolvedValue([taskRow({ lead: lead() })]);
    prisma.task.count.mockResolvedValue(1);
    const res = await request(app)
      .get('/api/v1/tasks')
      .set('Cookie', cookie('t31'));
    expect(res.status).toBe(200);
    expect(res.body.data.tasks[0].lead.phone).toContain('*');
  });
});

describe('Phase 4 - agenda, productivity, needs attention', () => {
  test('agenda view=today returns tasks with bucket counts', async () => {
    exec();
    prisma.task.findMany.mockResolvedValue([]);
    prisma.task.count.mockResolvedValue(0);

    const res = await request(app)
      .get('/api/v1/activities/agenda?view=today')
      .set('Cookie', cookie('t32'));
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('counts');
    expect(res.body.data).toHaveProperty('items');
    expect(res.body.data.counts).toHaveProperty('dueNow');
  });

  test('agenda with invalid view -> 400', async () => {
    exec();
    const res = await request(app)
      .get('/api/v1/activities/agenda?view=yesterday')
      .set('Cookie', cookie('t33'));
    expect(res.status).toBe(400);
  });

  test('productivity returns real aggregates', async () => {
    admin();
    prisma.user.findMany.mockResolvedValue([]);
    prisma.task.groupBy.mockResolvedValue([]);
    prisma.siteVisit.groupBy.mockResolvedValue([]);
    prisma.lead.findMany.mockResolvedValue([]);
    prisma.call.count.mockResolvedValue(7);
    prisma.call.aggregate.mockResolvedValue({ _sum: { duration: 500 } });
    prisma.whatsAppMessage.count.mockResolvedValue(3);
    prisma.task.count.mockResolvedValue(0);
    prisma.siteVisit.count.mockResolvedValue(1);
    prisma.quotation.count.mockResolvedValue(2);
    prisma.booking.count.mockResolvedValue(1);

    const res = await request(app)
      .get('/api/v1/activities/productivity')
      .set('Cookie', cookie('t34'));
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('calls', 7);
    expect(res.body.data).toHaveProperty('callDurationSeconds', 500);
    expect(res.body.data).toHaveProperty('tasksCompleted');
    expect(res.body.data).toHaveProperty('employees');
  });

  test('needs-attention returns leads without future follow-up', async () => {
    admin();
    prisma.lead.findMany.mockResolvedValue([lead({ nextFollowUpAt: null })]);
    prisma.task.groupBy.mockResolvedValue([]);
    prisma.siteVisit.groupBy.mockResolvedValue([]);

    const res = await request(app)
      .get('/api/v1/activities/needs-attention')
      .set('Cookie', cookie('t35'));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].reasons).toBeTruthy();
  });
});

describe('Phase 4 - lead timeline', () => {
  test('timeline merges activities, calls, tasks sorted desc', async () => {
    admin();
    prisma.lead.findFirst.mockResolvedValue(lead());
    prisma.leadActivity.findMany.mockResolvedValue([
      { id: 'la1', type: 'NOTE', description: 'note', createdAt: new Date('2026-10-01T10:00:00Z'), metadata: {} },
      { id: 'la2', type: 'FOLLOW_UP', description: 'sched', createdAt: new Date('2026-10-02T10:00:00Z'), metadata: { taskId: TASK_ID } },
    ]);
    prisma.call.findMany.mockResolvedValue([callRow({ createdAt: new Date('2026-10-03T10:00:00Z') })]);
    prisma.task.findMany.mockResolvedValue([{ id: TASK_ID, createdAt: new Date('2026-10-02T10:00:00Z'), dueDate: new Date(), status: 'PENDING', type: 'FOLLOW_UP', title: 'Follow-up', leadId: LEAD, assignedToId: EXEC, organizationId: ORG, priority: 'MEDIUM' }]);
    prisma.siteVisit.findMany.mockResolvedValue([]);
    prisma.quotation.findMany.mockResolvedValue([]);
    prisma.booking.findMany.mockResolvedValue([]);
    prisma.whatsAppMessage.findMany.mockResolvedValue([]);

    const res = await request(app)
      .get(`/api/v1/leads/${LEAD}/timeline`)
      .set('Cookie', cookie('t36'));

    expect(res.status).toBe(200);
    const items = res.body.data.items;
    // dedup: activity la2 references TASK_ID -> task wins
    const followUpItems = items.filter((i) => i.kind === 'FOLLOW_UP');
    expect(followUpItems).toHaveLength(1);
    expect(followUpItems[0].link).toEqual({ type: 'task', id: TASK_ID });
    expect(items[0].kind).toBe('CALL'); // newest first
    const kinds = items.map((i) => i.kind);
    expect(kinds).toEqual(expect.arrayContaining(['NOTE', 'CALL', 'FOLLOW_UP']));
  });

  test('timeline 404 for unknown lead', async () => {
    admin();
    prisma.lead.findFirst.mockResolvedValue(null);
    const res = await request(app)
      .get(`/api/v1/leads/${LEAD}/timeline`)
      .set('Cookie', cookie('t37'));
    expect(res.status).toBe(404);
  });

  test('timeline never leaks the raw phone number', async () => {
    exec();
    prisma.lead.findFirst.mockResolvedValue(lead());
    prisma.leadActivity.findMany.mockResolvedValue([]);
    prisma.call.findMany.mockResolvedValue([callRow()]);
    prisma.task.findMany.mockResolvedValue([]);
    prisma.siteVisit.findMany.mockResolvedValue([]);
    prisma.quotation.findMany.mockResolvedValue([]);
    prisma.booking.findMany.mockResolvedValue([]);
    prisma.whatsAppMessage.findMany.mockResolvedValue([]);

    const res = await request(app)
      .get(`/api/v1/leads/${LEAD}/timeline`)
      .set('Cookie', cookie('t38'));
    expect(res.status).toBe(200);
    const callItem = res.body.data.items.find((i) => i.kind === 'CALL');
    expect(callItem).toBeTruthy();
    expect(callItem.meta.toNumber).toBeUndefined();
    expect(JSON.stringify(res.body.data.items)).not.toContain('90000');
  });
});

describe('Phase 4 - WhatsApp', () => {
  test('status reports provider honestly', async () => {
    admin();
    const res = await request(app)
      .get('/api/v1/whatsapp/status')
      .set('Cookie', cookie('t39'));
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ provider: 'mock', configured: true, simulated: true });
  });

  test('send message when not configured -> 409 WHATSAPP_NOT_CONFIGURED', async () => {
    process.env.WHATSAPP_PROVIDER = 'none';
    resetWhatsAppProvider();
    admin();
    prisma.whatsAppConversation.findFirst.mockResolvedValue({
      id: CONV_ID, status: 'ACTIVE', leadId: LEAD, lead: { phone: PHONE, assignedToId: EXEC }, providerContactId: PHONE,
    });
    const res = await request(app)
      .post(`/api/v1/whatsapp/conversations/${CONV_ID}/messages`)
      .set('Cookie', cookie('t40'))
      .send({ body: 'hello' });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('WHATSAPP_NOT_CONFIGURED');
    expect(prisma.whatsAppMessage.create).not.toHaveBeenCalled();
  });

  test('send text message via mock provider creates message + activity + audit', async () => {
    exec();
    prisma.whatsAppConversation.findFirst.mockResolvedValue({
      id: CONV_ID, status: 'ACTIVE', leadId: LEAD, organizationId: ORG,
      lead: { phone: PHONE, assignedToId: EXEC }, providerContactId: PHONE,
    });
    prisma.whatsAppMessage.create.mockResolvedValue({ id: 'msg1', status: 'SENT', body: 'hello' });
    prisma.whatsAppConversation.update.mockResolvedValue({});
    prisma.leadActivity.create.mockResolvedValue({});

    const res = await request(app)
      .post(`/api/v1/whatsapp/conversations/${CONV_ID}/messages`)
      .set('Cookie', cookie('t41'))
      .send({ body: 'hello' });

    expect(res.status).toBe(201);
    expect(prisma.whatsAppMessage.create.mock.calls[0][0].data).toMatchObject({ direction: 'OUTBOUND', leadId: LEAD });
    const activities = prisma.leadActivity.create.mock.calls.map((c) => c[0].data.type);
    expect(activities).toContain('WHATSAPP');
    expect(prisma.auditLog.create.mock.calls[0][0].data.action).toBe('whatsapp.sent');
    // no message body in audit
    expect(JSON.stringify(prisma.auditLog.create.mock.calls[0][0].data.metadata || {})).not.toContain('hello');
  });

  test('template send requires variables', async () => {
    admin();
    prisma.whatsAppConversation.findFirst.mockResolvedValue({
      id: CONV_ID, status: 'ACTIVE', leadId: LEAD, organizationId: ORG,
      lead: { phone: PHONE, assignedToId: EXEC }, providerContactId: PHONE,
    });
    prisma.whatsAppTemplate.findFirst.mockResolvedValue({ id: 'tpl1', name: 'welcome', active: true, variables: ['name'] });
    const res = await request(app)
      .post(`/api/v1/whatsapp/conversations/${CONV_ID}/messages`)
      .set('Cookie', cookie('t42'))
      .send({ templateName: 'welcome' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('TEMPLATE_VARIABLES_MISSING');
  });

  test('inactive template -> 409', async () => {
    admin();
    prisma.whatsAppConversation.findFirst.mockResolvedValue({
      id: CONV_ID, status: 'ACTIVE', leadId: LEAD, organizationId: ORG,
      lead: { phone: PHONE, assignedToId: EXEC }, providerContactId: PHONE,
    });
    prisma.whatsAppTemplate.findFirst.mockResolvedValue({ id: 'tpl1', name: 'welcome', active: false, variables: [] });
    const res = await request(app)
      .post(`/api/v1/whatsapp/conversations/${CONV_ID}/messages`)
      .set('Cookie', cookie('t43'))
      .send({ templateName: 'welcome' });
    expect(res.status).toBe(409);
  });

  test('conversation creation is scoped to own lead for exec', async () => {
    exec();
    prisma.lead.findFirst.mockResolvedValue(lead({ assignedToId: EXEC_OTHER }));
    const res = await request(app)
      .post('/api/v1/whatsapp/conversations')
      .set('Cookie', cookie('t44'))
      .send({ leadId: LEAD });
    expect(res.status).toBe(403);
  });

  test('template management: exec 403, admin 201', async () => {
    exec();
    const denied = await request(app)
      .post('/api/v1/whatsapp/templates')
      .set('Cookie', cookie('t45'))
      .send({ name: 'x' });
    expect(denied.status).toBe(403);

    admin();
    prisma.whatsAppTemplate.findFirst.mockResolvedValue(null);
    prisma.whatsAppTemplate.create.mockResolvedValue({ id: 'tpl1', name: 'welcome', active: true, variables: [] });
    const ok = await request(app)
      .post('/api/v1/whatsapp/templates')
      .set('Cookie', cookie('t46'))
      .send({ name: 'welcome', variables: ['name'] });
    expect(ok.status).toBe(201);
  });

  test('duplicate template name -> 409', async () => {
    admin();
    prisma.whatsAppTemplate.findFirst.mockResolvedValue({ id: 'tpl1', name: 'welcome' });
    const res = await request(app)
      .post('/api/v1/whatsapp/templates')
      .set('Cookie', cookie('t47'))
      .send({ name: 'welcome' });
    expect(res.status).toBe(409);
  });
});

describe('Phase 4 - webhooks (HMAC + idempotency)', () => {
  const postTelephony = (payload, signature) => {
    const raw = JSON.stringify(payload);
    return request(app)
      .post('/api/v1/webhooks/telephony/mock')
      .set('Content-Type', 'application/json')
      .set('x-webhook-signature', signature)
      .send(raw);
  };

  test('bad signature -> 401', async () => {
    const res = await postTelephony({ status: 'completed' }, 'sha256=deadbeef');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('WEBHOOK_SIGNATURE_INVALID');
    expect(prisma.call.findFirst).not.toHaveBeenCalled();
  });

  test('valid signature, unknown call -> acknowledged and ignored', async () => {
    prisma.call.findFirst.mockResolvedValue(null);
    const payload = { eventId: 'ev1', callId: 'missing', status: 'completed' };
    const res = await postTelephony(payload, sign(JSON.stringify(payload)));
    expect(res.status).toBe(200);
    expect(res.body.data.ignored).toBe(true);
    expect(prisma.call.update).not.toHaveBeenCalled();
  });

  test('valid webhook updates call status and records event', async () => {
    prisma.call.findFirst.mockResolvedValue(callRow({ status: 'IN_PROGRESS' }));
    prisma.callEvent.findFirst.mockResolvedValue(null);
    prisma.call.update.mockResolvedValue(callRow({ status: 'COMPLETED' }));
    prisma.callEvent.create.mockResolvedValue({});

    const payload = { eventId: 'ev2', callId: CALL_ID, status: 'completed', duration: 42 };
    const res = await postTelephony(payload, sign(JSON.stringify(payload)));

    expect(res.status).toBe(200);
    expect(prisma.call.update.mock.calls[0][0].data.status).toBe('COMPLETED');
    expect(prisma.callEvent.create).toHaveBeenCalledTimes(1);
  });

  test('duplicate eventId is idempotent', async () => {
    prisma.call.findFirst.mockResolvedValue(callRow());
    prisma.callEvent.findFirst.mockResolvedValue({ id: 'evt-dup' });

    const payload = { eventId: 'ev2', callId: CALL_ID, status: 'completed' };
    const res = await postTelephony(payload, sign(JSON.stringify(payload)));

    expect(res.status).toBe(200);
    expect(res.body.data.duplicate).toBe(true);
    expect(prisma.call.update).not.toHaveBeenCalled();
    expect(prisma.callEvent.create).not.toHaveBeenCalled();
  });

  test('unknown provider -> 503', async () => {
    const raw = JSON.stringify({ status: 'completed' });
    const res = await request(app)
      .post('/api/v1/webhooks/telephony/twilio')
      .set('Content-Type', 'application/json')
      .set('x-webhook-signature', sign(raw))
      .send(raw);
    expect(res.status).toBe(503);
  });

  test('whatsapp bad signature -> 401', async () => {
    const raw = JSON.stringify({ type: 'message', body: 'hi' });
    const res = await request(app)
      .post('/api/v1/webhooks/whatsapp/mock')
      .set('Content-Type', 'application/json')
      .set('x-webhook-signature', 'sha256=bad')
      .send(raw);
    expect(res.status).toBe(401);
  });

  test('whatsapp inbound message creates message + conversation activity', async () => {
    prisma.whatsAppMessage.findFirst.mockResolvedValue(null);
    prisma.lead.findFirst
      .mockResolvedValueOnce(null) // by organizationId+leadId
      .mockResolvedValueOnce(lead({ organizationId: ORG })); // by phone
    prisma.whatsAppConversation.findFirst.mockResolvedValue(null);
    prisma.whatsAppConversation.create.mockResolvedValue({ id: CONV_ID });
    prisma.whatsAppMessage.create.mockResolvedValue({ id: 'msg2' });
    prisma.whatsAppConversation.update.mockResolvedValue({});
    prisma.leadActivity.create.mockResolvedValue({});

    const payload = {
      type: 'message',
      organizationId: ORG,
      leadId: LEAD,
      providerMessageId: 'wamid.1',
      phone: PHONE,
      body: 'interested in 2BHK',
    };
    const res = await request(app)
      .post('/api/v1/webhooks/whatsapp/mock')
      .set('Content-Type', 'application/json')
      .set('x-webhook-signature', whSign(JSON.stringify(payload)))
      .send(JSON.stringify(payload));

    expect(res.status).toBe(200);
    expect(res.body.data.messageId).toBe('msg2');
    expect(prisma.whatsAppMessage.create.mock.calls[0][0].data).toMatchObject({ direction: 'INBOUND', status: 'READ' });
    const activities = prisma.leadActivity.create.mock.calls.map((c) => c[0].data.type);
    expect(activities).toContain('WHATSAPP');
  });

  test('whatsapp inbound idempotent by providerMessageId', async () => {
    prisma.whatsAppMessage.findFirst.mockResolvedValue({ id: 'msg-existing' });
    const payload = { type: 'message', providerMessageId: 'wamid.1', body: 'hi' };
    const res = await request(app)
      .post('/api/v1/webhooks/whatsapp/mock')
      .set('Content-Type', 'application/json')
      .set('x-webhook-signature', whSign(JSON.stringify(payload)))
      .send(JSON.stringify(payload));
    expect(res.status).toBe(200);
    expect(res.body.data.duplicate).toBe(true);
    expect(prisma.whatsAppMessage.create).not.toHaveBeenCalled();
  });

  test('whatsapp status event never downgrades status', async () => {
    prisma.whatsAppMessage.findFirst.mockResolvedValue({ id: 'msg3', status: 'READ' });
    const payload = { type: 'status', providerMessageId: 'wamid.2', status: 'sent' };
    const res = await request(app)
      .post('/api/v1/webhooks/whatsapp/mock')
      .set('Content-Type', 'application/json')
      .set('x-webhook-signature', whSign(JSON.stringify(payload)))
      .send(JSON.stringify(payload));
    expect(res.status).toBe(200);
    expect(res.body.data.duplicate).toBe(true);
    expect(prisma.whatsAppMessage.update).not.toHaveBeenCalled();
  });

  test('whatsapp verify handshake rejects wrong token', async () => {
    const res = await request(app)
      .get('/api/v1/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=123');
    expect(res.status).toBe(403);
  });

  test('whatsapp verify handshake accepts correct token', async () => {
    const res = await request(app)
      .get(`/api/v1/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=${process.env.WHATSAPP_VERIFY_TOKEN}&hub.challenge=999`);
    expect(res.status).toBe(200);
    expect(res.text).toBe('999');
  });
});

describe('Phase 4 - PII utilities', () => {
  const { maskPhone, maskEmail, canSeePII, maskContact } = require('../src/utils/pii');

  test('maskPhone keeps country code and last 4', () => {
    const masked = maskPhone('+91 90000 12345');
    expect(masked.startsWith('+91')).toBe(true);
    expect(masked.endsWith('2345')).toBe(true);
    expect(masked).toContain('*');
    expect(masked).not.toContain('90000');
    expect(maskPhone(null)).toBeNull();
    expect(maskPhone('')).toBe('');
  });

  test('maskEmail keeps first char and domain', () => {
    expect(maskEmail('rohit@example.com')).toBe('r***@example.com');
    expect(maskEmail(null)).toBeNull();
  });

  test('canSeePII only for admin-level roles', () => {
    expect(canSeePII('SUPER_ADMIN')).toBe(true);
    expect(canSeePII('ADMIN')).toBe(true);
    expect(canSeePII('SALES_MANAGER')).toBe(false);
    expect(canSeePII('SALES_EXECUTIVE')).toBe(false);
    expect(canSeePII('CHANNEL_PARTNER')).toBe(false);
  });

  test('maskContact masks phone/email and flags piiMasked', () => {
    const out = maskContact({ phone: '+91 90000 12345', email: 'a@b.com' }, 'SALES_EXECUTIVE');
    expect(out.phone).toContain('*');
    expect(out.email).toContain('*');
    expect(out.piiMasked).toBe(true);

    const full = maskContact({ phone: '+91 90000 12345', email: 'a@b.com' }, 'ADMIN');
    expect(full.phone).toBe('+91 90000 12345');
    expect(full.piiMasked).toBeUndefined();
  });

  test('masked phone is never writable back', async () => {
    exec();
    prisma.user.findFirst.mockResolvedValue(null);
    prisma.lead.findFirst.mockResolvedValue(lead());
    prisma.lead.update.mockResolvedValue(lead());
    prisma.leadActivity.create.mockResolvedValue({});

    const res = await request(app)
      .patch(`/api/v1/leads/${LEAD}`)
      .set('Cookie', cookie('t60'))
      .send({ phone: '+91********2345', notes: 'updated' });

    expect(res.status).toBe(200);
    const dataArg = prisma.lead.update.mock.calls[0][0].data;
    expect(dataArg.phone).toBeUndefined();
  });
});
