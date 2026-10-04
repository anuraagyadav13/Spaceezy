const PipelineService = require('../src/services/pipelineService');
const prisma = require('../src/db/prisma');

jest.mock('../src/db/prisma', () => ({
  $transaction: jest.fn(),
  lead: {
    groupBy: jest.fn(),
    findMany: jest.fn(),
    aggregate: jest.fn(),
  },
  leadActivity: { findMany: jest.fn() },
  quotation: { findMany: jest.fn() },
  booking: { aggregate: jest.fn() },
}));

const ORG = 'org-1';
const USER = 'user-1';

function mockGroupBy(statusCounts = [], prevStatusCounts = [], sourceCounts = []) {
  let statusCalls = 0;
  prisma.lead.groupBy.mockImplementation(({ by }) => {
    if (by[0] === 'source') return Promise.resolve(sourceCounts);
    return Promise.resolve(statusCalls++ === 0 ? statusCounts : prevStatusCounts);
  });
}

function mockLeadFindMany({ trendLeads = [], columnLeads = [], recentLeads = [] } = {}) {
  prisma.lead.findMany.mockImplementation(({ select, take } = {}) => {
    if (take === 10) return Promise.resolve(recentLeads);
    if (select && select.createdAt) return Promise.resolve(trendLeads);
    return Promise.resolve(columnLeads);
  });
}

function mockActivityFindMany({ statusChanges = [], recent = [] } = {}) {
  prisma.leadActivity.findMany.mockImplementation(({ select } = {}) => {
    if (select && select.createdAt) return Promise.resolve(statusChanges);
    return Promise.resolve(recent);
  });
}

function mockRest() {
  prisma.lead.aggregate.mockResolvedValue({ _sum: { budget: 0 } });
  prisma.quotation.findMany.mockResolvedValue([]);
  prisma.booking.aggregate.mockResolvedValue({ _sum: { amount: 0 } });
}

