const { graphRequest } = require('./metaGraph');
const MetaAdsService = require('./metaAdsService');
const MetaCreativeService = require('./metaCreativeService');
const prisma = require('../db/prisma');

// ---------------------------------------------------------------------------
// Phase 6 — Analytics, CRM attribution and optimization recommendations.
//
// Contract and safety rules:
// - READ-ONLY: this service never writes to Meta (no mutation endpoints are
//   reachable from analytics) and never writes to the DB. Meta stays the
//   source of truth for spend/delivery metrics; the CRM (Lead/SiteVisit/
//   Quotation/Booking — existing tables, NO new persistence) is the source
//   of truth for funnel metrics. There is no local metrics history table:
//   every request queries live Insights + current CRM state.
// - Metrics: full documented Insights metric set (spend, impressions,
//   reach, frequency, clicks, ctr, cpc, cpm, actions, account_currency).
//   Insights has NO creative level — creative performance is ad-level
//   insights joined to the ad→creative mapping (best-effort, documented
//   coverage; unmatched ads are reported, never guessed).
// - Attribution joins on Lead.metaCampaignId / metaAdsetId / metaAdId
//   (indexed). Downstream funnel records (SiteVisit/Quotation/Booking via
//   leadId) are counted COHORT-style: records linked to leads created in
//   the selected period that carry Meta attribution.
// - Costs are null when a denominator is zero — never Infinity, never a
//   fabricated number. Missing attribution is surfaced as counts
//   (unattributedLeads, missingMetaAdId), never silently absorbed.
// - Recommendations are ADVISORY ONLY (pure functions below): nothing in
//   this file can change budgets, targeting, bids, status or spend — no
//   write call exists here at all.
// ---------------------------------------------------------------------------

// Insights metrics verified against the adaccount insights reference.
const METRIC_FIELDS = 'spend,impressions,reach,frequency,clicks,ctr,cpc,cpm,actions,action_values,cost_per_result,date_start,date_stop,account_currency';

function levelFields(level) {
    switch (level) {
        case 'campaign': return 'campaign_id,campaign_name,';
        case 'adset': return 'adset_id,adset_name,campaign_id,campaign_name,';
        case 'ad': return 'ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,';
        default: return ''; // account level: no id columns
    }
}

const numOrNull = (value) => {
    if (value === undefined || value === null || value === '') return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
};

// Onsite Instant Form conversions (our attribution source — leads sync into
// the CRM with meta* fields). Other action types are deliberately NOT
// summed into "leads": mixing attribution systems would fabricate numbers.
const sumAction = (actions, type) => {
    if (!Array.isArray(actions)) return 0;
    return actions.reduce((sum, entry) => {
        if (!entry || entry.action_type !== type) return sum;
        const value = Number(entry.value);
        return sum + (Number.isFinite(value) ? value : 0);
    }, 0);
};

// Derived metrics — recomputed ONLY from known inputs; zero denominators
// and unknown (null) inputs yield null.
function deriveMetrics({ spend = null, impressions = null, clicks = null, leads = null } = {}) {
    return {
        ctr: impressions !== null && impressions > 0 && clicks !== null ? (clicks / impressions) * 100 : null,
        cpc: clicks !== null && clicks > 0 && spend !== null ? spend / clicks : null,
        cpm: impressions !== null && impressions > 0 && spend !== null ? (spend / impressions) * 1000 : null,
        costPerLead: leads !== null && leads > 0 && spend !== null ? spend / leads : null,
    };
}

const mapInsightRow = (row) => {
    const spend = numOrNull(row.spend);
    const impressions = numOrNull(row.impressions);
    const clicks = numOrNull(row.clicks);
    const leads = sumAction(row.actions, 'leadgen');
    return {
        campaignId: row.campaign_id || null,
        campaignName: row.campaign_name || null,
        adsetId: row.adset_id || null,
        adsetName: row.adset_name || null,
        adId: row.ad_id || null,
        adName: row.ad_name || null,
        spend,
        impressions,
        reach: numOrNull(row.reach),
        frequency: numOrNull(row.frequency),
        clicks,
        ctr: numOrNull(row.ctr),
        cpc: numOrNull(row.cpc),
        cpm: numOrNull(row.cpm),
        leads,
        costPerLead: spend !== null && leads > 0 ? spend / leads : null,
        accountCurrency: row.account_currency || null,
        dateStart: row.date_start || null,
        dateStop: row.date_stop || null,
    };
};

