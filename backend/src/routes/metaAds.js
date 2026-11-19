const express = require('express');
const {
    getStatus,
    listAdAccounts,
    listCampaigns,
    getInsights,
    getSettings,
    getOauthDiagnostics,
    saveSettings,
    rotateSecret,
    removeSecret,
    testConnection,
    testToken,
    testPermissions,
    testWebhook,
    subscribeWebhook,
    syncAssets,
    getPages,
    getInstagramAccounts,
    startOAuth,
    oauthCallback,
    getLeadForms,
    getLeadFormQuestions,
    saveLeadFormConfig,
    saveLeadFormMapping,
    backfillLeadSync,
    retryLeadSync,
    getLeadSyncHistory,
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
} = require('../controllers/metaAds');
const { requireAuth, requirePermission, requireRole } = require('../middleware/auth');
const { metaReadLimiter, metaConnectLimiter } = require('../middleware/metaRateLimits');
const validate = require('../middleware/validate');
const {
    listImagesSchema,
    uploadImageSchema,
    deleteImageSchema,
    listVideosSchema,
    uploadVideoSchema,
    deleteVideoSchema,
    listCreativesSchema,
    creativeParamsSchema,
    createCreativeSchema,
    updateCreativeSchema,
    deleteCreativeSchema,
    listAdsSchema,
    adParamsSchema,
    createAdSchema,
    updateAdSchema,
    adStatusSchema,
    duplicateAdSchema,
    deleteAdSchema,
    adPreviewSchema,
    creativePreviewSchema,
    previewCreativeSpecSchema,
    // Phase 6 — analytics.
    analyticsRangeSchema,
    analyticsPerformanceSchema,
} = require('../validators/metaAds');
const {
    listImages,
    uploadImage,
    deleteImage,
    listVideos,
    uploadVideo,
    deleteVideo,
    listCreatives,
    getCreative,
    validateCreative,
    createCreative,
    updateCreative,
    deleteCreative,
    listAds,
    getAd,
    validateAd,
    createAd,
    updateAd,
    changeAdStatus,
    duplicateAd,
    deleteAd,
    getAdPreviews,
    getCreativePreviews,
    previewCreativeSpec,
} = require('../controllers/metaAdsCreative');
const {
    getOverview,
    getConversions,
    getPerformance,
    getRecommendations,
} = require('../controllers/metaAnalytics');
const {
    listAdAccountsSchema,
    listCampaignsSchema,
    insightsQuerySchema,
    saveSettingsSchema,
    rotateSecretSchema,
    secretFieldParamsSchema,
    listPagesSchema,
    listInstagramAccountsSchema,
    listLeadFormsSchema,
    leadFormParamsSchema,
    leadFormConfigSchema,
    leadFormMappingSchema,
    backfillLeadSyncSchema,
    retryLeadSyncSchema,
    leadSyncHistorySchema,
    createCampaignSchema,
    campaignParamsSchema,
    updateCampaignSchema,
    campaignStatusSchema,
    listAdSetsSchema,
    createAdSetSchema,
    adsetParamsSchema,
    updateAdSetSchema,
    adsetStatusSchema,
    listAudiencesSchema,
    createAudienceSchema,
    audienceParamsSchema,
    updateAudienceSchema,
    deleteAudienceSchema,
} = require('../validators/metaAds');

const router = express.Router();

// Rate limit before auth so unauthenticated floods also consume budget
// (per-IP, generous default — see middleware/metaRateLimits.js).
router.use(metaReadLimiter);

// OAuth callback: Meta redirects the browser here as a top-level
// navigation. MUST be registered before requireAuth() — the session is
// resolved manually inside the handler (cookie is SameSite=Lax, so it
// rides along on the redirect). The response is a 302 with a safe status
// flag only: no token, code or state is ever reflected to the browser.
router.get('/oauth/callback', metaConnectLimiter, oauthCallback);

router.use(requireAuth());

// Connection status is safe to expose to viewers: it carries account names
// and permission state, never tokens or secrets.
router.get('/status', requirePermission('marketing:view'), getStatus);
router.get('/ad-accounts', requirePermission('marketing:view'), validate(listAdAccountsSchema), listAdAccounts);
router.get('/campaigns', requirePermission('marketing:view'), validate(listCampaignsSchema), listCampaigns);
router.get('/insights', requirePermission('marketing:view'), validate(insightsQuerySchema), getInsights);

// Phase 1: company-level connection settings and asset discovery.
// Viewers can SEE the connection state; changing it (including sensitive
// credentials: App ID/Secret, Access Token, Webhook Verify Token) is
// ADMIN/SUPER_ADMIN only — same adminOnly() gate as WhatsApp settings.
// Sync and OAuth connect keep the marketing:manage gate (non-secret
// asset/organization actions).
const adminOnly = () => requireRole(['SUPER_ADMIN', 'ADMIN']);
router.get('/settings', requirePermission('marketing:view'), getSettings);
// Admin-only OAuth configuration diagnostic (App Domain / OAuth Redirect
// URI / Frontend URL / Backend URL + consistency). Read-only env
// derivation — no secrets, no mutation — but gated like the credential
// surface so deployment topology stays internal.
router.get('/settings/oauth-diagnostics', adminOnly(), getOauthDiagnostics);
router.put('/settings', adminOnly(), validate(saveSettingsSchema), saveSettings);
router.post('/settings/sync', requirePermission('marketing:manage'), syncAssets);
router.post('/oauth/state', metaConnectLimiter, requirePermission('marketing:manage'), startOAuth);

