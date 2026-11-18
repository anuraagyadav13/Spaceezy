import apiClient from "./client";

export const fetchMetaStatus = async () => {
    const response = await apiClient.get("/meta-ads/status");
    return response;
};

export const fetchMetaAdAccounts = async (params = {}) => {
    const response = await apiClient.get("/meta-ads/ad-accounts", { params });
    return response;
};

export const fetchMetaCampaigns = async (params = {}) => {
    const response = await apiClient.get("/meta-ads/campaigns", { params });
    return response;
};

export const fetchMetaInsights = async (params = {}) => {
    const response = await apiClient.get("/meta-ads/insights", { params });
    return response;
};

// ---------------------------------------------------------------------------
// Phase 1: company-level connection settings + asset discovery.
// The server never returns credentials — only display-safe booleans and
// non-secret selections — so nothing here needs redacting on the client.
// ---------------------------------------------------------------------------

export const fetchMetaSettings = async () => {
    const response = await apiClient.get("/meta-ads/settings");
    return response;
};

// Admin-only OAuth configuration diagnostic: App Domain, OAuth Redirect
// URI, Frontend URL, Backend URL and internal consistency (URLs only —
// the API never returns secrets).
export const fetchMetaOauthDiagnostics = async () => {
    const response = await apiClient.get("/meta-ads/settings/oauth-diagnostics");
    return response;
};

export const saveMetaSettings = async (payload) => {
    const response = await apiClient.put("/meta-ads/settings", payload);
    return response;
};

// Credential management (Sections D/E) — ADMIN/SUPER_ADMIN only on the
// server. The client only ever sends values the admin typed in (never a
// stored one: the server never returns stored secret values).
export const rotateMetaSecret = async (payload) => {
    const response = await apiClient.post("/meta-ads/settings/rotate", payload);
    return response;
};

export const removeMetaSecret = async (field) => {
    const response = await apiClient.delete(`/meta-ads/settings/secrets/${field}`);
    return response;
};

// Connection tests (Section D). The server returns HTTP 200 with an
// { ok, code, message } envelope for provider failures (409 only when
// nothing is configured), so these helpers never throw on a failed test —
// callers read data.ok and render the message.
export const testMetaConnection = async () => {
    const response = await apiClient.post("/meta-ads/settings/test-connection", {});
    return response;
};

export const testMetaToken = async () => {
    const response = await apiClient.post("/meta-ads/settings/test-token", {});
    return response;
};

export const testMetaPermissions = async () => {
    const response = await apiClient.post("/meta-ads/settings/test-permissions", {});
    return response;
};

export const testMetaWebhook = async () => {
    const response = await apiClient.post("/meta-ads/settings/test-webhook", {});
    return response;
};

// Writes the leadgen webhook subscription in Meta (App Dashboard → Webhooks →
// Page → leadgen) and subscribes the selected Pages to the app, so Meta
// actually delivers leadgen events. Admin-only on the server.
export const subscribeMetaWebhook = async () => {
    const response = await apiClient.post("/meta-ads/settings/subscribe-webhook", {});
    return response;
};

export const syncMetaAssets = async () => {
    const response = await apiClient.post("/meta-ads/settings/sync", {});
    return response;
};

export const fetchMetaPages = async (params = {}) => {
    const response = await apiClient.get("/meta-ads/pages", { params });
    return response;
};

export const fetchMetaInstagramAccounts = async (params = {}) => {
    const response = await apiClient.get("/meta-ads/instagram-accounts", { params });
    return response;
};

// Requests a signed OAuth authorize URL (state lives server-side). The
// browser navigates to authorizeUrl; the callback redirects back with a
// safe ?oauth= flag only — never a token or code.
export const startMetaOAuth = async () => {
    const response = await apiClient.post("/meta-ads/oauth/state", {});
    return response;
};

// ---------------------------------------------------------------------------
// Phase 2: Instant Form discovery, per-form sync config, field mapping,
// historical backfill, retry and sync history. The response envelope is
// unwrapped by the client interceptor, so these resolve to the inner `data`
// payload (items/errors/counts/status only — never credentials).
// ---------------------------------------------------------------------------

export const fetchMetaLeadForms = async (params = {}) => {
    const response = await apiClient.get("/meta-ads/lead-forms", { params });
    return response;
};

export const fetchMetaLeadFormQuestions = async (formId) => {
    const response = await apiClient.get(`/meta-ads/lead-forms/${formId}/questions`);
    return response;
};

// Admin-only on the server. `{ isEnabled, pageId, formName? }`.
export const saveMetaLeadFormConfig = async (formId, payload) => {
    const response = await apiClient.post(`/meta-ads/lead-forms/${formId}/config`, payload);
    return response;
};

