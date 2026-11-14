const crypto = require('crypto');
const { asyncHandler } = require('../utils/errors');
const prisma = require('../db/prisma');
const { hasPermission } = require('../middleware/auth');
const MetaAdsService = require('../services/metaAdsService');
const MetaCampaignService = require('../services/metaCampaignService');
const MetaAdsSettingsService = require('../services/metaAdsSettingsService');
const MetaLeadFormService = require('../services/metaLeadFormService');
const MetaLeadSyncService = require('../services/metaLeadSyncService');
const {
    CAMPAIGN_OBJECTIVES,
    SPECIAL_AD_CATEGORIES,
    BILLING_EVENTS,
    OPTIMIZATION_GOALS,
    PUBLISHER_PLATFORMS,
    DEVICE_PLATFORMS,
    FACEBOOK_POSITIONS,
    INSTAGRAM_POSITIONS,
    // Phase 5 — creative / preview / upload constants (single source of
    // truth shared with the validators, so the UI can never offer a value
    // the API would reject).
    CTA_TYPES,
    AD_FORMATS,
    PREVIEW_FORMAT_INFO,
    IMAGE_MIME_TYPES,
    VIDEO_MIME_TYPES,
    MAX_IMAGE_BYTES,
    MAX_VIDEO_BYTES,
} = require('../validators/metaAds');

// ---------------------------------------------------------------------------
// Read-only reporting (Phase 11) + Phase 1 company-level connection and asset
// discovery. Every handler scopes to req.auth.organizationId (single-company
// convention: the session's organization IS the primary organization).
// ---------------------------------------------------------------------------

const getStatus = asyncHandler(async (req, res) => {
    const data = await MetaAdsService.getStatus({ organizationId: req.auth.organizationId });
    res.status(200).json({ success: true, data, message: 'Meta connection status fetched' });
});

const listAdAccounts = asyncHandler(async (req, res) => {
    const data = await MetaAdsService.listAdAccounts({ ...req.query, organizationId: req.auth.organizationId });
    res.status(200).json({ success: true, data, message: 'Ad accounts fetched successfully' });
});

const listCampaigns = asyncHandler(async (req, res) => {
    const data = await MetaAdsService.listCampaigns({ ...req.query, organizationId: req.auth.organizationId });
    res.status(200).json({ success: true, data, message: 'Campaigns fetched successfully' });
});

const getInsights = asyncHandler(async (req, res) => {
    const query = { ...req.query };
    if (typeof query.campaignIds === 'string' && query.campaignIds !== '') {
        query.campaignIds = query.campaignIds.split(',').map((s) => s.trim()).filter(Boolean);
    }
    query.organizationId = req.auth.organizationId;
    const data = await MetaAdsService.getInsights(query);
    res.status(200).json({ success: true, data, message: 'Insights fetched successfully' });
});

// ---------------------------------------------------------------------------
// Phase 1: settings + discovery
// ---------------------------------------------------------------------------

const getSettings = asyncHandler(async (req, res) => {
    const data = await MetaAdsSettingsService.getSettings(req.auth.organizationId);
    res.status(200).json({ success: true, data, message: 'Meta settings fetched' });
});

// Saves encrypted credentials and/or non-secret selections. The response is
// the display-safe view (booleans only for secrets — never the values).
const saveSettings = asyncHandler(async (req, res) => {
    const data = await MetaAdsSettingsService.saveSettings(
        req.auth.organizationId,
        req.auth.userId,
        req.body || {}
    );
    res.status(200).json({ success: true, data, message: 'Meta settings saved' });
});

const syncAssets = asyncHandler(async (req, res) => {
    const data = await MetaAdsService.syncAssets({
        organizationId: req.auth.organizationId,
        userId: req.auth.userId,
    });
    res.status(200).json({ success: true, data, message: 'Meta assets synced' });
});

// --- Credential management (Section E) --------------------------------------
// Rotate / remove / test endpoints are ADMIN/SUPER_ADMIN only (enforced in
// routes via adminOnly). Responses are the display-safe view; audit rows
// record FIELD NAMES only, never values.