// date_preset passthrough (Meta computes it in the account timezone) or an
// explicit time_range — same rule as the existing insights endpoint.
function buildRangeParams({ datePreset, since, until } = {}) {
    if (datePreset) return { date_preset: datePreset };
    return { time_range: JSON.stringify({ since, until }) };
}

async function conn(organizationId, adAccountId) {
    const eff = await MetaAdsService.effectiveConfig(organizationId);
    const token = MetaAdsService.requireToken(eff);
    const accountId = MetaAdsService.requireAdAccount(eff, adAccountId);
    return { eff, token, accountId };
}

async function insightsRows({ token, version, accountId, level = 'account', range = {}, limit = 50, after } = {}) {
    const params = {
        fields: levelFields(level) + METRIC_FIELDS,
        level,
        limit: Math.min(Math.max(parseInt(limit, 10) || 50, 1), 500),
        ...(after ? { after } : {}),
        ...buildRangeParams(range),
    };
    const data = await graphRequest({ path: `act_${accountId}/insights`, params, token, version });
    return {
        rows: Array.isArray(data.data) ? data.data.map(mapInsightRow) : [],
        paging: data.paging || null,
    };
}

// ---------------------------------------------------------------------------
// CRM side. Dates: since/until are inclusive YYYY-MM-DD (the validator
// pairs them); boundaries are UTC midnights with an exclusive upper bound
// (until covers its whole day). datePreset values are converted to a date
// range locally for the CRM queries — Meta's own preset (account timezone)
// and this UTC conversion can differ by a day near boundaries; documented
// as a known approximation in the docs.
// ---------------------------------------------------------------------------

const iso = (date) => date.toISOString().slice(0, 10);
const DAY_MS = 86400000;

function presetToRange(datePreset, now = new Date()) {
    if (!datePreset) return null;
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const y = today.getUTCFullYear();
    const m = today.getUTCMonth();
    const shift = (days) => iso(new Date(today.getTime() - days * DAY_MS));
    switch (datePreset) {
        case 'today': return { since: iso(today), until: iso(today) };
        case 'yesterday': return { since: shift(1), until: shift(1) };
        case 'last_7d': return { since: shift(6), until: iso(today) };
        case 'last_14d': return { since: shift(13), until: iso(today) };
        case 'last_30d': return { since: shift(29), until: iso(today) };
        case 'last_90d': return { since: shift(89), until: iso(today) };
        case 'this_month': return { since: iso(new Date(Date.UTC(y, m, 1))), until: iso(today) };
        case 'last_month': return {
            since: iso(new Date(Date.UTC(y, m - 1, 1))),
            until: iso(new Date(Date.UTC(y, m, 0))),
        };
        case 'this_quarter': {
            const quarterStartMonth = Math.floor(m / 3) * 3;
            return { since: iso(new Date(Date.UTC(y, quarterStartMonth, 1))), until: iso(today) };
        }
        case 'last_year': return { since: `${y - 1}-01-01`, until: `${y - 1}-12-31` };
        case 'lifetime': return null; // no CRM date filter
        default: return null;
    }
}

function resolveCrmRange({ datePreset, since, until } = {}) {
    if (since && until) return { since, until };
    return presetToRange(datePreset);
}

function prismaTimeRange(range) {
    if (!range || !range.since || !range.until) return null;
    return {
        gte: new Date(`${range.since}T00:00:00.000Z`),
        lt: new Date(Date.parse(`${range.until}T00:00:00.000Z`) + DAY_MS),
    };
}

const QUALIFIED_STATUSES = ['QUALIFIED', 'SITE_VISIT', 'QUOTATION', 'NEGOTIATION', 'BOOKED', 'CLOSED'];

