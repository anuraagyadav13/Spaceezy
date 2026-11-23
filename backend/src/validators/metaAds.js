const { z } = require('zod');

const DATE_PRESETS = [
    'today', 'yesterday', 'last_7d', 'last_14d', 'last_30d', 'last_90d',
    'this_month', 'last_month', 'this_quarter', 'lifetime', 'last_year',
];
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be YYYY-MM-DD');

// Campaign objective enum (Marketing API reference, ad-campaign-group
// Creating table) — defined at the top because the campaign list filter
// already validates against it.
const CAMPAIGN_OBJECTIVES = [
    'APP_INSTALLS', 'BRAND_AWARENESS', 'CONVERSIONS', 'EVENT_RESPONSES',
    'LEAD_GENERATION', 'LINK_CLICKS', 'LOCAL_AWARENESS', 'MESSAGES',
    'OFFER_CLAIMS', 'OUTCOME_APP_PROMOTION', 'OUTCOME_AWARENESS',
    'OUTCOME_ENGAGEMENT', 'OUTCOME_LEADS', 'OUTCOME_SALES', 'OUTCOME_TRAFFIC',
    'PAGE_LIKES', 'POST_ENGAGEMENT', 'PRODUCT_CATALOG_SALES', 'REACH',
    'STORE_VISITS', 'VIDEO_VIEWS',
];

const listAdAccountsSchema = {
    query: z.object({
        limit: z.string().regex(/^\d+$/).optional(),
        after: z.string().max(500).optional(),
    }),
};

// Phase 1: save company-level settings. Secrets are optional (blank/absent
// preserves any stored credential); selection arrays accept string or
// numeric Meta IDs (the service normalizes, de-duplicates and validates).
const idList = z.array(z.union([z.string().max(64), z.number()])).max(100);

const saveSettingsSchema = {
    body: z.object({
        // Blank strings are ALLOWED on purpose: they mean "keep the saved
        // credential" (removal only ever happens via DELETE /settings/secrets/:field).
        accessToken: z.string().max(8192).optional(),
        appSecret: z.string().max(1024).optional(),
        webhookVerifyToken: z.string().max(500).optional(),
        metaAppId: z.union([z.string().max(32), z.null()]).optional(),
        graphVersion: z.string().regex(/^v\d{1,2}\.\d{1,2}$/, 'must look like v22.0').optional(),
        tokenExpiresAt: z.union([z.string().max(64), z.null()]).optional(),
        selectedAdAccountIds: idList.optional(),
        pageIds: idList.optional(),
        instagramAccountIds: idList.optional(),
    }),
};

// Rotate one stored credential with an explicit new value (Section E).
const rotateSecretSchema = {
    body: z.object({
        field: z.enum(['accessToken', 'appSecret', 'webhookVerifyToken']),
        value: z.string().trim().min(1, 'A non-empty value is required').max(8192),
    }),
};

// Explicit removal of one stored credential (Section E). Confirmation is a
// frontend concern; the endpoint itself is the explicit action.
const secretFieldParamsSchema = {
    params: z.object({
        field: z.enum(['accessToken', 'appSecret', 'webhookVerifyToken']),
    }),
};

const listPagesSchema = {
    query: z.object({
        limit: z.string().regex(/^\d+$/).optional(),
        after: z.string().max(500).optional(),
    }),
};

const listInstagramAccountsSchema = {
    query: z.object({
        limit: z.string().regex(/^\d+$/).optional(),
        after: z.string().max(500).optional(),
    }),
};

const listCampaignsSchema = {
    query: z.object({
        adAccountId: z.string().regex(/^\d+$/, 'must be a numeric ad account ID').optional(),
        status: z.enum(['ACTIVE', 'PAUSED', 'ARCHIVED']).optional(),
        objective: z.enum(CAMPAIGN_OBJECTIVES).optional(),
        limit: z.string().regex(/^\d+$/).optional(),
        after: z.string().max(500).optional(),
    }),
};

const insightsQuerySchema = {
    query: z.object({
        level: z.enum(['campaign', 'adset', 'ad']).optional(),
        adAccountId: z.string().regex(/^\d+$/, 'must be a numeric ad account ID').optional(),
        campaignIds: z.string().regex(/^[\d,]+$/, 'must be comma-separated numeric IDs').optional(),
        datePreset: z.enum(DATE_PRESETS).optional(),
        since: isoDate.optional(),
        until: isoDate.optional(),
        limit: z.string().regex(/^\d+$/).optional(),
        after: z.string().max(500).optional(),
    }).superRefine((q, ctx) => {
        if (q.datePreset && (q.since || q.until)) {
            ctx.addIssue({ code: 'custom', path: ['datePreset'], message: 'datePreset cannot be combined with since/until' });
        }
        if (!q.datePreset && !q.since && !q.until) {
            ctx.addIssue({ code: 'custom', path: ['datePreset'], message: 'datePreset or since/until is required' });
        }
        if ((q.since && !q.until) || (!q.since && q.until)) {
            ctx.addIssue({ code: 'custom', path: ['until'], message: 'since and until are required together' });
        }
        if (q.since && q.until && q.since > q.until) {
            ctx.addIssue({ code: 'custom', path: ['since'], message: 'since must not be after until' });
        }
    }),
};