// Credential management + connection testing (Sections D/E): rotate,
// remove and every test endpoint touch or exercise secrets, so they are
// ADMIN/SUPER_ADMIN only and share the connect rate-limit budget.
router.post('/settings/rotate', adminOnly(), metaConnectLimiter, validate(rotateSecretSchema), rotateSecret);
router.delete('/settings/secrets/:field', adminOnly(), metaConnectLimiter, validate(secretFieldParamsSchema), removeSecret);
router.post('/settings/test-connection', adminOnly(), metaConnectLimiter, testConnection);
router.post('/settings/test-token', adminOnly(), metaConnectLimiter, testToken);
router.post('/settings/test-permissions', adminOnly(), metaConnectLimiter, testPermissions);
router.post('/settings/test-webhook', adminOnly(), metaConnectLimiter, testWebhook);
// Explicit write: registers the app's leadgen webhook subscription with Meta
// and subscribes the selected Pages. Admin-only, same connect budget.
router.post('/settings/subscribe-webhook', adminOnly(), metaConnectLimiter, subscribeWebhook);
router.get('/pages', requirePermission('marketing:view'), validate(listPagesSchema), getPages);
router.get('/instagram-accounts', requirePermission('marketing:view'), validate(listInstagramAccountsSchema), getInstagramAccounts);

// Phase 2 — Instant Forms & lead sync.
// Reads are marketing:view; SAVING per-form config/mapping changes how leads
// flow in, so they sit behind the admin gate (same adminOnly() as settings).
// Backfill/retry are explicit non-secret sync actions on marketing:manage.
router.get('/lead-forms', requirePermission('marketing:view'), validate(listLeadFormsSchema), getLeadForms);
router.get('/lead-forms/:formId/questions', requirePermission('marketing:view'), validate(leadFormParamsSchema), getLeadFormQuestions);
router.post('/lead-forms/:formId/config', adminOnly(), validate(leadFormConfigSchema), saveLeadFormConfig);
router.put('/lead-forms/:formId/mapping', adminOnly(), validate(leadFormMappingSchema), saveLeadFormMapping);
router.get('/lead-sync/history', requirePermission('marketing:view'), validate(leadSyncHistorySchema), getLeadSyncHistory);
router.post('/lead-sync/backfill', requirePermission('marketing:manage'), validate(backfillLeadSyncSchema), backfillLeadSync);
router.post('/lead-sync/retry', requirePermission('marketing:manage'), validate(retryLeadSyncSchema), retryLeadSync);

// ---------------------------------------------------------------------------
// Phase 3+4 — campaign, ad set and audience management.
// Reads stay marketing:view (same gate as reporting). Every mutation sits
// behind marketing:manage, is zod-validated before any handler runs, and
// creates are schema-forced to PAUSED — activation only ever happens via
// the /status endpoints, whose body schema requires confirm:true. Audience
// deletion additionally requires ?confirm=true (permanent in Meta's API).
// ---------------------------------------------------------------------------
router.get('/options', requirePermission('marketing:view'), getOptions);

router.get('/campaigns/:campaignId', requirePermission('marketing:view'), validate(campaignParamsSchema), getCampaign);
router.post('/campaigns', requirePermission('marketing:manage'), validate(createCampaignSchema), createCampaign);
router.patch('/campaigns/:campaignId', requirePermission('marketing:manage'), validate(updateCampaignSchema), updateCampaign);
router.post('/campaigns/:campaignId/status', requirePermission('marketing:manage'), validate(campaignStatusSchema), changeCampaignStatus);

router.get('/adsets', requirePermission('marketing:view'), validate(listAdSetsSchema), listAdSets);
router.get('/adsets/:adsetId', requirePermission('marketing:view'), validate(adsetParamsSchema), getAdSet);
router.post('/adsets', requirePermission('marketing:manage'), validate(createAdSetSchema), createAdSet);
router.post('/adsets/validate', requirePermission('marketing:manage'), validate(createAdSetSchema), validateAdSet);
router.patch('/adsets/:adsetId', requirePermission('marketing:manage'), validate(updateAdSetSchema), updateAdSet);
router.post('/adsets/:adsetId/status', requirePermission('marketing:manage'), validate(adsetStatusSchema), changeAdsetStatus);