// All leads created in the period + the Meta-attributed cohort. One query,
// counted in JS so every funnel number and per-campaign breakdown shares
// exactly the same lead set (no drifting definitions between endpoints).
async function fetchLeadCohort({ organizationId, range }) {
    const timeRange = prismaTimeRange(range);
    const leads = await prisma.lead.findMany({
        where: {
            organizationId,
            ...(timeRange ? { createdAt: timeRange } : {}),
        },
        select: {
            id: true,
            status: true,
            metaCampaignId: true,
            metaCampaignName: true,
            metaAdsetId: true,
            metaAdId: true,
        },
    });
    const rows = Array.isArray(leads) ? leads : [];
    const attributed = rows.filter((lead) => lead && lead.metaCampaignId);

    const byCampaign = new Map();
    for (const lead of attributed) {
        const key = lead.metaCampaignId;
        if (!byCampaign.has(key)) {
            byCampaign.set(key, {
                campaignId: key,
                campaignName: lead.metaCampaignName || null,
                leads: 0,
                contacted: 0,
                qualified: 0,
            });
        }
        const bucket = byCampaign.get(key);
        bucket.leads += 1;
        if (lead.status && lead.status !== 'NEW') bucket.contacted += 1;
        if (lead.status && QUALIFIED_STATUSES.includes(lead.status)) bucket.qualified += 1;
    }

    return {
        totalLeadsInPeriod: rows.length,
        attributed,
        attributedLeads: attributed.length,
        contacted: attributed.filter((l) => l.status && l.status !== 'NEW').length,
        qualified: attributed.filter((l) => l.status && QUALIFIED_STATUSES.includes(l.status)).length,
        closedLeads: attributed.filter((l) => l.status === 'CLOSED').length,
        missingMetaAdId: attributed.filter((l) => !l.metaAdId).length,
        missingMetaAdsetId: attributed.filter((l) => !l.metaAdsetId).length,
        byCampaign: [...byCampaign.values()],
    };
}

// Downstream CRM records linked to the attributed cohort (cohort view).
// Skipped entirely when the cohort is empty (zero denominators → null costs
// downstream; no pointless queries).
async function fetchDownstream({ organizationId, attributedIds }) {
    const zero = { siteVisits: 0, quotations: 0, bookings: [], bookingValue: 0, completedBookings: 0 };
    if (attributedIds.length === 0) return zero;
    const inIds = { in: attributedIds };
    const [siteVisits, quotations, bookings] = await Promise.all([
        prisma.siteVisit.count({ where: { organizationId, leadId: inIds } }),
        prisma.quotation.count({ where: { organizationId, leadId: inIds } }),
        prisma.booking.findMany({
            where: { organizationId, leadId: inIds },
            select: { id: true, amount: true, paymentStatus: true },
        }),
    ]);
    const bookingRows = Array.isArray(bookings) ? bookings : [];
    const bookingValue = bookingRows.reduce((sum, b) => {
        const amount = Number(b && b.amount);
        return sum + (Number.isFinite(amount) ? amount : 0);
    }, 0);
    return {
        siteVisits: siteVisits || 0,
        quotations: quotations || 0,
        bookings: bookingRows.length,
        bookingRows,
        bookingValue,
        completedBookings: bookingRows.filter((b) => b && b.paymentStatus === 'COMPLETED').length,
    };
}

// ---------------------------------------------------------------------------
// Creative mapping for ad-level rows (Insights has no creative level).
// Best-effort bounded join: ONE first page of the ad library + ONE first
// page of the creative library (100 each). Ads/creatives outside those
// pages come back with creativeId: null and an explicit coverage report —
// never a guessed mapping.
// ---------------------------------------------------------------------------

async function resolveCreativeJoin({ organizationId, adAccountId, adIds }) {
    const wanted = [...new Set((adIds || []).filter(Boolean))];
    const join = new Map();
    const coverage = {
        requested: wanted.length,
        adsFetched: 0,
        creativesFetched: 0,
        joined: 0,
        unmatched: wanted.length,
        note: 'Ad→creative mapping covers the first 100 ads and creatives of the ad library; rows outside that window report no creative.',
    };
    if (wanted.length === 0) return { join, coverage };

    let ads = [];
    let creatives = [];
    let adsError = null;
    let creativesError = null;
    try {
        const res = await MetaCreativeService.listAds({ organizationId, adAccountId, limit: 100 });
        ads = res.items || [];
    } catch (err) {
        adsError = (err && err.message) || 'ad list unavailable';
    }
    try {
        const res = await MetaCreativeService.listCreatives({ organizationId, adAccountId, limit: 100 });
        creatives = res.items || [];
    } catch (err) {
        creativesError = (err && err.message) || 'creative list unavailable';
    }

    const creativeNames = new Map();
    for (const creative of creatives) {
        if (creative && creative.id) creativeNames.set(creative.id, creative.name || null);
    }
    const adToCreative = new Map();
    for (const ad of ads) {
        if (ad && ad.id && ad.creativeId) adToCreative.set(ad.id, ad.creativeId);
    }

    let joined = 0;
    for (const adId of wanted) {
        const creativeId = adToCreative.get(adId) || null;
        if (creativeId) joined += 1;
        join.set(adId, {
            creativeId,
            creativeName: creativeId ? (creativeNames.get(creativeId) || null) : null,
        });
    }
    coverage.adsFetched = ads.length;
    coverage.creativesFetched = creatives.length;
    coverage.joined = joined;
    coverage.unmatched = wanted.length - joined;
    if (adsError) coverage.note = `Ad library unavailable for the creative mapping (${adsError}) — ad rows report no creative.`;
    else if (creativesError) coverage.note = `Creative library unavailable for names (${creativesError}) — creative ids are shown without names.`;
    return { join, coverage };
}