// ---------------------------------------------------------------------------
// Phase 2 — Instant Form discovery, per-form sync config, field mapping,
// historical backfill, retry and sync history.
// ---------------------------------------------------------------------------

const digitsId = z.string().regex(/^\d+$/, 'must be a numeric Meta ID');

// 2A: optional Page scope + page size for form discovery.
const listLeadFormsSchema = {
    query: z.object({
        pageId: digitsId.optional(),
        limit: z.string().regex(/^\d+$/).optional(),
    }),
};

const leadFormParamsSchema = {
    params: z.object({ formId: digitsId }),
};

// 2B: enable/disable sync for one form. The Page must be one of the
// connected Pages (validated server-side against the existing allow-list).
const leadFormConfigSchema = {
    params: z.object({ formId: digitsId }),
    body: z.object({
        isEnabled: z.boolean(),
        pageId: digitsId,
        formName: z.string().max(300).optional(),
    }),
};

// 2C: saved question→CRM field mapping. crmField null = intentionally
// unmapped (still preserved on the lead in metaAnswers).
const mappingRowSchema = z.object({
    questionKey: z.string().trim().min(1).max(200),
    questionLabel: z.string().max(300).optional(),
    crmField: z.string().max(60).nullable().optional(),
});

const leadFormMappingSchema = {
    params: z.object({ formId: digitsId }),
    body: z.object({
        pageId: digitsId.optional(),
        formName: z.string().max(300).optional(),
        mappings: z.array(mappingRowSchema).max(100),
    }),
};

// 2E: bounded historical backfill for one Page + form over an optional,
// paired date range (mirrors the insights since/until rule).
const backfillLeadSyncSchema = {
    body: z.object({
        pageId: digitsId,
        formId: digitsId,
        since: isoDate.optional(),
        until: isoDate.optional(),
    }).superRefine((b, ctx) => {
        if ((b.since && !b.until) || (!b.since && b.until)) {
            ctx.addIssue({ code: 'custom', path: ['until'], message: 'since and until are required together' });
        }
        if (b.since && b.until && b.since > b.until) {
            ctx.addIssue({ code: 'custom', path: ['since'], message: 'since must not be after until' });
        }
    }),
};

// 2E: retry the FAILED events of one previous run.
const retryLeadSyncSchema = {
    body: z.object({ runId: z.string().uuid() }),
};

// 2H: sync history filters.
const leadSyncHistorySchema = {
    query: z.object({
        formId: digitsId.optional(),
        pageId: digitsId.optional(),
        source: z.enum(['WEBHOOK', 'BACKFILL', 'RETRY']).optional(),
        status: z.enum(['RUNNING', 'COMPLETED', 'PARTIAL', 'FAILED']).optional(),
        limit: z.string().regex(/^\d+$/).optional(),
    }),
};

// ---------------------------------------------------------------------------
// Phase 3+4 — Campaign, ad set and audience management.
//
// Every enum below is copied from the official Marketing API reference for
// the campaign / adset / placement / custom-audience edges. Only values that
// are valid for CREATION are exposed (read-only or deprecated values such as
// NONE and CLICKS are deliberately excluded). Nothing is invented here —
// adding a value means citing the doc section it came from.
// (CAMPAIGN_OBJECTIVES lives at the top of the file — used by the list filter.)
// ---------------------------------------------------------------------------

const SPECIAL_AD_CATEGORIES = [
    'NONE', 'EMPLOYMENT', 'HOUSING', 'CREDIT', 'ISSUES_ELECTIONS_POLITICS',
    'ONLINE_GAMBLING_AND_GAMING', 'FINANCIAL_PRODUCTS_SERVICES',
];

// billing_event enum minus the deprecated CLICKS and the read-only NONE.
const BILLING_EVENTS = [
    'APP_INSTALLS', 'IMPRESSIONS', 'LINK_CLICKS', 'OFFER_CLAIMS', 'PAGE_LIKES',
    'POST_ENGAGEMENT', 'PURCHASE', 'LISTING_INTERACTION', 'THRUPLAY',
];

// optimization_goal enum minus the read-only NONE and deprecated CLICKS —
// a curated set of creation-valid goals covering the common CRM objectives.
const OPTIMIZATION_GOALS = [
    'AD_RECALL_LIFT', 'APP_INSTALLS', 'CONVERSATIONS', 'ENGAGED_USERS',
    'EVENT_RESPONSES', 'IMPRESSIONS', 'LANDING_PAGE_VIEWS', 'LEAD_GENERATION',
    'LINK_CLICKS', 'OFFSITE_CONVERSIONS', 'PAGE_LIKES', 'POST_ENGAGEMENT',
    'QUALITY_LEAD', 'REACH', 'THRUPLAY', 'VALUE',
];

