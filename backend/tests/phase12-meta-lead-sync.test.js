const crypto = require('crypto');
const request = require('supertest');
const app = require('../src/app');
const prisma = require('../src/db/prisma');

jest.mock('../src/db/prisma', () => ({
  session: { findUnique: jest.fn() },
  organization: { findFirst: jest.fn() },
  lead: { findFirst: jest.fn(), findMany: jest.fn(), count: jest.fn(), create: jest.fn(), update: jest.fn() },
  leadActivity: { create: jest.fn() },
  auditLog: { create: jest.fn() },
  $transaction: jest.fn(),
}));

const ORG = '11111111-1111-4111-8111-111111111111';
const PAGE_ID = '111222333444';
const LEAD_ID = 'aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const META_ENV_KEYS = ['META_APP_ID', 'META_APP_SECRET', 'META_ACCESS_TOKEN', 'META_AD_ACCOUNT_ID', 'META_PAGE_ID', 'META_GRAPH_VERSION', 'META_WEBHOOK_VERIFY_TOKEN'];
let savedMetaEnv;

const stubGraph = (response, ok = true, status = 200) =>
  jest.spyOn(global, 'fetch').mockResolvedValue({ ok, status, json: async () => response });

const sign = (rawBody) =>
  `sha256=${crypto.createHmac('sha256', process.env.META_APP_SECRET || '').update(rawBody).digest('hex')}`;

const leadDetail = (overrides = {}) => ({
  id: '123456789',
  created_time: 1729000000,
  field_data: [
    { name: 'full_name', values: ['Rohit Sharma'] },
    { name: 'phone_number', values: ['+91 90000 12345'] },
    { name: 'email', values: ['rohit@example.com'] },
    { name: 'city', values: ['Noida'] },
  ],
  ad_id: '555',
  adset_id: '556',
  campaign_id: '557',
  form_id: '558',
  ...overrides,
});

const leadgenEvent = (valueOverrides = {}) => ({
  object: 'page',
  entry: [{
    id: PAGE_ID,
    changes: [{
      field: 'leadgen',
      value: {
        leadgen_id: '123456789', page_id: PAGE_ID, form_id: '558',
        ad_id: '555', created_time: 1729000000, ...valueOverrides,
      },
    }],
  }],
});

const postWebhook = (payload) => {
  const raw = JSON.stringify(payload);
  return request(app)
    .post('/api/v1/webhooks/meta/leadgen')
    .set('Content-Type', 'application/json')
    .set('X-Hub-Signature-256', sign(raw))
    .send(raw);
};