const rotateSecret = asyncHandler(async (req, res) => {
    const data = await MetaAdsSettingsService.rotateSecret(
        req.auth.organizationId,
        req.auth.userId,
        req.body.field,
        req.body.value
    );
    res.status(200).json({ success: true, data, message: 'Credential updated' });
});

const removeSecret = asyncHandler(async (req, res) => {
    const data = await MetaAdsSettingsService.removeSecret(
        req.auth.organizationId,
        req.auth.userId,
        req.params.field
    );
    res.status(200).json({ success: true, data, message: 'Credential removed' });
});

// --- Connection testing (Section D) -----------------------------------------
// Provider failures are returned as HTTP 200 { ok:false, code, message } so
// the UI can render them directly; 409 META_NOT_CONFIGURED only when no
// credential is configured at all.

const respondTest = (res, data, passMessage, failMessage) => {
    if (data && data.code === 'META_NOT_CONFIGURED') {
        res.status(409).json({ success: false, code: data.code, message: data.message || failMessage, data });
        return;
    }
    res.status(200).json({ success: true, data, message: data.ok ? passMessage : failMessage });
};

const testConnection = asyncHandler(async (req, res) => {
    const data = await MetaAdsSettingsService.testConnection(req.auth.organizationId, req.auth.userId);
    respondTest(res, data, 'Connection test passed', 'Connection test failed');
});

const testToken = asyncHandler(async (req, res) => {
    const data = await MetaAdsSettingsService.testToken(req.auth.organizationId, req.auth.userId);
    respondTest(res, data, 'Token test passed', 'Token test failed');
});

const testPermissions = asyncHandler(async (req, res) => {
    const data = await MetaAdsSettingsService.testPermissions(req.auth.organizationId, req.auth.userId);
    respondTest(res, data, 'Permission check passed', 'Permission check failed');
});

const testWebhook = asyncHandler(async (req, res) => {
    const data = await MetaAdsSettingsService.testWebhook(req.auth.organizationId, req.auth.userId);
    respondTest(res, data, 'Webhook test passed', 'Webhook test failed');
});

const getPages = asyncHandler(async (req, res) => {
    const data = await MetaAdsService.listPages({ ...req.query, organizationId: req.auth.organizationId });
    res.status(200).json({ success: true, data, message: 'Pages fetched successfully' });
});

// Admin-only OAuth configuration diagnostic: the exact App Domain and
// OAuth Redirect URI the administrator must register in the Meta Developer
// Console, the configured Frontend/Backend URLs, and whether those values
// are internally consistent. URLs only — never a secret or token, and it
// never modifies any configured value.
const getOauthDiagnostics = asyncHandler(async (req, res) => {
    const data = MetaAdsSettingsService.getOauthDiagnostics();
    res.status(200).json({ success: true, data, message: 'OAuth configuration diagnostics' });
});

const getInstagramAccounts = asyncHandler(async (req, res) => {
    const data = await MetaAdsService.listInstagramAccounts({ ...req.query, organizationId: req.auth.organizationId });
    res.status(200).json({ success: true, data, message: 'Instagram accounts fetched successfully' });
});

// Returns the Meta dialog URL for the frontend to navigate to. It contains
// a short-lived HMAC-signed state — never a token, secret or credential.
const startOAuth = asyncHandler(async (req, res) => {
    const authorizeUrl = await MetaAdsSettingsService.createAuthorizeUrl();
    res.status(200).json({ success: true, data: { authorizeUrl }, message: 'Authorize URL created' });
});