const PUBLISHER_PLATFORMS = ['facebook', 'instagram', 'threads', 'messenger', 'audience_network'];
const DEVICE_PLATFORMS = ['mobile', 'desktop'];
const FACEBOOK_POSITIONS = [
    'feed', 'right_hand_column', 'marketplace', 'video_feeds', 'story', 'search',
    'instream_video', 'facebook_reels', 'facebook_reels_overlay', 'profile_feed', 'notification',
];
const INSTAGRAM_POSITIONS = [
    'stream', 'story', 'explore', 'explore_home', 'reels', 'profile_feed',
    'ig_search', 'profile_reels',
];

// Budgets and spend caps are integer subunits of the account currency
// (e.g. paise for INR), exactly as Meta expects int64 values.
const amount = z.union([
    z.string().regex(/^\d{1,19}$/, 'must be a whole amount in currency subunits (e.g. paise for INR)'),
    z.number().int().positive().max(9e15),
]);

// ISO-8601 date-time as accepted by the Graph API datetime fields.
const dateTime = z.string().regex(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:?\d{2})?$/,
    'must be an ISO-8601 date-time like 2026-11-13T10:00:00Z'
);

const addIssue = (ctx, path, message) => ctx.addIssue({ code: 'custom', path, message });

// Targeting input as accepted from our UI, mapped to Meta's targeting spec
// by the service. geo_locations.countries is REQUIRED by the adsets edge;
// the placement rules below mirror the documented constraints of the
// Placement Targeting guide (Audience Network alone, Threads needs
// Instagram, feed-dependent positions, story pairing).
const targetingSchema = z.object({
    countries: z.array(z.string().regex(/^[A-Z]{2}$/, 'must be a 2-letter ISO country code'))
        .min(1, 'at least one country is required')
        .max(250),
    ageMin: z.number().int().min(13).max(65).optional(),
    ageMax: z.number().int().min(13).max(65).optional(),
    // Meta genders: 1 = male, 2 = female (absent = all genders).
    genders: z.array(z.union([z.literal(1), z.literal(2)])).max(2).optional(),
    customAudiences: z.array(digitsId).max(100).optional(),
    excludedCustomAudiences: z.array(digitsId).max(100).optional(),
    publisherPlatforms: z.array(z.enum(PUBLISHER_PLATFORMS)).min(1).max(PUBLISHER_PLATFORMS.length).optional(),
    devicePlatforms: z.array(z.enum(DEVICE_PLATFORMS)).min(1).max(DEVICE_PLATFORMS.length).optional(),
    facebookPositions: z.array(z.enum(FACEBOOK_POSITIONS)).min(1).max(FACEBOOK_POSITIONS.length).optional(),
    instagramPositions: z.array(z.enum(INSTAGRAM_POSITIONS)).min(1).max(INSTAGRAM_POSITIONS.length).optional(),
}).superRefine((t, ctx) => {
    if ((t.ageMin === undefined) !== (t.ageMax === undefined)) {
        addIssue(ctx, ['ageMin'], 'ageMin and ageMax must be provided together');
    }
    if (t.ageMin !== undefined && t.ageMax !== undefined && t.ageMin > t.ageMax) {
        addIssue(ctx, ['ageMax'], 'ageMax must be greater than or equal to ageMin');
    }
    const platforms = t.publisherPlatforms;
    const fb = t.facebookPositions;
    const ig = t.instagramPositions;
    if (platforms && platforms.length === 1 && platforms[0] === 'audience_network') {
        addIssue(ctx, ['publisherPlatforms'], 'Audience Network cannot be used alone — pair it with another platform');
    }
    if (platforms && platforms.includes('threads') && !platforms.includes('instagram')) {
        addIssue(ctx, ['publisherPlatforms'], 'Threads delivery requires the Instagram platform to also be selected');
    }
    if (fb && fb.length > 0) {
        if (platforms && !platforms.includes('facebook')) {
            addIssue(ctx, ['facebookPositions'], 'facebookPositions requires the facebook publisher platform');
        }
        if (fb.includes('notification') && !fb.includes('feed')) {
            addIssue(ctx, ['facebookPositions'], 'the notification placement must be combined with feed');
        }
        for (const dependent of ['marketplace', 'search', 'profile_feed']) {
            if (fb.includes(dependent) && !fb.includes('feed')) {
                addIssue(ctx, ['facebookPositions'], `the ${dependent} placement must be combined with feed`);
            }
        }
        if (fb.includes('story') && !fb.includes('feed') && !(ig && ig.includes('story'))) {
            addIssue(ctx, ['facebookPositions'], 'the story placement must be combined with facebook feed or instagram story');
        }
    }
    if (ig && ig.length > 0 && platforms && !platforms.includes('instagram')) {
        addIssue(ctx, ['instagramPositions'], 'instagramPositions requires the instagram publisher platform');
    }
});