// Aggregate ad-level rows per creative. Reach/frequency are NOT summed
// across ads (they are deduplicated audience metrics) — they stay null in
// groups rather than being fabricated as totals.
function groupAdsByCreative(adRows, join) {
    const groups = new Map();
    let unjoinedAds = 0;
    for (const row of adRows) {
        const meta = row.adId ? join.get(row.adId) : null;
        const creativeId = meta ? meta.creativeId : null;
        if (!creativeId) {
            unjoinedAds += 1;
            continue;
        }
        if (!groups.has(creativeId)) {
            groups.set(creativeId, {
                creativeId,
                creativeName: (meta && meta.creativeName) || null,
                spend: null,
                impressions: null,
                clicks: null,
                leads: null,
                _spend: 0,
                _impressions: 0,
                _clicks: 0,
                _leads: 0,
                _known: { spend: false, impressions: false, clicks: false, leads: false },
                ads: 0,
            });
        }
        const group = groups.get(creativeId);
        group.ads += 1;
        const accumulate = (key, value) => {
            if (value !== null) {
                group._known[key] = true;
                group[`_${key}`] += value;
            }
        };
        accumulate('spend', row.spend);
        accumulate('impressions', row.impressions);
        accumulate('clicks', row.clicks);
        accumulate('leads', row.leads !== null && row.leads !== undefined ? row.leads : null);
    }
    const items = [...groups.values()].map((group) => {
        const spend = group._known.spend ? group._spend : null;
        const impressions = group._known.impressions ? group._impressions : null;
        const clicks = group._known.clicks ? group._clicks : null;
        const leads = group._known.leads ? group._leads : null;
        return {
            creativeId: group.creativeId,
            creativeName: group.creativeName,
            ads: group.ads,
            spend,
            impressions,
            clicks,
            leads,
            reach: null,
            frequency: null,
            ctr: null,
            cpc: null,
            cpm: null,
            costPerLead: null,
            ...deriveMetrics({ spend, impressions, clicks, leads }),
        };
    });
    return { items, unjoinedAds };
}

// ---------------------------------------------------------------------------
// Recommendation engine — PURE FUNCTIONS (unit-tested, no I/O, no side
// effects). Comparative rules need a minimum sample and a median baseline;
// absolute rules (spend with zero leads) always apply. Output items are
// advisory text with observed vs benchmark numbers — nothing here can act.
// ---------------------------------------------------------------------------

const ADVISORY_DISCLAIMER = 'Advisory only — SpaceEzy never changes budgets, targeting, bids, status or spend automatically. Review each suggestion, then act manually here or in Meta Ads Manager.';

function median(values) {
    const nums = (values || [])
        .filter((v) => typeof v === 'number' && Number.isFinite(v))
        .sort((a, b) => a - b);
    if (nums.length === 0) return null;
    const mid = Math.floor(nums.length / 2);
    return nums.length % 2 === 1 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2;
}

const round = (value, digits = 2) => {
    if (value === null || value === undefined || !Number.isFinite(Number(value))) return null;
    const factor = 10 ** digits;
    return Math.round(Number(value) * factor) / factor;
};

const money = (value, currency) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return '—';
    const rounded = n.toLocaleString('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 0 });
    return currency ? `${rounded} ${currency}` : rounded;
};