router.get('/audiences', requirePermission('marketing:view'), validate(listAudiencesSchema), listAudiences);
router.post('/audiences', requirePermission('marketing:manage'), validate(createAudienceSchema), createAudience);
router.patch('/audiences/:audienceId', requirePermission('marketing:manage'), validate(updateAudienceSchema), updateAudience);
router.delete('/audiences/:audienceId', requirePermission('marketing:manage'), validate(deleteAudienceSchema), deleteAudience);

// ---------------------------------------------------------------------------
// Phase 5 — media library, ad creatives, ads and previews.
// Reads are marketing:view (previews included — they are read-only calls);
// every mutation is marketing:manage. Uploads/deletes also share the
// tighter connect budget (heavy payloads / permanent operations). Safety
// invariants are schema-enforced: uploads size-gated pre-decode, creates
// run a Meta validate_only dry-run first, ads are forced PAUSED, activation
// only via /ads/:adId/status (body confirm:true), every delete requires
// ?confirm=true. Route order puts /validate POSTs ahead of any :param GETs.
// ---------------------------------------------------------------------------

// Media (images + videos) — Meta-side asset library.
router.get('/creative/images', requirePermission('marketing:view'), validate(listImagesSchema), listImages);
router.post('/creative/images', requirePermission('marketing:manage'), metaConnectLimiter, validate(uploadImageSchema), uploadImage);
router.delete('/creative/images/:hash', requirePermission('marketing:manage'), metaConnectLimiter, validate(deleteImageSchema), deleteImage);
router.get('/creative/videos', requirePermission('marketing:view'), validate(listVideosSchema), listVideos);
router.post('/creative/videos', requirePermission('marketing:manage'), metaConnectLimiter, validate(uploadVideoSchema), uploadVideo);
router.delete('/creative/videos/:videoId', requirePermission('marketing:manage'), metaConnectLimiter, validate(deleteVideoSchema), deleteVideo);

// Ad creatives (link creatives: copy + media + CTA + destination).
router.get('/creatives', requirePermission('marketing:view'), validate(listCreativesSchema), listCreatives);
router.post('/creatives/validate', requirePermission('marketing:manage'), validate(createCreativeSchema), validateCreative);
router.post('/creatives', requirePermission('marketing:manage'), validate(createCreativeSchema), createCreative);
router.get('/creatives/:creativeId', requirePermission('marketing:view'), validate(creativeParamsSchema), getCreative);
router.patch('/creatives/:creativeId', requirePermission('marketing:manage'), validate(updateCreativeSchema), updateCreative);
router.delete('/creatives/:creativeId', requirePermission('marketing:manage'), metaConnectLimiter, validate(deleteCreativeSchema), deleteCreative);

// Ads (always created PAUSED; activation is the confirmed /status path).
router.get('/ads', requirePermission('marketing:view'), validate(listAdsSchema), listAds);
router.post('/ads/validate', requirePermission('marketing:manage'), validate(createAdSchema), validateAd);
router.post('/ads', requirePermission('marketing:manage'), validate(createAdSchema), createAd);
router.get('/ads/:adId', requirePermission('marketing:view'), validate(adParamsSchema), getAd);
router.patch('/ads/:adId', requirePermission('marketing:manage'), validate(updateAdSchema), updateAd);
router.post('/ads/:adId/status', requirePermission('marketing:manage'), validate(adStatusSchema), changeAdStatus);
router.post('/ads/:adId/duplicate', requirePermission('marketing:manage'), validate(duplicateAdSchema), duplicateAd);
router.delete('/ads/:adId', requirePermission('marketing:manage'), metaConnectLimiter, validate(deleteAdSchema), deleteAd);

// Previews — documented formats only; a rejected format comes back as an
// honest per-format error, never a fabricated image. Iframes are valid
// 24 hours (Meta contract). The unsaved-spec preview is POST but still
// read-only (generatepreviews performs no mutation).
router.get('/ads/:adId/previews', requirePermission('marketing:view'), validate(adPreviewSchema), getAdPreviews);
router.get('/creatives/:creativeId/previews', requirePermission('marketing:view'), validate(creativePreviewSchema), getCreativePreviews);
router.post('/previews/creative', requirePermission('marketing:view'), validate(previewCreativeSpecSchema), previewCreativeSpec);

// ---------------------------------------------------------------------------
// Phase 6 — analytics, CRM attribution and advisory recommendations.
// marketing:view reads only: no mutation endpoint exists in this block, so
// budgets/targeting/bids/status can never be changed from analytics. The
// recommendation response repeats automated:false + the advisory
// disclaimer; costs come back null (not fabricated) on zero denominators.
// ---------------------------------------------------------------------------
router.get('/analytics/overview', requirePermission('marketing:view'), validate(analyticsRangeSchema), getOverview);
router.get('/analytics/conversions', requirePermission('marketing:view'), validate(analyticsRangeSchema), getConversions);
router.get('/analytics/performance', requirePermission('marketing:view'), validate(analyticsPerformanceSchema), getPerformance);
router.get('/analytics/recommendations', requirePermission('marketing:view'), validate(analyticsRangeSchema), getRecommendations);

module.exports = router;