// Create always lands PAUSED: the enum accepts both Meta statuses so the
// rejection below produces a clear, actionable message instead of a bare
// "invalid enum value" — activation only ever happens through the dedicated
// status endpoint with confirm:true.
const createCampaignSchema = {
    query: z.object({
        adAccountId: z.string().regex(/^\d+$/, 'must be a numeric ad account ID').optional(),
    }),
    body: z.object({
        name: z.string().trim().min(1).max(400),
        objective: z.enum(CAMPAIGN_OBJECTIVES),
        specialAdCategories: z.array(z.enum(SPECIAL_AD_CATEGORIES)).max(SPECIAL_AD_CATEGORIES.length).optional(),
        dailyBudget: amount.optional(),
        lifetimeBudget: amount.optional(),
        spendCap: amount.optional(),
        status: z.enum(['ACTIVE', 'PAUSED']).default('PAUSED'),
    }).superRefine((b, ctx) => {
        if (b.status !== 'PAUSED') {
            addIssue(ctx, ['status'], 'New campaigns must be created PAUSED — activation is a separate explicit action');
        }
        if (b.dailyBudget !== undefined && b.lifetimeBudget !== undefined) {
            addIssue(ctx, ['dailyBudget'], 'Provide either dailyBudget or lifetimeBudget, not both');
        }
    }),
};

const campaignParamsSchema = {
    params: z.object({ campaignId: digitsId }),
};

// Editable campaign fields (objective stays editable per the update params
// table). Clearing a budget / spend cap is not exposed: Meta documents
// specific sentinel values for that, which this phase does not ship.
const updateCampaignSchema = {
    params: z.object({ campaignId: digitsId }),
    body: z.object({
        name: z.string().trim().min(1).max(400).optional(),
        objective: z.enum(CAMPAIGN_OBJECTIVES).optional(),
        dailyBudget: amount.optional(),
        lifetimeBudget: amount.optional(),
        spendCap: amount.optional(),
    }).superRefine((b, ctx) => {
        if (Object.keys(b).length === 0) {
            addIssue(ctx, [], 'at least one field is required');
        }
        if (b.dailyBudget !== undefined && b.lifetimeBudget !== undefined) {
            addIssue(ctx, ['dailyBudget'], 'Provide either dailyBudget or lifetimeBudget, not both');
        }
    }),
};

// Activation (status ACTIVE) requires an explicit confirm flag so a stray
// payload can never start delivery — the frontend sends it only from the
// confirmation dialog.
const statusChangeSchema = (paramKey) => ({
    params: z.object({ [paramKey]: digitsId }),
    body: z.object({
        status: z.enum(['ACTIVE', 'PAUSED']),
        confirm: z.boolean().optional(),
    }).superRefine((b, ctx) => {
        if (b.status === 'ACTIVE' && b.confirm !== true) {
            addIssue(ctx, ['confirm'], 'Activating requires confirm:true — activation can start ad spend');
        }
    }),
});

const campaignStatusSchema = statusChangeSchema('campaignId');
const adsetStatusSchema = statusChangeSchema('adsetId');

const listAdSetsSchema = {
    query: z.object({
        adAccountId: z.string().regex(/^\d+$/, 'must be a numeric ad account ID').optional(),
        campaignId: digitsId.optional(),
        status: z.enum(['ACTIVE', 'PAUSED', 'ARCHIVED']).optional(),
        limit: z.string().regex(/^\d+$/).optional(),
        after: z.string().max(500).optional(),
    }),
};

// Ad set creation. daily/lifetime budget is XOR (Meta rejects both), a
// lifetime budget requires an end_time, LEAD_GENERATION requires the
// promoted Page, and creation is always PAUSED (same rule as campaigns).
const createAdSetSchema = {
    query: z.object({
        adAccountId: z.string().regex(/^\d+$/, 'must be a numeric ad account ID').optional(),
    }),
    body: z.object({
        name: z.string().trim().min(1).max(400),
        campaignId: digitsId,
        dailyBudget: amount.optional(),
        lifetimeBudget: amount.optional(),
        startTime: dateTime.optional(),
        endTime: dateTime.optional(),
        billingEvent: z.enum(BILLING_EVENTS),
        optimizationGoal: z.enum(OPTIMIZATION_GOALS),
        bidAmount: z.number().int().positive().max(1_000_000_000).optional(),
        pageId: digitsId.optional(),
        targeting: targetingSchema,
        status: z.enum(['ACTIVE', 'PAUSED']).default('PAUSED'),
    }).superRefine((b, ctx) => {
        if (b.status !== 'PAUSED') {
            addIssue(ctx, ['status'], 'New ad sets must be created PAUSED — activation is a separate explicit action');
        }
        const daily = b.dailyBudget !== undefined;
        const life = b.lifetimeBudget !== undefined;
        if (daily && life) {
            addIssue(ctx, ['dailyBudget'], 'Provide either dailyBudget or lifetimeBudget, not both');
        }
        if (!daily && !life) {
            addIssue(ctx, ['dailyBudget'], 'dailyBudget or lifetimeBudget is required');
        }
        if (life && !b.endTime) {
            addIssue(ctx, ['endTime'], 'endTime is required with lifetimeBudget');
        }
        if (b.startTime && b.endTime && Date.parse(b.startTime) >= Date.parse(b.endTime)) {
            addIssue(ctx, ['endTime'], 'endTime must be after startTime');
        }
        if (b.optimizationGoal === 'LEAD_GENERATION' && !b.pageId) {
            addIssue(ctx, ['pageId'], 'pageId (Facebook Page) is required for the LEAD_GENERATION optimization goal');
        }
    }),
};