function buildRecommendations({ campaigns = [], creatives = [] } = {}, options = {}) {
    const opts = {
        minSampleForComparison: 2,
        cplWarningFactor: 1.5,
        ctrWarningFactor: 0.5,
        strongCostFactor: 0.7,
        strongCtrFactor: 1.5,
        currency: null,
        ...options,
    };
    const items = [];

    const medianSpend = median(campaigns.map((c) => c.spend).filter((v) => (v ?? 0) > 0));
    const cplSample = campaigns.filter((c) => c.costPerLead !== null && c.costPerLead !== undefined);
    const medianCpl = median(cplSample.map((c) => c.costPerLead));
    const ctrSample = campaigns.filter((c) => c.ctr !== null && c.ctr !== undefined);
    const medianCtr = median(ctrSample.map((c) => c.ctr));
    const creativeCtrSample = creatives.filter((c) => c.ctr !== null && c.ctr !== undefined);
    const medianCreativeCtr = median(creativeCtrSample.map((c) => c.ctr));
    const creativeCplSample = creatives.filter((c) => c.costPerLead !== null && c.costPerLead !== undefined);
    const medianCreativeCpl = median(creativeCplSample.map((c) => c.costPerLead));

    const comparable = campaigns.length >= opts.minSampleForComparison;
    const creativeComparable = creatives.length >= opts.minSampleForComparison;

    for (const c of campaigns) {
        const scopeName = c.campaignName || c.campaignId || 'this campaign';
        const base = { scope: 'campaign', scopeId: c.campaignId || null, scopeName, automated: false };

        // Absolute rule: money spent, zero leads recorded.
        if ((c.spend ?? 0) > 0 && !c.leads) {
            items.push({
                ...base,
                severity: 'warning',
                type: 'SPEND_WITHOUT_LEADS',
                metric: 'leads',
                observed: { spend: round(c.spend), leads: 0 },
                benchmark: null,
                message: `“${scopeName}” spent ${money(c.spend, opts.currency)} in this period with no leads recorded.`,
                recommendation: 'Review its audience, placements and creative — or pause it until the ad is revised.',
            });
            continue;
        }

        // Above-median cost per lead.
        if (comparable && cplSample.length >= opts.minSampleForComparison
            && c.costPerLead !== null && medianCpl !== null
            && c.costPerLead > medianCpl * opts.cplWarningFactor) {
            items.push({
                ...base,
                severity: 'warning',
                type: 'ABOVE_MEDIAN_COST_PER_LEAD',
                metric: 'costPerLead',
                observed: { costPerLead: round(c.costPerLead), leads: c.leads ?? 0, spend: round(c.spend) },
                benchmark: { medianCostPerLead: round(medianCpl) },
                message: `“${scopeName}” costs ${money(c.costPerLead, opts.currency)} per lead — more than ${opts.cplWarningFactor}× the campaign median of ${money(medianCpl, opts.currency)}.`,
                recommendation: 'Tighten the audience or try a different creative before increasing its budget.',
            });
        }

        // Well-below-median engagement.
        if (comparable && ctrSample.length >= opts.minSampleForComparison
            && c.ctr !== null && medianCtr !== null
            && c.ctr < medianCtr * opts.ctrWarningFactor) {
            items.push({
                ...base,
                severity: 'warning',
                type: 'LOW_ENGAGEMENT',
                metric: 'ctr',
                observed: { ctr: round(c.ctr, 2), clicks: c.clicks ?? 0, impressions: c.impressions ?? 0 },
                benchmark: { medianCtr: round(medianCtr, 2) },
                message: `“${scopeName}” gets a ${round(c.ctr, 2)}% click rate — well below the campaign median of ${round(medianCtr, 2)}%.`,
                recommendation: 'Refresh the image and copy, or narrow who it is shown to.',
            });
        }

        // Strong, still-cheap growth candidate (advisory only).
        if (comparable
            && c.costPerLead !== null && medianCpl !== null
            && c.ctr !== null && medianCtr !== null
            && cplSample.length >= opts.minSampleForComparison
            && ctrSample.length >= opts.minSampleForComparison
            && c.costPerLead <= medianCpl * opts.strongCostFactor
            && c.ctr >= medianCtr * opts.strongCtrFactor
            && (medianSpend === null || (c.spend ?? 0) < medianSpend)) {
            items.push({
                ...base,
                severity: 'opportunity',
                type: 'BUDGET_INCREASE_CANDIDATE',
                metric: 'costPerLead',
                observed: { costPerLead: round(c.costPerLead), ctr: round(c.ctr, 2), spend: round(c.spend) },
                benchmark: { medianCostPerLead: round(medianCpl), medianCtr: round(medianCtr, 2), medianSpend: round(medianSpend) },
                message: `“${scopeName}” is converting well (leads at ${money(c.costPerLead, opts.currency)}, ${round(c.ctr, 2)}% click rate) while spending less than the typical campaign.`,
                recommendation: 'A modest budget increase is worth reviewing — decide the new amount yourself; nothing is changed automatically.',
            });
        }
    }

    for (const cr of creatives) {
        const scopeName = cr.creativeName || cr.creativeId || 'this creative';
        const base = { scope: 'creative', scopeId: cr.creativeId || null, scopeName, automated: false };

        if (creativeComparable
            && cr.ctr !== null && medianCreativeCtr !== null
            && cr.ctr >= medianCreativeCtr * opts.strongCtrFactor
            && (cr.costPerLead === null || medianCreativeCpl === null || cr.costPerLead <= medianCreativeCpl * opts.strongCostFactor)
            && creativeCtrSample.length >= opts.minSampleForComparison) {
            items.push({
                ...base,
                severity: 'opportunity',
                type: 'HIGH_PERFORMING_CREATIVE',
                metric: 'ctr',
                observed: { ctr: round(cr.ctr, 2), leads: cr.leads ?? 0, spend: round(cr.spend) },
                benchmark: { medianCtr: round(medianCreativeCtr, 2) },
                message: `Creative “${scopeName}” is outperforming the others (${round(cr.ctr, 2)}% click rate).`,
                recommendation: 'Consider reusing this creative in other ad sets.',
            });
        }

        if ((cr.spend ?? 0) > 0 && cr.ctr !== null && medianCreativeCtr !== null
            && creativeCtrSample.length >= opts.minSampleForComparison
            && cr.ctr < medianCreativeCtr * opts.ctrWarningFactor) {
            items.push({
                ...base,
                severity: 'warning',
                type: 'LOW_PERFORMING_CREATIVE',
                metric: 'ctr',
                observed: { ctr: round(cr.ctr, 2), spend: round(cr.spend), leads: cr.leads ?? 0 },
                benchmark: { medianCtr: round(medianCreativeCtr, 2) },
                message: `Creative “${scopeName}” has a ${round(cr.ctr, 2)}% click rate — far below the other creatives — after spending ${money(cr.spend, opts.currency)}.`,
                recommendation: 'Consider replacing it in the underperforming ads.',
            });
        }
    }

    // Warnings first, opportunities after — stable within severity.
    items.sort((a, b) => {
        if (a.severity === b.severity) return 0;
        return a.severity === 'warning' ? -1 : 1;
    });

    return {
        items,
        benchmarks: {
            medianSpend: round(medianSpend),
            medianCostPerLead: round(medianCpl),
            medianCtr: round(medianCtr, 2),
            medianCreativeCtr: round(medianCreativeCtr, 2),
            medianCreativeCostPerLead: round(medianCreativeCpl),
        },
        insufficientData: campaigns.length < opts.minSampleForComparison,
        sample: { campaigns: campaigns.length, creatives: creatives.length },
        automated: false,
        disclaimer: ADVISORY_DISCLAIMER,
    };
}