// Admin-only on the server. `{ pageId?, formName?, mappings: [...] }` where
// each mapping is `{ questionKey, questionLabel?, crmField }` and crmField
// null = intentionally unmapped (answer still kept in metaAnswers).
export const saveMetaLeadFormMapping = async (formId, payload) => {
    const response = await apiClient.put(`/meta-ads/lead-forms/${formId}/mapping`, payload);
    return response;
};

export const fetchMetaLeadSyncHistory = async (params = {}) => {
    const response = await apiClient.get("/meta-ads/lead-sync/history", { params });
    return response;
};

// marketing:manage. `{ pageId, formId, since?, until? }` — dates YYYY-MM-DD,
// required together. Resolves with the finished run (counts + status).
export const runMetaLeadBackfill = async (payload) => {
    const response = await apiClient.post("/meta-ads/lead-sync/backfill", payload);
    return response;
};

// marketing:manage. `{ runId }` — retries that run's FAILED events through
// the same import path (idempotent: an already-imported lead is a duplicate).
export const retryMetaLeadSync = async (payload) => {
    const response = await apiClient.post("/meta-ads/lead-sync/retry", payload);
    return response;
};

// Join campaign rows with level=campaign insight rows. Unknown metrics stay
// null (rendered as "—"); they are never coerced to zero.
export const mergeCampaignStats = (campaigns = [], insightRows = []) => {
    const byId = new Map();
    for (const row of insightRows || []) {
        if (row && row.campaignId) byId.set(String(row.campaignId), row);
    }
    return (campaigns || []).map((campaign) => {
        const stats = byId.get(String(campaign.id)) || null;
        return { campaign, stats };
    });
};

// Aggregate insight rows into KPI totals. A total is null when every
// contributing value is unknown (never 0-for-unknown).
export const sumInsights = (rows = []) => {
    const pick = (key) => (rows || []).map((r) => (r ? r[key] : null)).filter((v) => v !== null && v !== undefined);
    const sum = (values) => (values.length === 0 ? null : values.reduce((a, b) => a + b, 0));
    const spendValues = pick("spend");
    const leadValues = pick("leads");
    const spend = sum(spendValues);
    const leads = sum(leadValues);
    return {
        spend,
        impressions: sum(pick("impressions")),
        reach: sum(pick("reach")),
        clicks: sum(pick("clicks")),
        leads,
        costPerLead: spend !== null && leads ? spend / leads : null,
    };
};

export const DATE_PRESETS = [
    { value: "last_7d", label: "Last 7 days" },
    { value: "last_14d", label: "Last 14 days" },
    { value: "last_30d", label: "Last 30 days" },
    { value: "last_90d", label: "Last 90 days" },
];

export const CAMPAIGN_STATUSES = [
    { value: "", label: "All statuses" },
    { value: "ACTIVE", label: "Active" },
    { value: "PAUSED", label: "Paused" },
    { value: "ARCHIVED", label: "Archived" },
];

// ---------------------------------------------------------------------------
// Phase 3+4 — campaign, ad set and audience management. All of these resolve
// to the unwrapped inner `data` payload (Meta identifiers/statuses/config
// only — never credentials). Reads need marketing:view, mutations
// marketing:manage; activation bodies must carry confirm:true (enforced by
// the server) and audience deletion passes ?confirm=true.
// ---------------------------------------------------------------------------

// Single source of truth for form enums (mirrors the backend validators).
export const fetchMetaAdOptions = async () => {
    const response = await apiClient.get("/meta-ads/options");
    return response;
};

export const fetchMetaCampaignDetail = async (campaignId) => {
    const response = await apiClient.get(`/meta-ads/campaigns/${campaignId}`);
    return response;
};

// `{ name, objective, specialAdCategories?, dailyBudget?|lifetimeBudget?,
//    spendCap? }` — budget fields are currency subunits (minor units).
// Server always creates status=PAUSED.
export const createMetaCampaign = async (payload, params = {}) => {
    const response = await apiClient.post("/meta-ads/campaigns", payload, { params });
    return response;
};

// `{ name?, objective?, dailyBudget?|lifetimeBudget?, spendCap? }`.
export const updateMetaCampaign = async (campaignId, payload) => {
    const response = await apiClient.patch(`/meta-ads/campaigns/${campaignId}`, payload);
    return response;
};

// Pausing needs only { status: "PAUSED" }; activation must send
// { status: "ACTIVE", confirm: true } — the server rejects anything else.
export const setMetaCampaignStatus = async (campaignId, payload) => {
    const response = await apiClient.post(`/meta-ads/campaigns/${campaignId}/status`, payload);
    return response;
};

export const fetchMetaAdSets = async (params = {}) => {
    const response = await apiClient.get("/meta-ads/adsets", { params });
    return response;
};