const adsetParamsSchema = {
    params: z.object({ adsetId: digitsId }),
};

// Editable ad set fields. Campaign association, billing event semantics and
// targeting are all updatable per the adsets Updating examples; at least one
// field must change.
const updateAdSetSchema = {
    params: z.object({ adsetId: digitsId }),
    body: z.object({
        name: z.string().trim().min(1).max(400).optional(),
        dailyBudget: amount.optional(),
        lifetimeBudget: amount.optional(),
        startTime: dateTime.optional(),
        endTime: dateTime.optional(),
        billingEvent: z.enum(BILLING_EVENTS).optional(),
        optimizationGoal: z.enum(OPTIMIZATION_GOALS).optional(),
        bidAmount: z.number().int().positive().max(1_000_000_000).optional(),
        pageId: digitsId.optional(),
        targeting: targetingSchema.optional(),
    }).superRefine((b, ctx) => {
        if (Object.keys(b).length === 0) {
            addIssue(ctx, [], 'at least one field is required');
        }
        const daily = b.dailyBudget !== undefined;
        const life = b.lifetimeBudget !== undefined;
        if (daily && life) {
            addIssue(ctx, ['dailyBudget'], 'Provide either dailyBudget or lifetimeBudget, not both');
        }
        if (life && !b.endTime) {
            addIssue(ctx, ['endTime'], 'endTime is required when switching to a lifetime budget');
        }
        if (b.startTime && b.endTime && Date.parse(b.startTime) >= Date.parse(b.endTime)) {
            addIssue(ctx, ['endTime'], 'endTime must be after startTime');
        }
        if (b.optimizationGoal === 'LEAD_GENERATION' && !b.pageId) {
            addIssue(ctx, ['pageId'], 'pageId (Facebook Page) is required for the LEAD_GENERATION optimization goal');
        }
    }),
};

const listAudiencesSchema = {
    query: z.object({
        adAccountId: z.string().regex(/^\d+$/, 'must be a numeric ad account ID').optional(),
        type: z.enum(['saved', 'custom', 'all']).optional(),
        limit: z.string().regex(/^\d+$/).optional(),
        after: z.string().max(500).optional(),
    }),
};

// Blank custom audience creation (subtype CUSTOM): membership is managed in
// Ads Manager or later phases — this creates the container only.
const createAudienceSchema = {
    query: z.object({
        adAccountId: z.string().regex(/^\d+$/, 'must be a numeric ad account ID').optional(),
    }),
    body: z.object({
        name: z.string().trim().min(1).max(250),
        description: z.string().trim().max(1000).optional(),
    }),
};

const audienceParamsSchema = {
    params: z.object({ audienceId: digitsId }),
};

const updateAudienceSchema = {
    params: z.object({ audienceId: digitsId }),
    body: z.object({
        name: z.string().trim().min(1).max(250).optional(),
        description: z.string().trim().max(1000).optional(),
    }).superRefine((b, ctx) => {
        if (Object.keys(b).length === 0) {
            addIssue(ctx, [], 'at least one field is required');
        }
    }),
};

// Deletion is permanent in Meta's API (ads stop delivering). The explicit
// ?confirm=true query flag mirrors the frontend confirmation dialog.
const deleteAudienceSchema = {
    params: z.object({ audienceId: digitsId }),
    query: z.object({ confirm: z.literal('true') }),
};

// ---------------------------------------------------------------------------
// Phase 5 — creative library, ad creatives, ads and previews.
//
// Every enum below is copied from the official Marketing API reference
// (adimages / advideos / adcreatives / adgroup / ad-creative previews).
// Only creation-valid values are exposed; adding a value means citing the
// doc section it came from. Safety rules enforced here:
// - Uploads arrive base64-in-JSON (the JSON parser has no body limit), so
//   the DECODED size is checked before any decoding/network work:
//   8 MB images (documented `image_file` cap) / 50 MB videos (pragmatic cap
//   for single-request uploads — chunked upload is a later phase).
// - New ads are schema-forced to PAUSED (default + superRefine rejects any
//   other value); switching an ad ACTIVE reuses statusChangeSchema, whose
//   body requires confirm:true.
// - Every permanent deletion (image/video/creative/ad) requires
//   ?confirm=true, mirroring the mandatory-acknowledge dialog in the UI.
// ---------------------------------------------------------------------------