const lead = (overrides = {}) => ({
  id: LEAD_ID,
  organizationId: ORG,
  name: 'Rohit Sharma',
  phone: '+91 90000 12345',
  status: 'NEW',
  campaign: null,
  metaLeadId: null,
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
  savedMetaEnv = {};
  for (const key of META_ENV_KEYS) {
    savedMetaEnv[key] = process.env[key];
    delete process.env[key];
  }
  process.env.META_APP_SECRET = 'test-meta-secret';
  process.env.META_ACCESS_TOKEN = 'test-meta-token';
  process.env.META_PAGE_ID = PAGE_ID;
  process.env.META_WEBHOOK_VERIFY_TOKEN = 'test-verify-token';
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

describe('Phase 12: Leadgen webhook verification and signatures', () => {
  test('GET verify accepts the configured token (200 + challenge text)', async () => {
    const res = await request(app)
      .get('/api/v1/webhooks/meta/leadgen?hub.mode=subscribe&hub.verify_token=test-verify-token&hub.challenge=777');
    expect(res.status).toBe(200);
    expect(res.text).toBe('777');
  });

  test('GET verify rejects wrong tokens (403)', async () => {
    const res = await request(app)
      .get('/api/v1/webhooks/meta/leadgen?hub.mode=subscribe&hub.verify_token=nope&hub.challenge=777');
    expect(res.status).toBe(403);
  });

  test('POST rejects bad signatures and missing secrets (401, fail-closed)', async () => {
    const payload = leadgenEvent();
    const raw = JSON.stringify(payload);
    const bad = await request(app)
      .post('/api/v1/webhooks/meta/leadgen')
      .set('Content-Type', 'application/json')
      .set('X-Hub-Signature-256', 'sha256=deadbeef')
      .send(raw);
    expect(bad.status).toBe(401);

    delete process.env.META_APP_SECRET;
    const noSecret = await request(app)
      .post('/api/v1/webhooks/meta/leadgen')
      .set('Content-Type', 'application/json')
      .set('X-Hub-Signature-256', sign(raw))
      .send(raw);
    expect(noSecret.status).toBe(401);
    expect(JSON.stringify(noSecret.body)).not.toContain('test-meta-secret');
  });
});

describe('Phase 12: Native envelope parsing and mapping', () => {
  test('ignores non-leadgen fields and malformed payloads safely', async () => {
    const other = await postWebhook({ object: 'page', entry: [{ id: PAGE_ID, changes: [{ field: 'feed', value: {} }] }] });
    expect(other.status).toBe(200);
    expect(other.body.data).toMatchObject({ processed: 0, ignored: 1, duplicates: 0 });

    const malformed = await postWebhook({ object: 'page' });
    expect(malformed.status).toBe(400);

    const spy = jest.spyOn(global, 'fetch');
    expect(spy).not.toHaveBeenCalled();
  });

  test('maps names, contact fields and custom answers', async () => {
    prisma.lead.findFirst.mockResolvedValue(null);
    stubGraph(leadDetail())
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => leadDetail() })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ id: '557', name: 'Diwali Push' }) });
    prisma.lead.create.mockResolvedValue(lead());
    prisma.leadActivity.create.mockResolvedValue({});

    const res = await postWebhook(leadgenEvent());
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ processed: 1, ignored: 0, duplicates: 0 });
    expect(prisma.lead.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organizationId: ORG,
          name: 'Rohit Sharma',
          phone: '+91 90000 12345',
          email: 'rohit@example.com',
          source: 'Meta',
          campaign: 'Diwali Push',
          metaLeadId: '123456789',
          metaPageId: PAGE_ID,
          metaFormId: '558',
          metaAdId: '555',
          metaAdsetId: '556',
          metaCampaignId: '557',
          metaCampaignName: 'Diwali Push',
          metaPlatform: null,
          status: 'NEW',
        }),
      })
    );
    const created = prisma.lead.create.mock.calls[0][0].data;
    expect(created.message).toContain('city: Noida');
    expect(created.message).not.toContain('full_name');
    expect(created.metaCreatedAt).toEqual(new Date(1729000000 * 1000));
  });

  test('joins split first/last names and tolerates missing contact rows', async () => {
    prisma.lead.findFirst.mockResolvedValue(null);
    stubGraph({})
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => leadDetail({
        field_data: [
          { name: 'first_name', values: ['Asha'] },
          { name: 'last_name', values: ['Verma'] },
          { name: 'phone_number', values: ['+91 90000 99999'] },
        ],
      }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ id: '557', name: 'Diwali Push' }) });
    prisma.lead.create.mockResolvedValue(lead({ phone: '+91 90000 99999' }));
    prisma.leadActivity.create.mockResolvedValue({});

    const res = await postWebhook(leadgenEvent());
    expect(res.status).toBe(200);
    expect(prisma.lead.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ name: 'Asha Verma', email: null }) })
    );
  });

  test('skips leads without a phone identity (200, no row)', async () => {
    prisma.lead.findFirst.mockResolvedValue(null);
    stubGraph({})
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => leadDetail({ field_data: [{ name: 'email', values: ['a@b.com'] }] }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ id: '557', name: 'Diwali Push' }) });

    const res = await postWebhook(leadgenEvent());
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ processed: 0, ignored: 1, duplicates: 0 });
    expect(prisma.lead.create).not.toHaveBeenCalled();
  });
});