// ---------------------------------------------------------------------------
// OAuth callback. Registered BEFORE requireAuth() in routes/metaAds.js: Meta
// redirects the browser here as a top-level navigation, and the session
// cookie (SameSite=Lax) rides along — resolved manually below. The response
// is always a 302 to the settings page with a SAFE status flag; no token,
// code, state or error detail ever appears in the URL we redirect to.
// ---------------------------------------------------------------------------
const oauthCallback = asyncHandler(async (req, res) => {
    const frontend = (process.env.FRONTEND_URL || '').replace(/\/+$/, '');
    const redirectTo = (result) => `${frontend}/dashboard/marketing/meta-ads/settings?oauth=${encodeURIComponent(result)}`;

    const cookieName = process.env.SESSION_COOKIE_NAME || 'spaceezy_session';
    const sessionToken = req.cookies && req.cookies[cookieName];
    if (!sessionToken) return res.redirect(redirectTo('login_required'));

    const tokenHash = crypto.createHash('sha256').update(sessionToken).digest('hex');
    const session = await prisma.session.findUnique({ where: { tokenHash }, include: { user: true } });
    if (!session || session.expiresAt < new Date() || !session.user || session.user.status !== 'ACTIVE') {
        return res.redirect(redirectTo('login_required'));
    }
    // Only roles that may change connection settings may complete a connect.
    if (!hasPermission(session.user.role, 'marketing:manage')) {
        return res.redirect(redirectTo('forbidden'));
    }

    // Meta denial/cancel: no code was issued, nothing is stored.
    if (typeof req.query.error === 'string' && req.query.error !== '') {
        return res.redirect(redirectTo(req.query.error === 'access_denied' ? 'denied' : 'failed'));
    }
    const code = typeof req.query.code === 'string' ? req.query.code : '';
    const state = typeof req.query.state === 'string' ? req.query.state : '';
    if (!code || !state) return res.redirect(redirectTo('failed'));

    try {
        await MetaAdsSettingsService.completeOAuth({
            organizationId: session.user.organizationId,
            userId: session.user.id,
            state,
            code,
        });
        return res.redirect(redirectTo('connected'));
    } catch (err) {
        // Safe identifiers only — completeOAuth messages can reference Meta
        // error text, which must not travel back through a browser URL.
        console.warn('[meta-oauth] callback failed', { code: (err && err.code) || 'UNKNOWN' });
        return res.redirect(redirectTo('failed'));
    }
});

// ---------------------------------------------------------------------------
// Phase 2 — Instant Form discovery / per-form sync config / field mapping
// (read: marketing:view; changes: marketing:manage, i.e. admin-only) and
// sync operations (backfill / retry / history). Responses carry only Meta
// identifiers, counts, statuses and the saved mapping — never credentials,
// tokens or raw lead PII.
// ---------------------------------------------------------------------------

const getLeadForms = asyncHandler(async (req, res) => {
    const data = await MetaLeadFormService.listForms({
        organizationId: req.auth.organizationId,
        pageId: req.query.pageId,
        limit: req.query.limit,
    });
    res.status(200).json({ success: true, data, message: 'Lead forms fetched' });
});

const getLeadFormQuestions = asyncHandler(async (req, res) => {
    const data = await MetaLeadFormService.getFormQuestions({
        organizationId: req.auth.organizationId,
        formId: req.params.formId,
    });
    res.status(200).json({ success: true, data, message: 'Form questions fetched' });
});

const saveLeadFormConfig = asyncHandler(async (req, res) => {
    const data = await MetaLeadFormService.saveConfig({
        organizationId: req.auth.organizationId,
        userId: req.auth.userId,
        formId: req.params.formId,
        pageId: req.body.pageId,
        formName: req.body.formName,
        isEnabled: req.body.isEnabled,
    });
    res.status(200).json({ success: true, data, message: 'Lead form sync setting saved' });
});

const saveLeadFormMapping = asyncHandler(async (req, res) => {
    const data = await MetaLeadFormService.saveMapping({
        organizationId: req.auth.organizationId,
        userId: req.auth.userId,
        formId: req.params.formId,
        pageId: req.body.pageId,
        formName: req.body.formName,
        mappings: req.body.mappings,
    });
    res.status(200).json({ success: true, data, message: 'Field mapping saved' });
});

const backfillLeadSync = asyncHandler(async (req, res) => {
    const data = await MetaLeadSyncService.backfill({
        organizationId: req.auth.organizationId,
        userId: req.auth.userId,
        pageId: req.body.pageId,
        formId: req.body.formId,
        since: req.body.since,
        until: req.body.until,
    });
    res.status(200).json({ success: true, data, message: 'Historical lead sync finished' });
});

const retryLeadSync = asyncHandler(async (req, res) => {
    const data = await MetaLeadSyncService.retryRun({
        organizationId: req.auth.organizationId,
        userId: req.auth.userId,
        runId: req.body.runId,
    });
    res.status(200).json({ success: true, data, message: 'Failed lead imports retried' });
});