// ad_format enum — the subset relevant to this CRM's placements (values from
// the ad creative previews reference; full enum is much larger).
const AD_FORMATS = [
    'DESKTOP_FEED_STANDARD', 'MOBILE_FEED_STANDARD', 'RIGHT_COLUMN_STANDARD',
    'INSTAGRAM_STANDARD', 'INSTAGRAM_STORY', 'INSTAGRAM_REELS',
    'FACEBOOK_STORY_MOBILE', 'FACEBOOK_REELS_MOBILE',
];

// Placement labels + Meta's documented support class for page-post/link
// creatives: `documented` formats appear in the reference's compatibility
// list for page post ads; `extended` formats are valid ad_format enum values
// Meta accepts for other ad types — the UI surfaces them behind an explicit
// toggle and renders any provider rejection honestly instead of hiding it.
const PREVIEW_FORMAT_INFO = [
    { format: 'DESKTOP_FEED_STANDARD', label: 'Facebook Feed (desktop)', compatibility: 'documented' },
    { format: 'MOBILE_FEED_STANDARD', label: 'Facebook Feed (mobile)', compatibility: 'documented' },
    { format: 'INSTAGRAM_STANDARD', label: 'Instagram Feed', compatibility: 'documented' },
    { format: 'INSTAGRAM_STORY', label: 'Instagram Story', compatibility: 'documented' },
    { format: 'RIGHT_COLUMN_STANDARD', label: 'Facebook Right Column', compatibility: 'documented' },
    { format: 'FACEBOOK_STORY_MOBILE', label: 'Facebook Story', compatibility: 'extended' },
    { format: 'INSTAGRAM_REELS', label: 'Instagram Reels', compatibility: 'extended' },
    { format: 'FACEBOOK_REELS_MOBILE', label: 'Facebook Reels', compatibility: 'extended' },
];

// call_to_action.type enum — curated subset of the documented CTA enum,
// covering the actions a real-estate CRM ad needs (all values present in
// the adcreatives / ad-creative previews reference enum).
const CTA_TYPES = [
    'APPLY_NOW', 'BOOK_NOW', 'BUY', 'CALL_NOW', 'CHAT_NOW', 'CONTACT_US',
    'DOWNLOAD', 'GET_QUOTE', 'LEARN_MORE', 'MESSAGE_PAGE', 'ORDER_NOW',
    'SHOP_NOW', 'SIGN_UP', 'SUBSCRIBE', 'WATCH_MORE',
];

const IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/gif'];
const VIDEO_MIME_TYPES = ['video/mp4', 'video/quicktime', 'video/webm'];
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_VIDEO_BYTES = 50 * 1024 * 1024;

// Approximate decoded size of a base64 payload WITHOUT decoding it — the
// check must be cheap and must run before any Buffer work.
const decodedBase64Bytes = (value) => {
    const cleaned = String(value).replace(/^data:[^;,]*;base64,/, '').replace(/\s+/g, '');
    const padding = cleaned.endsWith('==') ? 2 : (cleaned.endsWith('=') ? 1 : 0);
    return Math.max(0, Math.floor((cleaned.length * 3) / 4) - padding);
};

const base64UploadCheck = (value, maxBytes, ctx) => {
    const cleaned = String(value).replace(/^data:[^;,]*;base64,/, '').replace(/\s+/g, '');
    if (cleaned.length === 0) {
        addIssue(ctx, ['dataBase64'], 'a non-empty base64 payload is required');
        return;
    }
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(cleaned)) {
        addIssue(ctx, ['dataBase64'], 'dataBase64 must be valid base64 (no data URL prefix issues, no binary in JSON)');
        return;
    }
    if (decodedBase64Bytes(cleaned) > maxBytes) {
        addIssue(ctx, ['dataBase64'], `decoded file must not exceed ${Math.floor(maxBytes / (1024 * 1024))} MB`);
    }
};

const fileNameSchema = z.string().trim().min(1).max(100)
    .regex(/\.[a-z0-9]{2,5}$/i, 'fileName must include its file extension (e.g. hero.jpg)');

const adAccountQuery = z.object({
    adAccountId: z.string().regex(/^\d+$/, 'must be a numeric ad account ID').optional(),
});
const pageQuery = z.object({
    limit: z.string().regex(/^\d+$/).optional(),
    after: z.string().max(500).optional(),
});

const listImagesSchema = { query: pageQuery };
const uploadImageSchema = {
    query: adAccountQuery,
    body: z.object({
        fileName: fileNameSchema,
        mimeType: z.enum(IMAGE_MIME_TYPES),
        dataBase64: z.string().min(1),
        name: z.string().trim().max(100).optional(),
    }).superRefine((b, ctx) => base64UploadCheck(b.dataBase64, MAX_IMAGE_BYTES, ctx)),
};