const FUNNEL_NOTES = [
    'Attributed leads are leads created in the selected period that carry Meta campaign attribution in SpaceEzy.',
    'Contacted = any CRM status other than New. Qualified = Qualified, Site Visit, Quotation, Negotiation, Booked or Closed.',
    'Site visits, quotations and bookings count CRM records linked to those attributed leads (leads created in this period).',
    'Attribution gap compares Meta-reported lead actions with leads carrying attribution in SpaceEzy — a gap means some leads arrived without ad attribution fields; nothing is invented to close it.',
    'Costs are shown as “—” when their denominator is zero.',
];

class MetaAnalyticsService {
    // Pure engine exposure for tests and reuse — still side-effect free.
    static buildRecommendations = buildRecommendations;
    static median = median;

    // ------------------------------------------------------------------
    // Overview — account totals + per-campaign table + lead-level CRM
    // counts (campaign spend joined to CRM-attributed leads = real CPL).
    // ------------------------------------------------------------------
    static async getOverview({ organizationId, adAccountId, datePreset, since, until } = {}) {
        const { eff, token, accountId } = await conn(organizationId, adAccountId);
        const range = { datePreset, since, until };
        const [totalsData, campaignData, cohort] = await Promise.all([
            insightsRows({ token, version: eff.graphVersion, accountId, level: 'account', range }),
            insightsRows({ token, version: eff.graphVersion, accountId, level: 'campaign', range, limit: 100 }),
            fetchLeadCohort({ organizationId, range: resolveCrmRange({ datePreset, since, until }) }),
        ]);

        const totalsRow = totalsData.rows[0] || null;
        const crmByCampaign = new Map(cohort.byCampaign.map((row) => [row.campaignId, row]));
        const campaigns = campaignData.rows.map((row) => {
            const crm = row.campaignId ? crmByCampaign.get(row.campaignId) : null;
            const crmLeads = crm ? crm.leads : 0;
            return {
                ...row,
                crmLeads,
                crmContacted: crm ? crm.contacted : 0,
                crmQualified: crm ? crm.qualified : 0,
                crmCostPerLead: row.spend !== null && crmLeads > 0 ? row.spend / crmLeads : null,
            };
        });
        const attributedSpend = totalsRow && totalsRow.spend !== null
            ? totalsRow.spend
            : campaigns.reduce((sum, c) => sum + (c.spend || 0), 0);

        return {
            adAccountId: accountId,
            range: { datePreset: datePreset || null, since: since || null, until: until || null },
            currency: (totalsRow && totalsRow.accountCurrency)
                || (campaigns.find((c) => c.accountCurrency) || {}).accountCurrency
                || null,
            totals: totalsRow
                ? {
                    ...totalsRow,
                    crmAttributedLeads: cohort.attributedLeads,
                    crmContacted: cohort.contacted,
                    crmQualified: cohort.qualified,
                    crmCostPerLead: attributedSpend !== null && cohort.attributedLeads > 0
                        ? attributedSpend / cohort.attributedLeads
                        : null,
                }
                : null,
            campaigns,
            crm: {
                totalLeadsInPeriod: cohort.totalLeadsInPeriod,
                attributedLeads: cohort.attributedLeads,
                contacted: cohort.contacted,
                qualified: cohort.qualified,
                missingMetaAdId: cohort.missingMetaAdId,
                missingMetaAdsetId: cohort.missingMetaAdsetId,
            },
            notes: [
                'Delivery metrics come from the live Meta Insights API — no sample data is shown.',
                'Cost per lead (CRM) = campaign spend ÷ leads attributed in SpaceEzy; “—” means no attributed leads yet.',
            ],
        };
    }