const getLeadSyncHistory = asyncHandler(async (req, res) => {
    const data = await MetaLeadSyncService.listHistory({
        organizationId: req.auth.organizationId,
        formId: req.query.formId,
        pageId: req.query.pageId,
        source: req.query.source,
        status: req.query.status,
        limit: req.query.limit,
    });
    res.status(200).json({ success: true, data, message: 'Lead sync history fetched' });
});

// ---------------------------------------------------------------------------
// Phase 3+4 — campaign / ad set / audience management. Reads are
// marketing:view; every mutation is marketing:manage (route-gated) and
// writes its audit row inside the service. Creation always lands PAUSED —
// the ACTIVE status can only arrive through the dedicated status endpoints,
// whose schema requires confirm:true. Responses carry Meta identifiers,
// statuses and configuration only — never credentials.
// ---------------------------------------------------------------------------

// Static form options: single source of truth shared with the validators,
// so the UI can never offer a value the API would reject.
const getOptions = asyncHandler(async (req, res) => {
    res.status(200).json({
        success: true,
        data: {
            campaignObjectives: CAMPAIGN_OBJECTIVES,
            specialAdCategories: SPECIAL_AD_CATEGORIES,
            billingEvents: BILLING_EVENTS,
            optimizationGoals: OPTIMIZATION_GOALS,
            publisherPlatforms: PUBLISHER_PLATFORMS,
            devicePlatforms: DEVICE_PLATFORMS,
            facebookPositions: FACEBOOK_POSITIONS,
            instagramPositions: INSTAGRAM_POSITIONS,
            // Phase 5 — creative library / preview options.
            ctaTypes: CTA_TYPES,
            adFormats: AD_FORMATS,
            previewFormats: PREVIEW_FORMAT_INFO,
            imageMimeTypes: IMAGE_MIME_TYPES,
            videoMimeTypes: VIDEO_MIME_TYPES,
            // Upload caps (decoded bytes) + budget unit note.
            limits: {
                maxImageBytes: MAX_IMAGE_BYTES,
                maxVideoBytes: MAX_VIDEO_BYTES,
            },
            // Budgets/spend caps/bids are currency subunits (paise for INR).
            budgetUnit: 'minor',
        },
        message: 'Meta Ads form options fetched',
    });
});

const getCampaign = asyncHandler(async (req, res) => {
    const data = await MetaCampaignService.getCampaign({
        organizationId: req.auth.organizationId,
        campaignId: req.params.campaignId,
    });
    res.status(200).json({ success: true, data, message: 'Campaign fetched' });
});

const createCampaign = asyncHandler(async (req, res) => {
    const data = await MetaCampaignService.createCampaign({
        organizationId: req.auth.organizationId,
        userId: req.auth.userId,
        adAccountId: req.query.adAccountId,
        input: req.body,
    });
    res.status(201).json({ success: true, data, message: 'Campaign created in PAUSED state' });
});

const updateCampaign = asyncHandler(async (req, res) => {
    const data = await MetaCampaignService.updateCampaign({
        organizationId: req.auth.organizationId,
        userId: req.auth.userId,
        campaignId: req.params.campaignId,
        input: req.body,
    });
    res.status(200).json({ success: true, data, message: 'Campaign updated' });
});

const changeCampaignStatus = asyncHandler(async (req, res) => {
    const data = await MetaCampaignService.setCampaignStatus({
        organizationId: req.auth.organizationId,
        userId: req.auth.userId,
        campaignId: req.params.campaignId,
        status: req.body.status,
    });
    res.status(200).json({
        success: true,
        data,
        message: req.body.status === 'ACTIVE' ? 'Campaign activated' : 'Campaign paused',
    });
});

const listAdSets = asyncHandler(async (req, res) => {
    const data = await MetaCampaignService.listAdSets({ ...req.query, organizationId: req.auth.organizationId });
    res.status(200).json({ success: true, data, message: 'Ad sets fetched' });
});