// Permanent: Meta only allows deleting images that are not used by a
// creative — the provider error surfaces honestly when they are in use.
const deleteImageSchema = {
    params: z.object({ hash: z.string().regex(/^[a-f0-9]{16,64}$/i, 'must be a Meta image hash') }),
    query: adAccountQuery.extend({ confirm: z.literal('true') }),
};

const listVideosSchema = { query: pageQuery };
const uploadVideoSchema = {
    query: adAccountQuery,
    body: z.object({
        fileName: fileNameSchema,
        mimeType: z.enum(VIDEO_MIME_TYPES),
        dataBase64: z.string().min(1),
        name: z.string().trim().max(255).optional(),
        description: z.string().trim().max(1000).optional(),
    }).superRefine((b, ctx) => base64UploadCheck(b.dataBase64, MAX_VIDEO_BYTES, ctx)),
};

const deleteVideoSchema = {
    params: z.object({ videoId: digitsId }),
    query: adAccountQuery.extend({ confirm: z.literal('true') }),
};

const listCreativesSchema = { query: pageQuery };
const creativeParamsSchema = { params: z.object({ creativeId: digitsId }) };

// Link creative (object_story_spec.link_data). pageId is REQUIRED: Meta
// rejects link ads that are not connected to a valid Page
// (ADPRO2__AD_MUST_HAVE_PAGE). Text limits mirror the documented creative
// limits (title ≤ 25, body ≤ 90, URL ≤ 1000 — "recommended" caps enforced
// so a payload Meta would reject never leaves this API).
// Shared creative-spec body: the real create and the unsaved-spec preview
// endpoint accept exactly the same fields (preview additionally takes a
// formats list in the QUERY — zod strips unknown body keys).
const creativeBodySchema = z.object({
    name: z.string().trim().min(1).max(100),
    mediaType: z.enum(['image', 'video']),
    imageHash: z.string().regex(/^[a-f0-9]{16,64}$/i, 'must be a Meta image hash').optional(),
    videoId: digitsId.optional(),
    pageId: digitsId,
    link: z.string().trim().url().max(1000),
    message: z.string().trim().min(1).max(90),
    headline: z.string().trim().min(1).max(25),
    description: z.string().trim().max(300).optional(),
    ctaType: z.enum(CTA_TYPES),
    ctaLink: z.string().trim().url().max(1000).optional(),
    instagramUserId: digitsId.optional(),
    urlTags: z.string().trim().max(1000).optional(),
}).superRefine((b, ctx) => {
    if (b.mediaType === 'image') {
        if (!b.imageHash) addIssue(ctx, ['imageHash'], 'imageHash is required when mediaType is "image"');
        if (b.videoId) addIssue(ctx, ['videoId'], 'videoId must be omitted when mediaType is "image"');
    } else {
        if (!b.videoId) addIssue(ctx, ['videoId'], 'videoId is required when mediaType is "video"');
        if (b.imageHash) addIssue(ctx, ['imageHash'], 'imageHash must be omitted when mediaType is "video"');
    }
});

const createCreativeSchema = {
    query: adAccountQuery,
    body: creativeBodySchema,
};

// Meta's creative node update allows ONLY name/status/adlabels/account_id —
// creative CONTENT is immutable (content edits = create a new creative).
// This phase exposes rename only; the response/docs say so explicitly.
const updateCreativeSchema = {
    params: z.object({ creativeId: digitsId }),
    body: z.object({ name: z.string().trim().min(1).max(100) }),
};

const deleteCreativeSchema = {
    params: z.object({ creativeId: digitsId }),
    query: z.object({ confirm: z.literal('true') }),
};

const listAdsSchema = {
    query: pageQuery.extend({
        campaignId: digitsId.optional(),
        adsetId: digitsId.optional(),
        status: z.enum([
            'ACTIVE', 'PAUSED', 'PENDING_REVIEW', 'DISAPPROVED', 'ARCHIVED',
            'CAMPAIGN_PAUSED', 'ADSET_PAUSED', 'WITH_ISSUES', 'IN_PROCESS',
            'PENDING_BILLING_INFO',
        ]).optional(),
    }).superRefine((q, ctx) => {
        if (q.campaignId && q.adsetId) {
            addIssue(ctx, ['adsetId'], 'campaignId and adsetId cannot be combined — adsetId is already scoped to a campaign');
        }
    }),
};

const adParamsSchema = { params: z.object({ adId: digitsId }) };

// Ad creation. Only ACTIVE/PAUSED are valid at creation and we force
// PAUSED: Meta sends new ads through review (PENDING_REVIEW) first, and
// nothing here can start delivery — activation is the /status endpoint's
// confirm:true path only.
const createAdSchema = {
    query: adAccountQuery,
    body: z.object({
        name: z.string().trim().min(1).max(400),
        adsetId: digitsId,
        creativeId: digitsId,
        status: z.enum(['ACTIVE', 'PAUSED']).default('PAUSED'),
    }).superRefine((b, ctx) => {
        if (b.status !== 'PAUSED') {
            addIssue(ctx, ['status'], 'New ads must be created PAUSED — activation is a separate explicit action');
        }
    }),
};