    // ------------------------------------------------------------------
    // Conversions — full CRM funnel for the attributed cohort + costs +
    // the honest attribution gap.
    // ------------------------------------------------------------------
    static async getConversions({ organizationId, adAccountId, datePreset, since, until } = {}) {
        const { eff, token, accountId } = await conn(organizationId, adAccountId);
        const range = { datePreset, since, until };
        const [totalsData, cohort, crmRange] = await Promise.all([
            insightsRows({ token, version: eff.graphVersion, accountId, level: 'account', range }),
            fetchLeadCohort({ organizationId, range: resolveCrmRange({ datePreset, since, until }) }),
            Promise.resolve(resolveCrmRange({ datePreset, since, until })),
        ]);

        const totalsRow = totalsData.rows[0] || null;
        const spend = totalsRow ? totalsRow.spend : null;
        const metaReportedLeads = totalsRow ? totalsRow.leads : 0;

        const downstream = await fetchDownstream({
            organizationId,
            attributedIds: cohort.attributed.map((l) => l.id),
        });

        const funnel = {
            totalLeadsInPeriod: cohort.totalLeadsInPeriod,
            attributedLeads: cohort.attributedLeads,
            contacted: cohort.contacted,
            qualified: cohort.qualified,
            siteVisits: downstream.siteVisits,
            quotations: downstream.quotations,
            bookings: downstream.bookings,
            completedBookings: downstream.completedBookings,
            closedLeads: cohort.closedLeads,
            bookingValue: downstream.bookingValue,
        };

        const div = (numerator, denominator) => (denominator > 0 && numerator !== null ? numerator / denominator : null);
        const costs = {
            spend,
            bookingValue: funnel.bookingValue,
            costPerLead: div(spend, funnel.attributedLeads),
            costPerQualifiedLead: div(spend, funnel.qualified),
            costPerSiteVisit: div(spend, funnel.siteVisits),
            costPerBooking: div(spend, funnel.bookings),
            returnOnAdSpend: spend !== null && spend > 0 ? funnel.bookingValue / spend : null,
            netReturn: spend !== null ? funnel.bookingValue - spend : null,
        };

        return {
            adAccountId: accountId,
            range: {
                datePreset: datePreset || null,
                since: (crmRange && crmRange.since) || null,
                until: (crmRange && crmRange.until) || null,
            },
            currency: totalsRow ? totalsRow.accountCurrency : null,
            funnel,
            costs,
            attribution: {
                metaReportedLeads,
                crmAttributedLeads: cohort.attributedLeads,
                unattributedLeads: Math.max(0, metaReportedLeads - cohort.attributedLeads),
                crmBeyondMeta: Math.max(0, cohort.attributedLeads - metaReportedLeads),
                missingMetaAdId: cohort.missingMetaAdId,
                missingMetaAdsetId: cohort.missingMetaAdsetId,
            },
            byCampaign: cohort.byCampaign,
            notes: FUNNEL_NOTES,
        };
    }