export const fetchMetaAdSet = async (adsetId) => {
    const response = await apiClient.get(`/meta-ads/adsets/${adsetId}`);
    return response;
};

// Full ad set payload. The server runs Meta's validate_only dry-run first
// and only creates PAUSED when it passes. `params.adAccountId` optional.
export const createMetaAdSet = async (payload, params = {}) => {
    const response = await apiClient.post("/meta-ads/adsets", payload, { params });
    return response;
};

// Explicit dry-run: provider validation of the same payload with zero
// mutation, zero audit rows. Resolves { ok: true, dryRun: true }.
export const validateMetaAdSet = async (payload, params = {}) => {
    const response = await apiClient.post("/meta-ads/adsets/validate", payload, { params });
    return response;
};

export const updateMetaAdSet = async (adsetId, payload) => {
    const response = await apiClient.patch(`/meta-ads/adsets/${adsetId}`, payload);
    return response;
};

// Same confirm contract as campaigns for activation.
export const setMetaAdSetStatus = async (adsetId, payload) => {
    const response = await apiClient.post(`/meta-ads/adsets/${adsetId}/status`, payload);
    return response;
};

// `{ saved: { items, paging }, custom: { items, paging } }` — saved
// audiences are Meta-read-only, custom audiences are manageable.
export const fetchMetaAudiences = async (params = {}) => {
    const response = await apiClient.get("/meta-ads/audiences", { params });
    return response;
};

// Blank CUSTOM container — membership is managed in Ads Manager.
export const createMetaAudience = async (payload, params = {}) => {
    const response = await apiClient.post("/meta-ads/audiences", payload, { params });
    return response;
};

export const updateMetaAudience = async (audienceId, payload) => {
    const response = await apiClient.patch(`/meta-ads/audiences/${audienceId}`, payload);
    return response;
};

// PERMANENT in Meta's API — the server requires ?confirm=true, which this
// always sends; the UI gates the call behind its own confirmation dialog.
export const deleteMetaAudience = async (audienceId) => {
    const response = await apiClient.delete(`/meta-ads/audiences/${audienceId}`, {
        params: { confirm: "true" },
    });
    return response;
};

// ---------------------------------------------------------------------------
// Phase 5 — media library, ad creatives, ads and previews.
// Reads are marketing:view; every mutation is marketing:manage. Deletes
// always carry ?confirm=true (server-enforced, mirrored by the UI dialog).
// Uploads run with a longer timeout: base64 payloads (8 MB images / 50 MB
// videos) exceed the default 10 s client budget.
// ---------------------------------------------------------------------------

const UPLOAD_TIMEOUT_MS = 180000;

export const fetchMetaImages = async (params = {}) => {
    const response = await apiClient.get("/meta-ads/creative/images", { params });
    return response;
};

// `{ fileName, mimeType, dataBase64, name? }` → image `{ hash, url, ... }`.
export const uploadMetaImage = async (payload, params = {}) => {
    const response = await apiClient.post("/meta-ads/creative/images", payload, {
        params,
        timeout: UPLOAD_TIMEOUT_MS,
    });
    return response;
};

// PERMANENT — server requires ?confirm=true; images in use are rejected by
// Meta and the provider error surfaces honestly.
export const deleteMetaImage = async (hash, params = {}) => {
    const response = await apiClient.delete(`/meta-ads/creative/images/${hash}`, {
        params: { ...params, confirm: "true" },
    });
    return response;
};

export const fetchMetaVideos = async (params = {}) => {
    const response = await apiClient.get("/meta-ads/creative/videos", { params });
    return response;
};

// `{ fileName, mimeType, dataBase64, name?, description? }` → video row.
export const uploadMetaVideo = async (payload, params = {}) => {
    const response = await apiClient.post("/meta-ads/creative/videos", payload, {
        params,
        timeout: UPLOAD_TIMEOUT_MS,
    });
    return response;
};

export const deleteMetaVideo = async (videoId, params = {}) => {
    const response = await apiClient.delete(`/meta-ads/creative/videos/${videoId}`, {
        params: { ...params, confirm: "true" },
    });
    return response;
};

export const fetchMetaCreatives = async (params = {}) => {
    const response = await apiClient.get("/meta-ads/creatives", { params });
    return response;
};

export const getMetaCreative = async (creativeId) => {
    const response = await apiClient.get(`/meta-ads/creatives/${creativeId}`);
    return response;
};

// Dry-run: full Meta validation, zero mutation, resolves { ok, dryRun }.
export const validateMetaCreative = async (payload, params = {}) => {
    const response = await apiClient.post("/meta-ads/creatives/validate", payload, { params });
    return response;
};