describe('PipelineService.getPipelineDashboard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGroupBy();
    mockLeadFindMany();
    mockActivityFindMany();
    mockRest();
  });

  it('builds summary counts per stage group from status groupBy', async () => {
    mockGroupBy(
      [{ status: 'NEW', _count: { _all: 5 } }, { status: 'CONTACTED', _count: { _all: 3 } }, { status: 'SITE_VISIT', _count: { _all: 2 } }],
      [{ status: 'NEW', _count: { _all: 4 } }, { status: 'CONTACTED', _count: { _all: 2 } }],
      [{ source: 'Website', _count: { _all: 10 } }]
    );

    const result = await PipelineService.getPipelineDashboard(ORG, {}, 'ADMIN', USER);

    expect(result.summary.new.count).toBe(5);
    expect(result.summary.contacted.count).toBe(3);
    expect(result.summary.siteVisit.count).toBe(2);
    expect(result.summary.new.prevCount).toBe(4);
    expect(result.summary.new.deltaPct).toBe(25);
    expect(result.summary.total.count).toBe(10);
    expect(result.pipeline).toHaveLength(6);
    expect(result.trends.length).toBeGreaterThan(0);
    expect(result.sources).toEqual([{ source: 'Website', count: 10, pct: 100 }]);
    expect(result.recentActivities).toEqual([]);
    expect(result.recentLeads).toEqual([]);
  });

  it('maps legacy statuses to their stage group', async () => {
    mockGroupBy(
      [{ status: 'INTERESTED', _count: { _all: 2 } }, { status: 'NEGOTIATION', _count: { _all: 1 } }, { status: 'BOOKED', _count: { _all: 4 } }],
      []
    );

    const result = await PipelineService.getPipelineDashboard(ORG, {}, 'ADMIN', USER);

    expect(result.summary.followUp.count).toBe(2);
    expect(result.summary.quotation.count).toBe(1);
    expect(result.summary.booking.count).toBe(4);
    expect(result.summary.new.count).toBe(0);
  });

  it('scopes pipeline to executive own leads and includes organizationId', async () => {
    await PipelineService.getPipelineDashboard(ORG, {}, 'SALES_EXECUTIVE', USER);

    expect(prisma.lead.groupBy).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ organizationId: ORG, assignedToId: USER })
    }));
    expect(prisma.lead.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ organizationId: ORG, assignedToId: USER })
    }));
  });

  it('column count comes from status counts, not just the top-5 leads', async () => {
    mockGroupBy([{ status: 'NEW', _count: { _all: 42 } }], []);

    const result = await PipelineService.getPipelineDashboard(ORG, {}, 'ADMIN', USER);

    const newCol = result.pipeline.find(p => p.stage === 'NEW');
    expect(newCol.count).toBe(42);
    expect(newCol.leads).toEqual([]);
  });

  it('computes QUOTATION value from latest quotation per lead', async () => {
    prisma.quotation.findMany.mockResolvedValue([
      { leadId: 'l1', totalAmount: 1000000, createdAt: new Date('2026-09-28') },
      { leadId: 'l1', totalAmount: 1200000, createdAt: new Date('2026-10-01') },
      { leadId: 'l2', totalAmount: 1300000, createdAt: new Date('2026-09-30') }
    ]);

    const result = await PipelineService.getPipelineDashboard(ORG, {}, 'ADMIN', USER);

    const quotationCol = result.pipeline.find(p => p.stage === 'QUOTATION');
    expect(quotationCol.value).toBe(2500000);
    expect(prisma.quotation.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        organizationId: ORG,
        lead: { is: expect.objectContaining({ organizationId: ORG, status: { in: ['QUOTATION', 'NEGOTIATION'] } }) }
      })
    }));
  });

  it('computes BOOKING value from non-cancelled bookings of scoped leads', async () => {
    prisma.booking.aggregate.mockResolvedValue({ _sum: { amount: 5000000 } });

    const result = await PipelineService.getPipelineDashboard(ORG, {}, 'ADMIN', USER);

    const bookingCol = result.pipeline.find(p => p.stage === 'BOOKING');
    expect(bookingCol.value).toBe(5000000);
    expect(prisma.booking.aggregate).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        organizationId: ORG,
        paymentStatus: { not: 'CANCELLED' },
        lead: { is: expect.objectContaining({ organizationId: ORG, status: { in: ['BOOKED'] } }) }
      })
    }));
  });

  it('computes early-stage value from scoped lead budget sum', async () => {
    prisma.lead.aggregate.mockResolvedValue({ _sum: { budget: 12000000 } });

    const result = await PipelineService.getPipelineDashboard(ORG, {}, 'ADMIN', USER);

    const newCol = result.pipeline.find(p => p.stage === 'NEW');
    expect(newCol.value).toBe(12000000);
    expect(prisma.lead.aggregate).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ organizationId: ORG, status: { in: ['NEW'] } })
    }));
  });

  it('builds source analytics with percentages', async () => {
    mockGroupBy([], [], [{ source: 'Website', _count: { _all: 3 } }, { source: 'Referral', _count: { _all: 1 } }]);

    const result = await PipelineService.getPipelineDashboard(ORG, {}, 'ADMIN', USER);

    expect(result.sources).toEqual([
      { source: 'Website', count: 3, pct: 75 },
      { source: 'Referral', count: 1, pct: 25 }
    ]);
  });

  it('builds trend buckets from new-lead and status-change series', async () => {
    const today = new Date().toISOString().slice(0, 10);
    mockLeadFindMany({ trendLeads: [{ createdAt: new Date() }, { createdAt: new Date() }] });
    mockActivityFindMany({
      statusChanges: [
        { createdAt: new Date(), metadata: { to: 'CONTACTED' } },
        { createdAt: new Date(), metadata: { to: 'CONTACTED' } },
        { createdAt: new Date(), metadata: { to: 'CONTACTED' } },
        { createdAt: new Date(), metadata: { to: 'BOOKED' } },
        { createdAt: new Date(), metadata: { to: 'LOST' } }
      ]
    });

    const result = await PipelineService.getPipelineDashboard(ORG, {}, 'ADMIN', USER);

    const bucket = result.trends.find(t => t.date === today);
    expect(bucket).toBeDefined();
    expect(bucket.new).toBe(2);
    expect(bucket.contacted).toBe(3);
    expect(bucket.booking).toBe(1);
    expect(bucket.siteVisit).toBe(0);
    expect(result.trends.every(t => typeof t.date === 'string')).toBe(true);
  });

  it('applies date filters to scope on every query', async () => {
    await PipelineService.getPipelineDashboard(ORG, { from: '2026-09-01', to: '2026-10-01', projectId: 'p1', source: 'Website' }, 'ADMIN', USER);

    const expectedWhere = expect.objectContaining({
      organizationId: ORG,
      projectId: 'p1',
      source: 'Website',
      createdAt: { gte: new Date('2026-09-01'), lt: new Date('2026-10-01') }
    });

    expect(prisma.lead.groupBy).toHaveBeenCalledWith(expect.objectContaining({ where: expectedWhere }));
    expect(prisma.lead.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expectedWhere }));
    expect(prisma.leadActivity.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ lead: { is: expectedWhere } })
    }));
  });

  it('filters status-change trend rows by lead scope', async () => {
    await PipelineService.getPipelineDashboard(ORG, { assignedTo: 'exec-1' }, 'ADMIN', USER);

    expect(prisma.leadActivity.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        type: 'STATUS_CHANGE',
        lead: { is: expect.objectContaining({ organizationId: ORG, assignedToId: 'exec-1' }) }
      })
    }));
  });
});