    // ------------------------------------------------------------------
    // Performance — full metrics per level. At ad level, joins the ad→
    // creative mapping and returns creative-grouped rows (Insights has no
    // creative level). Reach/frequency stay null inside creative groups.
    // ------------------------------------------------------------------
    static async getPerformance({ organizationId, adAccountId, level = 'campaign', datePreset, since, until, limit = 50, after } = {}) {
        const { eff, token, accountId } = await conn(organizationId, adAccountId);
        const range = { datePreset, since, until };
        const data = await insightsRows({
            token, version: eff.graphVersion, accountId, level, range, limit, after,
        });

        const result = {
            adAccountId: accountId,
            level,
            items: data.rows,
            paging: data.paging,
        };

        if (level === 'ad') {
            const { join, coverage } = await resolveCreativeJoin({
                organizationId,
                adAccountId,
                adIds: data.rows.map((row) => row.adId),
            });
            result.items = data.rows.map((row) => {
                const meta = row.adId ? join.get(row.adId) : null;
                return {
                    ...row,
                    creativeId: meta ? meta.creativeId : null,
                    creativeName: meta ? meta.creativeName : null,
                };
            });
            const grouped = groupAdsByCreative(result.items, join);
            result.creativePerformance = grouped.items;
            result.creativeJoin = { ...coverage, unjoinedAds: grouped.unjoinedAds };
        }

        return result;
    }

    // ------------------------------------------------------------------
    // Recommendations — advisory only. Fetches campaign + ad insights and
    // the creative join, then runs the pure engine above. The response
    // repeats the disclaimer and automated:false so the UI can label it.
    // ------------------------------------------------------------------
    static async getRecommendations({ organizationId, adAccountId, datePreset, since, until } = {}) {
        const { eff, token, accountId } = await conn(organizationId, adAccountId);
        const range = { datePreset, since, until };
        const [campaignData, adData, totalsData] = await Promise.all([
            insightsRows({ token, version: eff.graphVersion, accountId, level: 'campaign', range, limit: 100 }),
            insightsRows({ token, version: eff.graphVersion, accountId, level: 'ad', range, limit: 100 }),
            insightsRows({ token, version: eff.graphVersion, accountId, level: 'account', range }),
        ]);

        const { join, coverage } = await resolveCreativeJoin({
            organizationId,
            adAccountId,
            adIds: adData.rows.map((row) => row.adId),
        });
        const adRows = adData.rows.map((row) => {
            const meta = row.adId ? join.get(row.adId) : null;
            return {
                ...row,
                creativeId: meta ? meta.creativeId : null,
                creativeName: meta ? meta.creativeName : null,
            };
        });
        const grouped = groupAdsByCreative(adRows, join);
        const currency = totalsData.rows[0] ? totalsData.rows[0].accountCurrency : null;

        const recommendation = buildRecommendations(
            { campaigns: campaignData.rows, creatives: grouped.items },
            { currency }
        );

        return {
            adAccountId: accountId,
            range: { datePreset: datePreset || null, since: since || null, until: until || null },
            ...recommendation,
            creativeJoin: { ...coverage, unjoinedAds: grouped.unjoinedAds },
        };
    }
}

module.exports = MetaAnalyticsService;