const getAdSet = asyncHandler(async (req, res) => {
    const data = await MetaCampaignService.getAdSet({
        organizationId: req.auth.organizationId,
        adsetId: req.params.adsetId,
    });
    res.status(200).json({ success: true, data, message: 'Ad set fetched' });
});

// Creates after Meta's own validate_only dry-run passes — the ad set lands
// PAUSED and nothing is ever published from here.
const createAdSet = asyncHandler(async (req, res) => {
    const data = await MetaCampaignService.createAdSet({
        organizationId: req.auth.organizationId,
        userId: req.auth.userId,
        adAccountId: req.query.adAccountId,
        input: req.body,
    });
    res.status(201).json({ success: true, data, message: 'Ad set created in PAUSED state' });
});

// Explicit "Validate targeting" dry-run: full provider validation, no
// mutation, no audit row.
const validateAdSet = asyncHandler(async (req, res) => {
    const data = await MetaCampaignService.createAdSet({
        organizationId: req.auth.organizationId,
        adAccountId: req.query.adAccountId,
        input: req.body,
        dryRun: true,
    });
    res.status(200).json({ success: true, data, message: 'Targeting validated by Meta — no changes were made' });
});

const updateAdSet = asyncHandler(async (req, res) => {
    const data = await MetaCampaignService.updateAdSet({
        organizationId: req.auth.organizationId,
        userId: req.auth.userId,
        adsetId: req.params.adsetId,
        input: req.body,
    });
    res.status(200).json({ success: true, data, message: 'Ad set updated' });
});

const changeAdsetStatus = asyncHandler(async (req, res) => {
    const data = await MetaCampaignService.setAdsetStatus({
        organizationId: req.auth.organizationId,
        userId: req.auth.userId,
        adsetId: req.params.adsetId,
        status: req.body.status,
    });
    res.status(200).json({
        success: true,
        data,
        message: req.body.status === 'ACTIVE' ? 'Ad set activated' : 'Ad set paused',
    });
});

const listAudiences = asyncHandler(async (req, res) => {
    const data = await MetaCampaignService.listAudiences({ ...req.query, organizationId: req.auth.organizationId });
    res.status(200).json({ success: true, data, message: 'Audiences fetched' });
});

const createAudience = asyncHandler(async (req, res) => {
    const data = await MetaCampaignService.createAudience({
        organizationId: req.auth.organizationId,
        userId: req.auth.userId,
        adAccountId: req.query.adAccountId,
        name: req.body.name,
        description: req.body.description,
    });
    res.status(201).json({ success: true, data, message: 'Custom audience created (empty — add members in Meta)' });
});

const updateAudience = asyncHandler(async (req, res) => {
    const data = await MetaCampaignService.updateAudience({
        organizationId: req.auth.organizationId,
        userId: req.auth.userId,
        audienceId: req.params.audienceId,
        input: req.body,
    });
    res.status(200).json({ success: true, data, message: 'Audience updated' });
});

const deleteAudience = asyncHandler(async (req, res) => {
    const data = await MetaCampaignService.deleteAudience({
        organizationId: req.auth.organizationId,
        userId: req.auth.userId,
        audienceId: req.params.audienceId,
    });
    res.status(200).json({ success: true, data, message: 'Audience deleted permanently' });
});

module.exports = {
    getStatus,
    listAdAccounts,
    listCampaigns,
    getInsights,
    getSettings,
    saveSettings,
    rotateSecret,
    removeSecret,
    testConnection,
    testToken,
    testPermissions,
    testWebhook,
    syncAssets,
    getPages,
    getInstagramAccounts,
    getOauthDiagnostics,
    startOAuth,
    oauthCallback,
    getLeadForms,
    getLeadFormQuestions,
    saveLeadFormConfig,
    saveLeadFormMapping,
    backfillLeadSync,
    retryLeadSync,
    getLeadSyncHistory,
    // Phase 3+4 — campaign / ad set / audience management.
    getOptions,
    getCampaign,
    createCampaign,
    updateCampaign,
    changeCampaignStatus,
    listAdSets,
    getAdSet,
    createAdSet,
    validateAdSet,
    updateAdSet,
    changeAdsetStatus,
    listAudiences,
    createAudience,
    updateAudience,
    deleteAudience,
};