// Ad node update: only fields used at creation are mutable and adset_id is
// immutable — this phase exposes rename only (documented limitation).
const updateAdSchema = {
    params: z.object({ adId: digitsId }),
    body: z.object({ name: z.string().trim().min(1).max(400) }),
};

const adStatusSchema = statusChangeSchema('adId');

// Duplicate (/{ad_id}/copies): the copy is ALWAYS created with the
// documented default status_option=PAUSED — the schema allows no status
// input at all, so a duplicate can never inherit an active source.
const duplicateAdSchema = {
    params: z.object({ adId: digitsId }),
    body: z.object({ adsetId: digitsId.optional() }).optional(),
};

const deleteAdSchema = {
    params: z.object({ adId: digitsId }),
    query: z.object({ confirm: z.literal('true') }),
};

// Previews: optional comma-separated ad_format list, each entry validated
// against the documented enum (unknown formats are rejected up front so a
// typo never reaches Meta).
const formatsListRules = (q, ctx) => {
    if (!q.formats) return;
    const list = q.formats.split(',').map((s) => s.trim()).filter(Boolean);
    if (list.length === 0) {
        addIssue(ctx, ['formats'], 'formats must be a comma-separated list of ad formats');
        return;
    }
    if (list.length > AD_FORMATS.length) {
        addIssue(ctx, ['formats'], `at most ${AD_FORMATS.length} ad formats per request`);
        return;
    }
    for (const format of list) {
        if (!AD_FORMATS.includes(format)) addIssue(ctx, ['formats'], `Unknown ad format: ${format}`);
    }
};

const formatsQuery = z.object({ formats: z.string().max(600).optional() }).superRefine(formatsListRules);

const adPreviewSchema = { params: z.object({ adId: digitsId }), query: formatsQuery };
const creativePreviewSchema = { params: z.object({ creativeId: digitsId }), query: formatsQuery };

// Unsaved-spec preview (generatepreviews): same creative body + optional
// formats list in the query. Read-only endpoint (marketing:view).
const previewCreativeSpecSchema = {
    query: adAccountQuery.extend({ formats: z.string().max(600).optional() }).superRefine(formatsListRules),
    body: creativeBodySchema,
};

// ---------------------------------------------------------------------------
// Phase 6 — analytics (insights + CRM attribution). One date-range rule
// shared by every analytics endpoint (mirrors insightsQuerySchema).
// ---------------------------------------------------------------------------

const dateRangeRules = (q, ctx) => {
    if (q.datePreset && (q.since || q.until)) {
        addIssue(ctx, ['datePreset'], 'datePreset cannot be combined with since/until');
    }
    if (!q.datePreset && !q.since && !q.until) {
        addIssue(ctx, ['datePreset'], 'datePreset or since/until is required');
    }
    if ((q.since && !q.until) || (!q.since && q.until)) {
        addIssue(ctx, ['until'], 'since and until are required together');
    }
    if (q.since && q.until && q.since > q.until) {
        addIssue(ctx, ['since'], 'since must not be after until');
    }
};

const analyticsRangeSchema = {
    query: z.object({
        adAccountId: z.string().regex(/^\d+$/, 'must be a numeric ad account ID').optional(),
        datePreset: z.enum(DATE_PRESETS).optional(),
        since: isoDate.optional(),
        until: isoDate.optional(),
    }).superRefine(dateRangeRules),
};

const analyticsPerformanceSchema = {
    query: z.object({
        adAccountId: z.string().regex(/^\d+$/, 'must be a numeric ad account ID').optional(),
        datePreset: z.enum(DATE_PRESETS).optional(),
        since: isoDate.optional(),
        until: isoDate.optional(),
        level: z.enum(['account', 'campaign', 'adset', 'ad']).optional(),
        limit: z.string().regex(/^\d+$/).optional(),
        after: z.string().max(500).optional(),
    }).superRefine(dateRangeRules),
};

module.exports = {
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
    // Phase 3+4 — campaign / ad set / audience management.
    CAMPAIGN_OBJECTIVES,
    SPECIAL_AD_CATEGORIES,
    BILLING_EVENTS,
    OPTIMIZATION_GOALS,
    PUBLISHER_PLATFORMS,
    DEVICE_PLATFORMS,
    FACEBOOK_POSITIONS,
    INSTAGRAM_POSITIONS,
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
    // Phase 5 — creative library / ads / previews.
    AD_FORMATS,
    PREVIEW_FORMAT_INFO,
    CTA_TYPES,
    IMAGE_MIME_TYPES,
    VIDEO_MIME_TYPES,
    MAX_IMAGE_BYTES,
    MAX_VIDEO_BYTES,
    decodedBase64Bytes,
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
};