describe('Phase 12: Upstream failures, idempotency and isolation', () => {
  test('deleted Meta leads are ignored without retry storms (200)', async () => {
    stubGraph({ error: { message: 'Object does not exist', code: 100 } }, false, 400);

    const res = await postWebhook(leadgenEvent());
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ processed: 0, ignored: 1, duplicates: 0 });
    expect(prisma.lead.create).not.toHaveBeenCalled();
  });

  test('rate limits and timeouts propagate for Meta-side retry (429/504)', async () => {
    stubGraph({ error: { message: 'Throttled', code: 80004 } }, false, 429);
    const limited = await postWebhook(leadgenEvent());
    expect(limited.status).toBe(429);

    const err = new Error('timed out');
    err.name = 'TimeoutError';
    jest.spyOn(global, 'fetch').mockRejectedValue(err);
    const timedOut = await postWebhook(leadgenEvent());
    expect(timedOut.status).toBe(504);
  });

  test('existing metaLeadId short-circuits without writes (duplicate)', async () => {
    prisma.lead.findFirst.mockResolvedValue(lead({ metaLeadId: '123456789' }));
    const spy = jest.spyOn(global, 'fetch');

    const res = await postWebhook(leadgenEvent());
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ processed: 0, ignored: 0, duplicates: 1 });
    expect(prisma.lead.create).not.toHaveBeenCalled();
    expect(spy).not.toHaveBeenCalled();
  });

  test('concurrent duplicate delivery survives the unique race (P2002)', async () => {
    prisma.lead.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(lead({ metaLeadId: '123456789' }));
    stubGraph({})
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => leadDetail() })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ id: '557', name: 'Diwali Push' }) });
    prisma.lead.create.mockRejectedValueOnce({ code: 'P2002' });
    prisma.leadActivity.create.mockResolvedValue({});

    const res = await postWebhook(leadgenEvent());
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ processed: 0, ignored: 0, duplicates: 1 });
  });

  test('rejects events for unconfigured pages (400) and missing page config (503)', async () => {
    const spy = jest.spyOn(global, 'fetch');
    const wrong = await postWebhook(leadgenEvent({ page_id: '999000111' }));
    expect(wrong.status).toBe(400);
    expect(wrong.body.code).toBe('PAGE_MISMATCH');

    delete process.env.META_PAGE_ID;
    const unconfigured = await postWebhook(leadgenEvent());
    expect(unconfigured.status).toBe(503);
    expect(spy).not.toHaveBeenCalled();
  });

  test('same metaLeadId in another org is independent (scoped lookups)', async () => {
    prisma.lead.findFirst.mockResolvedValue(null);
    stubGraph({})
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => leadDetail() })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ id: '557', name: 'Diwali Push' }) });
    prisma.lead.create.mockResolvedValue(lead());
    prisma.leadActivity.create.mockResolvedValue({});

    const res = await postWebhook(leadgenEvent());
    expect(res.status).toBe(200);
    for (const call of prisma.lead.findFirst.mock.calls) {
      expect(call[0].where.organizationId).toBe(ORG);
    }
    expect(prisma.lead.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ organizationId: ORG }) })
    );
  });
});

describe('Phase 12: Phone-match attach, activities and leak checks', () => {
  test('attaches meta fields without touching identity, message or ownership', async () => {
    const existing = lead({ metaLeadId: null, campaign: null, status: 'NEW', assignedToId: 'some-user' });
    prisma.lead.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(existing);
    stubGraph({})
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => leadDetail() })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ id: '557', name: 'Diwali Push' }) });
    prisma.lead.update.mockResolvedValue(existing);
    prisma.leadActivity.create.mockResolvedValue({});

    const res = await postWebhook(leadgenEvent());
    expect(res.status).toBe(200);
    expect(prisma.lead.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: LEAD_ID },
        data: expect.objectContaining({ metaLeadId: '123456789', campaign: 'Diwali Push' }),
      })
    );
    const data = prisma.lead.update.mock.calls[0][0].data;
    for (const key of ['name', 'phone', 'email', 'message', 'assignedToId']) {
      expect(data).not.toHaveProperty(key);
    }
    expect(data).not.toHaveProperty('status');
  });

  test('reopens LOST leads on fresh Meta interest', async () => {
    prisma.lead.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(lead({ status: 'LOST' }));
    stubGraph({})
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => leadDetail() })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ id: '557', name: 'Diwali Push' }) });
    prisma.lead.update.mockResolvedValue(lead());
    prisma.leadActivity.create.mockResolvedValue({});

    const res = await postWebhook(leadgenEvent());
    expect(res.status).toBe(200);
    expect(prisma.lead.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'NEW' }) })
    );
  });

  test('writes NOTE activity + audit without PII or secrets', async () => {
    prisma.lead.findFirst.mockResolvedValue(null);
    stubGraph({})
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => leadDetail() })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ id: '557', name: 'Diwali Push' }) });
    prisma.lead.create.mockResolvedValue(lead());
    prisma.leadActivity.create.mockResolvedValue({});

    const res = await postWebhook(leadgenEvent());
    expect(res.status).toBe(200);
    const activities = prisma.leadActivity.create.mock.calls.map((c) => c[0].data.type);
    expect(activities).toContain('NOTE');
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'meta.lead_sync' }) })
    );
    const serialized = JSON.stringify(prisma.auditLog.create.mock.calls[0][0].data);
    expect(serialized).not.toContain('Rohit Sharma');
    expect(serialized).not.toContain('90000');
    expect(serialized).not.toContain('test-meta-token');
    expect(JSON.stringify(res.body)).not.toContain('90000');
  });

  test('rejects non-numeric leadgen ids before any Meta call (400)', async () => {
    const spy = jest.spyOn(global, 'fetch');
    const res = await postWebhook(leadgenEvent({ leadgen_id: '../../admin' }));
    expect(res.status).toBe(400);
    expect(spy).not.toHaveBeenCalled();
    expect(prisma.lead.create).not.toHaveBeenCalled();
  });
});