// Server runs its own validate_only pass first; creative lands without any
// delivery. `params.adAccountId` optional.
export const createMetaCreative = async (payload, params = {}) => {
    const response = await apiClient.post("/meta-ads/creatives", payload, { params });
    return response;
};

// Meta creative content is immutable — this renames only.
export const updateMetaCreative = async (creativeId, payload) => {
    const response = await apiClient.patch(`/meta-ads/creatives/${creativeId}`, payload);
    return response;
};

export const deleteMetaCreative = async (creativeId) => {
    const response = await apiClient.delete(`/meta-ads/creatives/${creativeId}`, {
        params: { confirm: "true" },
    });
    return response;
};

// `{ campaignId?, adsetId?, status?, limit?, after? }` — one of campaignId
// or adsetId scopes to that edge; both together are rejected server-side.
export const fetchMetaAds = async (params = {}) => {
    const response = await apiClient.get("/meta-ads/ads", { params });
    return response;
};

export const getMetaAd = async (adId) => {
    const response = await apiClient.get(`/meta-ads/ads/${adId}`);
    return response;
};

// Dry-run (validate_only + synchronous_ad_review): zero mutation.
export const validateMetaAd = async (payload, params = {}) => {
    const response = await apiClient.post("/meta-ads/ads/validate", payload, { params });
    return response;
};

// `{ name, adsetId, creativeId }` — server forces status PAUSED always.
export const createMetaAd = async (payload, params = {}) => {
    const response = await apiClient.post("/meta-ads/ads", payload, { params });
    return response;
};

// Meta allows rename only at the node level (adset_id is immutable).
export const updateMetaAd = async (adId, payload) => {
    const response = await apiClient.patch(`/meta-ads/ads/${adId}`, payload);
    return response;
};

// Pausing needs only { status: "PAUSED" }; activation must send
// { status: "ACTIVE", confirm: true } — the server rejects anything else.
export const setMetaAdStatus = async (adId, payload) => {
    const response = await apiClient.post(`/meta-ads/ads/${adId}/status`, payload);
    return response;
};

// Copy is ALWAYS created PAUSED (server forces status_option); optional
// `{ adsetId }` moves the copy into another ad set.
export const duplicateMetaAd = async (adId, payload = {}) => {
    const response = await apiClient.post(`/meta-ads/ads/${adId}/duplicate`, payload);
    return response;
};

export const deleteMetaAd = async (adId) => {
    const response = await apiClient.delete(`/meta-ads/ads/${adId}`, {
        params: { confirm: "true" },
    });
    return response;
};

// Previews: `formats` is an array of documented ad_format values joined to
// the comma-separated query. Response carries per-format iframe HTML (valid
// 24 h) and honest per-format errors — never a fabricated image.
const previewParams = (formats) =>
    Array.isArray(formats) && formats.length > 0 ? { formats: formats.join(",") } : {};

export const fetchMetaAdPreviews = async (adId, formats) => {
    const response = await apiClient.get(`/meta-ads/ads/${adId}/previews`, {
        params: previewParams(formats),
    });
    return response;
};

export const fetchMetaCreativePreviews = async (creativeId, formats) => {
    const response = await apiClient.get(`/meta-ads/creatives/${creativeId}/previews`, {
        params: previewParams(formats),
    });
    return response;
};

// Preview of an UNSAVED creative spec (read-only generatepreviews).
export const previewMetaCreativeSpec = async (payload, { formats, ...params } = {}) => {
    const response = await apiClient.post("/meta-ads/previews/creative", payload, {
        params: { ...params, ...previewParams(formats) },
    });
    return response;
};

// ---------------------------------------------------------------------------
// Phase 6 — analytics, CRM attribution and advisory recommendations.
// Read-only endpoints: no mutation exists in this block, so budgets,
// targeting, bids and statuses can never be changed from analytics.
// Range params: `{ datePreset }` OR `{ since, until }` (YYYY-MM-DD).
// ---------------------------------------------------------------------------

export const fetchMetaAnalyticsOverview = async (params = {}) => {
    const response = await apiClient.get("/meta-ads/analytics/overview", { params });
    return response;
};

export const fetchMetaAnalyticsConversions = async (params = {}) => {
    const response = await apiClient.get("/meta-ads/analytics/conversions", { params });
    return response;
};

// `{ level, ...range, limit?, after? }` — level: account|campaign|adset|ad.
export const fetchMetaAnalyticsPerformance = async (params = {}) => {
    const response = await apiClient.get("/meta-ads/analytics/performance", { params });
    return response;
};

export const fetchMetaAnalyticsRecommendations = async (params = {}) => {
    const response = await apiClient.get("/meta-ads/analytics/recommendations", { params });
    return response;
};
