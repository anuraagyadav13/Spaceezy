const { asyncHandler } = require('../utils/errors');
const MetaAnalyticsService = require('../services/metaAnalyticsService');

// ---------------------------------------------------------------------------
// Phase 6 — Analytics, CRM attribution and optimization recommendations.
// READ-ONLY by construction: these handlers only call MetaAnalyticsService,
// which never writes to Meta or the DB. Reads are marketing:view (same gate
// as reporting); no mutation endpoints exist in this file at all, so no
// budget/targeting/bid/status change can be reached from analytics.
//
// Responses carry: live Meta delivery metrics, CRM funnel counts computed
// from existing Lead/SiteVisit/Quotation/Booking rows, honest attribution
// gap counts, and advisory recommendations labelled automated:false with
// the standing disclaimer. Costs are null when a denominator is zero —
// never fabricated.
// ---------------------------------------------------------------------------

const getOverview = asyncHandler(async (req, res) => {
    const data = await MetaAnalyticsService.getOverview({
        organizationId: req.auth.organizationId,
        adAccountId: req.query.adAccountId,
        datePreset: req.query.datePreset,
        since: req.query.since,
        until: req.query.until,
    });
    res.status(200).json({ success: true, data, message: 'Analytics overview fetched' });
});

const getConversions = asyncHandler(async (req, res) => {
    const data = await MetaAnalyticsService.getConversions({
        organizationId: req.auth.organizationId,
        adAccountId: req.query.adAccountId,
        datePreset: req.query.datePreset,
        since: req.query.since,
        until: req.query.until,
    });
    res.status(200).json({ success: true, data, message: 'Conversion funnel fetched' });
});

const getPerformance = asyncHandler(async (req, res) => {
    const data = await MetaAnalyticsService.getPerformance({
        organizationId: req.auth.organizationId,
        adAccountId: req.query.adAccountId,
        level: req.query.level || 'campaign',
        datePreset: req.query.datePreset,
        since: req.query.since,
        until: req.query.until,
        limit: req.query.limit,
        after: req.query.after,
    });
    res.status(200).json({ success: true, data, message: 'Performance data fetched' });
});

const getRecommendations = asyncHandler(async (req, res) => {
    const data = await MetaAnalyticsService.getRecommendations({
        organizationId: req.auth.organizationId,
        adAccountId: req.query.adAccountId,
        datePreset: req.query.datePreset,
        since: req.query.since,
        until: req.query.until,
    });
    res.status(200).json({ success: true, data, message: 'Recommendations fetched (advisory only)' });
});

module.exports = {
    getOverview,
    getConversions,
    getPerformance,
    getRecommendations,
};
