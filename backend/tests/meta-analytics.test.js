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
    siteVisit: { count: jest.fn() },
    quotation: { count: jest.fn() },
    booking: { findMany: jest.fn() },
  };
  mock.$transaction = jest.fn(async (fn) => fn(mock));
  return mock;
});

// Phase 6 — analytics, CRM attribution and advisory recommendations.
// Everything Graph-facing is stubbed; the CRM side is mocked at the prisma
// boundary. Contracts under test: live-insights mapping, cohort funnel
// joins (Lead → SiteVisit/Quotation/Booking), null-not-fabricated costs on
// zero denominators, honest attribution gap counts, ad→creative join with
// coverage reporting, the PURE recommendation engine (median rules,
// advisory-only), RBAC, date-range validation, and the read-only guarantee
// (no audit rows, no writes, every provider call is a GET).

const ORG = '11111111-1111-4111-8111-111111111111';
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

const get = (path, cookie) => request(app).get(path).set('Cookie', cookie || 'spaceezy_session=admin-token');

// Routes Graph calls by the LAST path segment. Analytics uses exactly
// three edges: insights (level via query param), ads and adcreatives (the
// bounded creative join). Handlers may branch on the query string.
const stubGraph = (routes) =>
  jest.spyOn(global, 'fetch').mockImplementation(async (url, init = {}) => {
    const parsed = new URL(String(url));
    const id = parsed.pathname.split('/').filter(Boolean).pop() || '';
    const handler = routes[id];
    if (handler === undefined) {
      return { ok: false, status: 404, json: async () => ({ error: { message: `No stub for ${id}`, code: 100 } }) };
    }
    const value = typeof handler === 'function'
      ? handler({ url: String(url), pathname: parsed.pathname, params: parsed.searchParams, init })
      : handler;
    const status = value && value.__status ? value.__status : 200;
    const body = value && value.__body !== undefined ? value.__body : value;
    return { ok: status >= 200 && status < 300, status, json: async () => body };
  });

const fetchSpy = () => jest.spyOn(global, 'fetch').mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });

const storedRow = (overrides = {}) => ({
  id: 'settings-row',
  organizationId: ORG,
  accessTokenEnc: encryptSecret('DB-TOKEN-SECRET', ENC),
  appSecretEnc: encryptSecret('DB-APP-SECRET', ENC),
  selectedAdAccountIds: ['999000'],
  pageIds: ['111222333444'],
  instagramAccountIds: [],
  graphVersion: 'v22.0',
  tokenExpiresAt: null,
  syncedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

// ---------------------------------------------------------------------------
// Fixtures — Meta insights rows (strings, as the API returns them) and a
// five-lead CRM cohort with mixed attribution quality.
// ---------------------------------------------------------------------------

const accountInsight = {
  spend: '1500.50', impressions: '100000', reach: '80000', frequency: '1.25',
  clicks: '1200', ctr: '1.2', cpc: '1.25', cpm: '15.01',
  actions: [{ action_type: 'leadgen', value: '42' }],
  date_start: '2026-10-15', date_stop: '2026-11-13', account_currency: 'INR',
};

const campaignInsights = [
  {
    campaign_id: '9001', campaign_name: 'Wave City Launch',
    spend: '900.00', impressions: '60000', reach: '50000', frequency: '1.2',
    clicks: '700', ctr: '1.17', cpc: '1.29', cpm: '15.00',
    actions: [{ action_type: 'leadgen', value: '30' }],
    date_start: '2026-10-15', date_stop: '2026-11-13', account_currency: 'INR',
  },
  {
    campaign_id: '9002', campaign_name: 'Sky Villa Retargeting',
    spend: '600.50', impressions: '40000', reach: '30000', frequency: '1.33',
    clicks: '500', ctr: '1.25', cpc: '1.20', cpm: '15.01',
    actions: [{ action_type: 'leadgen', value: '12' }],
    date_start: '2026-10-15', date_stop: '2026-11-13', account_currency: 'INR',
  },
];

const leadCohort = [
  { id: 'l1', status: 'QUALIFIED', metaCampaignId: '9001', metaCampaignName: 'Wave City Launch', metaAdsetId: '9100', metaAdId: '8001' },
  { id: 'l2', status: 'NEW', metaCampaignId: '9001', metaCampaignName: 'Wave City Launch', metaAdsetId: '9100', metaAdId: null },
  { id: 'l3', status: 'SITE_VISIT', metaCampaignId: '9001', metaCampaignName: 'Wave City Launch', metaAdsetId: null, metaAdId: '8002' },
  { id: '40000000-0000-4000-8000-000000000004', status: 'BOOKED', metaCampaignId: '9002', metaCampaignName: 'Sky Villa Retargeting', metaAdsetId: '9200', metaAdId: '8100' },
  { id: 'l5', status: 'NEW', metaCampaignId: null, metaCampaignName: null, metaAdsetId: null, metaAdId: null },
];

const bookingRows = [
  { id: 'b1', amount: 5000000, paymentStatus: 'COMPLETED' },
  { id: 'b2', amount: 2500000, paymentStatus: 'PENDING' },
];

const mockCrm = ({ leads = leadCohort, siteVisits = 2, quotations = 1, bookings = bookingRows } = {}) => {
  prisma.lead.findMany.mockResolvedValue(leads);
  prisma.siteVisit.count.mockResolvedValue(siteVisits);
  prisma.quotation.count.mockResolvedValue(quotations);
  prisma.booking.findMany.mockResolvedValue(bookings);
};

const insightsRoute = (rowsOrFn) => ({ insights: rowsOrFn });

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

describe('Phase 6: analytics overview', () => {
  test('joins live campaign insights with CRM-attributed leads', async () => {
    admin();
    prisma.metaAdsSettings.findUnique.mockResolvedValue(storedRow());
    mockCrm();
    stubGraph(insightsRoute(({ params }) => {
      const level = params.get('level');
      if (level === 'campaign') return { data: campaignInsights };
      return { data: [accountInsight] };
    }));

    const res = await get('/api/v1/meta-ads/analytics/overview?datePreset=last_30d');

    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(d.adAccountId).toBe('999000');
    expect(d.currency).toBe('INR');

    // Account totals: Meta metrics + CRM lead counts + real CPL.
    expect(d.totals).toMatchObject({
      spend: 1500.5,
      impressions: 100000,
      reach: 80000,
      frequency: 1.25,
      clicks: 1200,
      leads: 42,
      crmAttributedLeads: 4,
      crmContacted: 3,
      crmQualified: 3,
    });
    expect(d.totals.crmCostPerLead).toBeCloseTo(1500.5 / 4, 5);

    // Per-campaign rows carry their own attributed-lead joins.
    expect(d.campaigns).toHaveLength(2);
    expect(d.campaigns[0]).toMatchObject({
      campaignId: '9001', campaignName: 'Wave City Launch', spend: 900,
      leads: 30, crmLeads: 3, crmContacted: 2, crmQualified: 2,
    });
    expect(d.campaigns[0].crmCostPerLead).toBeCloseTo(900 / 3, 5);
    expect(d.campaigns[1]).toMatchObject({ campaignId: '9002', crmLeads: 1, crmQualified: 1 });

    // CRM summary exposes attribution quality honestly.
    expect(d.crm).toMatchObject({
      totalLeadsInPeriod: 5,
      attributedLeads: 4,
      contacted: 3,
      qualified: 3,
      missingMetaAdId: 1,
      missingMetaAdsetId: 1,
    });

    // Both insights levels were requested with the documented metric set.
    expect(global.fetch).toHaveBeenCalledTimes(2);
    for (const [url] of global.fetch.mock.calls) {
      const params = new URL(String(url)).searchParams;
      expect(params.get('fields')).toContain('spend');
      expect(params.get('fields')).toContain('actions');
      expect(params.get('date_preset')).toBe('last_30d');
    }
    expect(JSON.stringify(res.body)).not.toContain('DB-TOKEN-SECRET');
  });

  test('cost per lead is null — not fabricated — when no leads are attributed', async () => {
    admin();
    prisma.metaAdsSettings.findUnique.mockResolvedValue(storedRow());
    mockCrm({ leads: [] });
    stubGraph(insightsRoute(({ params }) => (
      params.get('level') === 'campaign' ? { data: [] } : { data: [accountInsight] }
    )));

    const res = await get('/api/v1/meta-ads/analytics/overview?datePreset=last_30d');

    expect(res.status).toBe(200);
    expect(res.body.data.totals.crmAttributedLeads).toBe(0);
    expect(res.body.data.totals.crmCostPerLead).toBeNull();
    expect(res.body.data.campaigns).toHaveLength(0);
  });

  test('explicit since/until range is passed through to both Meta and the CRM', async () => {
    admin();
    prisma.metaAdsSettings.findUnique.mockResolvedValue(storedRow());
    mockCrm({ leads: [] });
    stubGraph(insightsRoute(({ params }) => (
      params.get('level') === 'campaign' ? { data: [] } : { data: [accountInsight] }
    )));

    const res = await get('/api/v1/meta-ads/analytics/overview?since=2026-10-01&until=2026-10-31');

    expect(res.status).toBe(200);
    const params = new URL(String(global.fetch.mock.calls[0][0])).searchParams;
    expect(params.get('time_range')).toBe(JSON.stringify({ since: '2026-10-01', until: '2026-10-31' }));
    // CRM query ran with UTC boundaries (exclusive upper bound).
    const where = prisma.lead.findMany.mock.calls[0][0].where;
    expect(where.organizationId).toBe(ORG);
    expect(where.createdAt.gte).toEqual(new Date('2026-10-01T00:00:00.000Z'));
    expect(where.createdAt.lt).toEqual(new Date('2026-11-01T00:00:00.000Z'));
  });
});

describe('Phase 6: conversion funnel and attribution gap', () => {
  test('builds the full funnel from CRM records and reports the gap honestly', async () => {
    admin();
    prisma.metaAdsSettings.findUnique.mockResolvedValue(storedRow());
    mockCrm();
    stubGraph(insightsRoute(() => ({ data: [accountInsight] })));

    const res = await get('/api/v1/meta-ads/analytics/conversions?datePreset=last_30d');

    expect(res.status).toBe(200);
    const d = res.body.data;

    expect(d.funnel).toEqual({
      totalLeadsInPeriod: 5,
      attributedLeads: 4,
      contacted: 3,
      qualified: 3,
      siteVisits: 2,
      quotations: 1,
      bookings: 2,
      completedBookings: 1,
      closedLeads: 0,
      bookingValue: 7500000,
    });

    // Costs — every division is null-safe.
    expect(d.costs.spend).toBe(1500.5);
    expect(d.costs.costPerLead).toBeCloseTo(1500.5 / 4, 5);
    expect(d.costs.costPerQualifiedLead).toBeCloseTo(1500.5 / 3, 5);
    expect(d.costs.costPerSiteVisit).toBeCloseTo(1500.5 / 2, 5);
    expect(d.costs.costPerBooking).toBeCloseTo(1500.5 / 2, 5);
    expect(d.costs.returnOnAdSpend).toBeCloseTo(7500000 / 1500.5, 5);
    expect(d.costs.netReturn).toBeCloseTo(7500000 - 1500.5, 5);

    // Attribution gap: Meta says 42 leads, CRM carries 4 attributed —
    // the 38 difference is reported, never invented away.
    expect(d.attribution).toEqual({
      metaReportedLeads: 42,
      crmAttributedLeads: 4,
      unattributedLeads: 38,
      crmBeyondMeta: 0,
      missingMetaAdId: 1,
      missingMetaAdsetId: 1,
    });

    expect(d.byCampaign).toEqual(expect.arrayContaining([
      expect.objectContaining({ campaignId: '9001', leads: 3, contacted: 2, qualified: 2 }),
      expect.objectContaining({ campaignId: '9002', leads: 1, contacted: 1, qualified: 1 }),
    ]));
    expect(d.notes.length).toBeGreaterThan(0);
    expect(JSON.stringify(res.body)).not.toContain('DB-TOKEN-SECRET');
  });

  test('empty cohort skips downstream queries and keeps every cost null', async () => {
    admin();
    prisma.metaAdsSettings.findUnique.mockResolvedValue(storedRow());
    mockCrm({ leads: [], siteVisits: 0, quotations: 0, bookings: [] });
    stubGraph(insightsRoute(() => ({ data: [{ ...accountInsight, actions: [{ action_type: 'leadgen', value: '5' }] }] })));

    const res = await get('/api/v1/meta-ads/analytics/conversions?datePreset=last_30d');

    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(d.funnel.attributedLeads).toBe(0);
    expect(d.costs.costPerLead).toBeNull();
    expect(d.costs.costPerQualifiedLead).toBeNull();
    expect(d.costs.costPerSiteVisit).toBeNull();
    expect(d.costs.costPerBooking).toBeNull();
    // Spend exists but no bookings → ROAS 0 is arithmetic, net is negative.
    expect(d.costs.returnOnAdSpend).toBe(0);
    expect(d.costs.netReturn).toBe(-1500.5);
    // No attributed leads → no downstream queries at all.
    expect(prisma.siteVisit.count).not.toHaveBeenCalled();
    expect(prisma.quotation.count).not.toHaveBeenCalled();
    expect(prisma.booking.findMany).not.toHaveBeenCalled();
    // Gap still reported: 5 Meta leads, 0 in CRM.
    expect(d.attribution).toMatchObject({ metaReportedLeads: 5, crmAttributedLeads: 0, unattributedLeads: 5, crmBeyondMeta: 0 });
  });
});

describe('Phase 6: performance by level + creative join', () => {
  const adInsights = [
    {
      ad_id: '8001', ad_name: 'Wave — Ad 1', adset_id: '9100', adset_name: 'Wave — Leads IN',
      campaign_id: '9001', campaign_name: 'Wave City Launch',
      spend: '600.00', impressions: '40000', reach: '35000', frequency: '1.14',
      clicks: '500', ctr: '1.25', cpc: '1.20', cpm: '15.00',
      actions: [{ action_type: 'leadgen', value: '20' }],
      date_start: '2026-10-15', date_stop: '2026-11-13', account_currency: 'INR',
    },
    {
      ad_id: '8002', ad_name: 'Wave — Ad 2', adset_id: '9100', adset_name: 'Wave — Leads IN',
      campaign_id: '9001', campaign_name: 'Wave City Launch',
      spend: '300.00', impressions: '20000', reach: '18000', frequency: '1.11',
      clicks: '200', ctr: '1.00', cpc: '1.50', cpm: '15.00',
      actions: [{ action_type: 'leadgen', value: '10' }],
      date_start: '2026-10-15', date_stop: '2026-11-13', account_currency: 'INR',
    },
  ];

  test('campaign level returns mapped rows with paging', async () => {
    admin();
    prisma.metaAdsSettings.findUnique.mockResolvedValue(storedRow());
    stubGraph(insightsRoute(() => ({ data: campaignInsights, paging: { cursors: { after: 'next' } } })));

    const res = await get('/api/v1/meta-ads/analytics/performance?datePreset=last_30d');

    expect(res.status).toBe(200);
    expect(res.body.data.level).toBe('campaign');
    expect(res.body.data.items).toHaveLength(2);
    expect(res.body.data.items[0]).toMatchObject({ campaignId: '9001', spend: 900, leads: 30 });
    expect(res.body.data.items[0].costPerLead).toBeCloseTo(30, 5);
    expect(res.body.data.paging).toMatchObject({ cursors: { after: 'next' } });
  });

  test('account level is accepted', async () => {
    admin();
    prisma.metaAdsSettings.findUnique.mockResolvedValue(storedRow());
    stubGraph(insightsRoute(() => ({ data: [accountInsight] })));

    const res = await get('/api/v1/meta-ads/analytics/performance?level=account&datePreset=last_30d');
    expect(res.status).toBe(200);
    expect(res.body.data.level).toBe('account');
    expect(res.body.data.items[0]).toMatchObject({ spend: 1500.5, leads: 42, campaignId: null });
  });

  test('ad level joins ads to creatives and groups creative performance', async () => {
    admin();
    prisma.metaAdsSettings.findUnique.mockResolvedValue(storedRow());
    stubGraph({
      insights: () => ({ data: adInsights }),
      ads: () => ({
        data: [
          { id: '8001', name: 'Wave — Ad 1', creative: { id: '5001' } },
          { id: '8002', name: 'Wave — Ad 2', creative: { id: '5001' } },
        ],
        summary: { total_count: 2 },
      }),
      adcreatives: () => ({
        data: [{ id: '5001', name: 'Wave City — Hero' }],
        summary: { total_count: 1 },
      }),
    });

    const res = await get('/api/v1/meta-ads/analytics/performance?level=ad&datePreset=last_30d');

    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(d.items).toHaveLength(2);
    expect(d.items[0]).toMatchObject({ adId: '8001', creativeId: '5001', creativeName: 'Wave City — Hero' });

    // Both ads share one creative → one grouped row with summed metrics.
    expect(d.creativePerformance).toHaveLength(1);
    expect(d.creativePerformance[0]).toMatchObject({
      creativeId: '5001', creativeName: 'Wave City — Hero', ads: 2,
      spend: 900, impressions: 60000, clicks: 700, leads: 30,
    });
    // Reach/frequency are deduplicated audience metrics — never summed.
    expect(d.creativePerformance[0].reach).toBeNull();
    expect(d.creativePerformance[0].frequency).toBeNull();
    expect(d.creativePerformance[0].costPerLead).toBeCloseTo(900 / 30, 5);

    expect(d.creativeJoin).toMatchObject({ requested: 2, joined: 2, unmatched: 0, unjoinedAds: 0 });
    expect(JSON.stringify(res.body)).not.toContain('DB-TOKEN-SECRET');
  });

  test('ads outside the bounded join window report no creative — never a guess', async () => {
    admin();
    prisma.metaAdsSettings.findUnique.mockResolvedValue(storedRow());
    stubGraph({
      insights: () => ({ data: [...adInsights, { ...adInsights[0], ad_id: '8003', ad_name: 'Wave — Ad 3' }] }),
      ads: () => ({ data: [{ id: '8001', creative: { id: '5001' } }], summary: { total_count: 1 } }),
      adcreatives: () => ({ data: [{ id: '5001', name: 'Wave City — Hero' }], summary: { total_count: 1 } }),
    });

    const res = await get('/api/v1/meta-ads/analytics/performance?level=ad&datePreset=last_30d');

    expect(res.status).toBe(200);
    const d = res.body.data;
    const unmatched = d.items.find((row) => row.adId === '8003');
    expect(unmatched.creativeId).toBeNull();
    expect(unmatched.creativeName).toBeNull();
    expect(d.creativeJoin).toMatchObject({ requested: 3, joined: 1, unmatched: 2, unjoinedAds: 2 });
    expect(d.creativeJoin.note).toContain('first 100 ads');
  });
});

describe('Phase 6: recommendations are advisory only', () => {
  test('flags spend-without-leads and repeats the never-automated disclaimer', async () => {
    admin();
    prisma.metaAdsSettings.findUnique.mockResolvedValue(storedRow());
    stubGraph(insightsRoute(({ params }) => {
      const level = params.get('level');
      if (level === 'campaign') {
        return {
          data: [
            { ...campaignInsights[0], spend: '500.00', actions: [] },
            campaignInsights[1],
          ],
        };
      }
      if (level === 'ad') return { data: [] };
      return { data: [accountInsight] };
    }));

    const res = await get('/api/v1/meta-ads/analytics/recommendations?datePreset=last_30d');

    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(d.automated).toBe(false);
    expect(d.disclaimer).toContain('never changes budgets');
    expect(d.adAccountId).toBe('999000');

    const spendNoLeads = d.items.find((i) => i.type === 'SPEND_WITHOUT_LEADS');
    expect(spendNoLeads).toMatchObject({ scope: 'campaign', severity: 'warning', automated: false });
    expect(spendNoLeads.message).toContain('Wave City Launch');
    expect(spendNoLeads.recommendation).toContain('pause');

    for (const item of d.items) expect(item.automated).toBe(false);
    expect(d.sample).toEqual({ campaigns: 2, creatives: 0 });
    expect(JSON.stringify(res.body)).not.toContain('DB-TOKEN-SECRET');
  });

  test('reports insufficient data instead of inventing comparisons', async () => {
    admin();
    prisma.metaAdsSettings.findUnique.mockResolvedValue(storedRow());
    stubGraph(insightsRoute(({ params }) => {
      const level = params.get('level');
      if (level === 'campaign') return { data: [{ ...campaignInsights[0], spend: '500.00', actions: [{ action_type: 'leadgen', value: '10' }] }] };
      if (level === 'ad') return { data: [] };
      return { data: [accountInsight] };
    }));

    const res = await get('/api/v1/meta-ads/analytics/recommendations?datePreset=last_30d');

    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(d.insufficientData).toBe(true);
    // Comparative rules stay silent with one campaign; only absolute rules apply.
    expect(d.items.find((i) => i.type === 'ABOVE_MEDIAN_COST_PER_LEAD')).toBeUndefined();
    expect(d.automated).toBe(false);
  });

  test('analytics is strictly read-only: GET calls only, no audit rows, no writes', async () => {
    admin();
    prisma.metaAdsSettings.findUnique.mockResolvedValue(storedRow());
    mockCrm();
    stubGraph(insightsRoute(({ params }) => {
      const level = params.get('level');
      if (level === 'campaign') return { data: campaignInsights };
      if (level === 'ad') return { data: [] };
      return { data: [accountInsight] };
    }));

    await get('/api/v1/meta-ads/analytics/overview?datePreset=last_30d');
    await get('/api/v1/meta-ads/analytics/conversions?datePreset=last_30d');
    await get('/api/v1/meta-ads/analytics/performance?datePreset=last_30d');
    await get('/api/v1/meta-ads/analytics/recommendations?datePreset=last_30d');

    expect(global.fetch.mock.calls.length).toBeGreaterThan(0);
    for (const [, init] of global.fetch.mock.calls) {
      expect(init.method || 'GET').toBe('GET');
    }
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
    // CRM access is read-only.
    expect(prisma.lead.create).not.toHaveBeenCalled();
    expect(prisma.lead.update).not.toHaveBeenCalled();
  });
});

describe('Phase 6: recommendation engine (pure functions)', () => {
  const engine = require('../src/services/metaAnalyticsService').buildRecommendations;
  const median = require('../src/services/metaAnalyticsService').median;

  const campaigns = [
    { campaignId: '1', campaignName: 'Cheap winner', spend: 300, leads: 10, costPerLead: 30, ctr: 3.0, clicks: 300, impressions: 10000 },
    { campaignId: '2', campaignName: 'Average', spend: 500, leads: 5, costPerLead: 100, ctr: 1.5, clicks: 150, impressions: 10000 },
    { campaignId: '3', campaignName: 'Expensive', spend: 800, leads: 2, costPerLead: 400, ctr: 0.4, clicks: 40, impressions: 10000 },
  ];

  test('median handles odd, even and empty samples', () => {
    expect(median([1, 2, 3])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([])).toBeNull();
    expect(median([NaN, 2, Infinity].filter(Number.isFinite))).toBe(2);
    expect(median(null)).toBeNull();
  });

  test('flags expensive and low-engagement campaigns, praises the efficient one', () => {
    const result = engine({ campaigns }, { currency: 'INR' });

    const types = result.items.map((i) => i.type);
    expect(types).toContain('ABOVE_MEDIAN_COST_PER_LEAD');
    expect(types).toContain('LOW_ENGAGEMENT');
    expect(types).toContain('BUDGET_INCREASE_CANDIDATE');

    const expensive = result.items.find((i) => i.type === 'ABOVE_MEDIAN_COST_PER_LEAD');
    expect(expensive.scopeName).toBe('Expensive');
    expect(expensive.severity).toBe('warning');
    expect(expensive.benchmark.medianCostPerLead).toBe(100);
    expect(expensive.recommendation).toContain('audience');

    const winner = result.items.find((i) => i.type === 'BUDGET_INCREASE_CANDIDATE');
    expect(winner.scopeName).toBe('Cheap winner');
    expect(winner.severity).toBe('opportunity');
    // Advisory wording — the engine never claims it will act.
    expect(winner.recommendation).toContain('nothing is changed automatically');

    // Warnings sort before opportunities; everything is advisory.
    const firstOpportunity = result.items.findIndex((i) => i.severity === 'opportunity');
    const lastWarning = result.items.map((i) => i.severity).lastIndexOf('warning');
    expect(firstOpportunity).toBeGreaterThan(lastWarning);
    expect(result.items.every((i) => i.automated === false)).toBe(true);
    expect(result.automated).toBe(false);
    expect(result.insufficientData).toBe(false);
    expect(result.benchmarks.medianCostPerLead).toBe(100);
  });

  test('absolute rule (spend, zero leads) applies even with a single campaign', () => {
    const result = engine({
      campaigns: [{ campaignId: '9', campaignName: 'Lone ad', spend: 750, leads: 0, costPerLead: null, ctr: 1.0, clicks: 10, impressions: 1000 }],
    });
    expect(result.insufficientData).toBe(true);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({ type: 'SPEND_WITHOUT_LEADS', severity: 'warning' });
    expect(result.items[0].message).toContain('750');
    expect(result.items[0].observed).toMatchObject({ spend: 750, leads: 0 });
  });

  test('comparative rules stay silent below the minimum sample — no fake benchmarks', () => {
    const result = engine({
      campaigns: [
        { campaignId: '1', campaignName: 'A', spend: 900, leads: 1, costPerLead: 900, ctr: 0.1, clicks: 1, impressions: 1000 },
        { campaignId: '2', campaignName: 'B', spend: 100, leads: 10, costPerLead: 10, ctr: 3.0, clicks: 30, impressions: 1000 },
      ].slice(0, 1),
    });
    const comparative = result.items.filter((i) => i.type !== 'SPEND_WITHOUT_LEADS');
    expect(comparative).toHaveLength(0);
    // One sample → comparisons flagged untrustworthy regardless of the
    // single-value median that happens to be computable.
    expect(result.insufficientData).toBe(true);
  });

  test('creative rules highlight winners and losers against the creative median', () => {
    const result = engine({
      campaigns: [],
      creatives: [
        { creativeId: '5001', creativeName: 'Hero', spend: 200, ctr: 4.0, leads: 5, costPerLead: 40 },
        { creativeId: '5002', creativeName: 'Old banner', spend: 300, ctr: 0.3, leads: 1, costPerLead: 300 },
      ],
    });

    const high = result.items.find((i) => i.type === 'HIGH_PERFORMING_CREATIVE');
    expect(high).toMatchObject({ scope: 'creative', scopeName: 'Hero', severity: 'opportunity' });
    expect(high.recommendation).toContain('reusing');

    const low = result.items.find((i) => i.type === 'LOW_PERFORMING_CREATIVE');
    expect(low).toMatchObject({ scopeName: 'Old banner', severity: 'warning' });
    expect(low.message).toContain('Old banner');
  });
});

describe('Phase 6: validation and RBAC', () => {
  test('date range rules reject missing, combined and inverted ranges before Meta', async () => {
    admin();
    const spy = fetchSpy();

    const badPaths = [
      '/api/v1/meta-ads/analytics/overview',                                  // no range at all
      '/api/v1/meta-ads/analytics/overview?datePreset=last_30d&since=2026-10-01', // preset + since
      '/api/v1/meta-ads/analytics/overview?since=2026-10-01',                 // until missing
      '/api/v1/meta-ads/analytics/overview?since=2026-11-01&until=2026-10-01', // inverted
      '/api/v1/meta-ads/analytics/performance?datePreset=last_30d&level=not_a_level',
      '/api/v1/meta-ads/analytics/conversions?datePreset=not_a_preset',
    ];
    for (const path of badPaths) {
      const res = await get(path);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    }
    expect(spy).not.toHaveBeenCalled();
  });

  test('analytics reads need marketing:view only; no marketing permission is denied', async () => {
    // SALES_MANAGER has marketing:view — analytics is a read like reporting.
    manager();
    prisma.metaAdsSettings.findUnique.mockResolvedValue(storedRow());
    mockCrm({ leads: [] });
    stubGraph(insightsRoute(({ params }) => (
      params.get('level') === 'campaign' ? { data: [] } : { data: [accountInsight] }
    )));

    const asManager = await get('/api/v1/meta-ads/analytics/overview?datePreset=last_30d', 'spaceezy_session=manager-token');
    expect(asManager.status).toBe(200);

    // SALES_EXECUTIVE has no marketing permission at all.
    exec();
    global.fetch.mockClear();
    const spy = fetchSpy();
    const paths = [
      '/api/v1/meta-ads/analytics/overview?datePreset=last_30d',
      '/api/v1/meta-ads/analytics/conversions?datePreset=last_30d',
      '/api/v1/meta-ads/analytics/performance?datePreset=last_30d',
      '/api/v1/meta-ads/analytics/recommendations?datePreset=last_30d',
    ];
    for (const path of paths) {
      const res = await get(path, 'spaceezy_session=exec-token');
      expect(res.status).toBe(403);
    }
    expect(spy).not.toHaveBeenCalled();
  });
});
