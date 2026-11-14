const { AppError } = require('../utils/errors');
const { graphRequest, graphFormRequest } = require('./metaGraph');
const MetaAdsService = require('./metaAdsService');
const { audit, AUDIT_ACTIONS } = require('../utils/audit');
const {
    AD_FORMATS,
    PREVIEW_FORMAT_INFO,
    MAX_IMAGE_BYTES,
    MAX_VIDEO_BYTES,
    decodedBase64Bytes,
} = require('../validators/metaAds');

// ---------------------------------------------------------------------------
// Phase 5 — Creative library, ad creatives, ads and previews (Meta Marketing
// API). Contract and safety rules (mirrors metaCampaignService.js):
// - Same effective-config chain: settings row (db mode) authoritative, token
//   travels ONLY in the Authorization header, missing credentials fail closed
//   with 409 META_NOT_CONFIGURED.
// - EVERY ad is created status=PAUSED (schema-enforced twice) after Meta's
//   own execution_options validate_only dry-run. Activation happens solely
//   through setAdStatus, which the router only reaches with confirm:true.
//   Duplicate copies are forced to the documented status_option=PAUSED
//   default explicitly — a copy can never inherit an active source.
// - Creative CONTENT is immutable on Meta's node (only name/status/adlabels/
//   account_id are updatable), so content edits = new creative; this phase
//   exposes rename only and says so in every response.
// - Uploads: images via the documented `bytes` (base64) param; videos via
//   multipart form (`source` file). Decoded size is re-checked here before
//   any network work (defense in depth behind the validator).
// - Previews read the provider's iframe HTML (valid 24h) and render per
//   format; a failed format carries Meta's honest error — never a fabricated
//   preview. Documented page-post compatibility drives the default format
//   set; `extended` enum formats are opt-in at the API layer.
// - Every mutation writes an AuditLog row (existing table, no new
//   persistence): Meta remains the source of truth for all ad objects.
//   No base64 payloads, tokens or raw creative bodies are ever audited.
// ---------------------------------------------------------------------------

const IMAGE_LIST_FIELDS = 'id,hash,url,url_128,height,width,name,created_time,status,creatives';
// Conservative Video node field set — the generic video node reference was
// not retrievable this phase, so only fields implied by the advideos edge
// (title is its documented name filter) are requested. Live-unverified.
const VIDEO_LIST_FIELDS = 'id,title,description,length,created_time';
const CREATIVE_FIELDS = 'id,name,status,body,title,call_to_action_type,image_hash,object_story_spec,thumbnail_url,video_id,instagram_user_id,object_url,object_type';
const AD_FIELDS = 'id,name,adset_id,campaign_id,status,configured_status,effective_status,creative,created_time,updated_time,preview_shareable_link';

// Placements Meta documents as compatible with page-post/link creatives —
// the default preview set. The remaining AD_FORMATS values are valid enum
// entries for other ad types (`extended`) and are only fetched when asked.
const DEFAULT_PREVIEW_FORMATS = [
    'DESKTOP_FEED_STANDARD', 'MOBILE_FEED_STANDARD', 'INSTAGRAM_STANDARD',
    'INSTAGRAM_STORY', 'RIGHT_COLUMN_STANDARD',
];

// Shared connection resolution (same rule as metaCampaignService.js).
async function conn(organizationId, adAccountId, { requireAccount = true } = {}) {
    const eff = await MetaAdsService.effectiveConfig(organizationId);
    const token = MetaAdsService.requireToken(eff);
    const accountId = requireAccount ? MetaAdsService.requireAdAccount(eff, adAccountId) : null;
    return { eff, token, accountId };
}

// ---------------------------------------------------------------------------
// Mapping — camelCase identifiers, counts, statuses and URLs only. Meta
// omits → null; nothing is invented or defaulted into fake data.
// ---------------------------------------------------------------------------

const mapImage = (img) => ({
    hash: img.hash || null,
    id: img.id ? String(img.id) : null,
    name: img.name || null,
    url: img.url || null,
    url128: img.url_128 || null,
    width: img.width ?? null,
    height: img.height ?? null,
    status: img.status || null,
    createdTime: img.created_time || null,
    usedInCreatives: Array.isArray(img.creatives) ? img.creatives.map(String) : [],
});

const mapVideo = (video) => ({
    id: video.id ? String(video.id) : null,
    title: video.title || null,
    description: video.description || null,
    lengthSeconds: video.length ?? null,
    createdTime: video.created_time || null,
});

// object_story_spec arrives as an object or a JSON string depending on the
// read path — normalize defensively; unparseable content becomes null
// (honest) rather than a half-fabricated shape.
function parseStorySpec(spec) {
    if (!spec) return null;
    if (typeof spec === 'string') {
        try {
            return JSON.parse(spec);
        } catch {
            return null;
        }
    }
    return typeof spec === 'object' ? spec : null;
}

const mapCreative = (creative) => {
    const spec = parseStorySpec(creative.object_story_spec);
    const linkData = (spec && spec.link_data) || {};
    const cta = linkData.call_to_action || {};
    return {
        id: String(creative.id),
        name: creative.name || null,
        status: creative.status || null,
        // Display fields: flat node fields when present, otherwise the
        // story-spec content the builder wrote.
        body: creative.body || linkData.message || null,
        title: creative.title || linkData.name || null,
        headline: creative.title || linkData.name || null,
        description: linkData.description || null,
        link: linkData.link || null,
        callToActionType: creative.call_to_action_type || cta.type || null,
        ctaLink: (cta.value && cta.value.link) || null,
        imageHash: creative.image_hash || linkData.image_hash || null,
        videoId: (creative.video_id || linkData.video_id) ? String(creative.video_id || linkData.video_id) : null,
        mediaType: (creative.video_id || linkData.video_id) ? 'video' : 'image',
        pageId: (spec && spec.page_id) ? String(spec.page_id) : null,
        instagramUserId: creative.instagram_user_id ? String(creative.instagram_user_id) : null,
        thumbnailUrl: creative.thumbnail_url || null,
        objectUrl: creative.object_url || null,
        objectType: creative.object_type || null,
        objectStorySpec: spec,
    };
};

const mapAd = (ad) => {
    const creative = ad.creative && typeof ad.creative === 'object' ? ad.creative : null;
    return {
        id: String(ad.id),
        name: ad.name || null,
        adsetId: ad.adset_id ? String(ad.adset_id) : null,
        campaignId: ad.campaign_id ? String(ad.campaign_id) : null,
        status: ad.status || null,
        configuredStatus: ad.configured_status || null,
        effectiveStatus: ad.effective_status || null,
        creativeId: creative && creative.id ? String(creative.id) : null,
        previewShareableLink: ad.preview_shareable_link || null,
        createdTime: ad.created_time || null,
        updatedTime: ad.updated_time || null,
    };
};

// ---------------------------------------------------------------------------
// Upload helpers.
// ---------------------------------------------------------------------------

const cleanBase64 = (value) => String(value).replace(/^data:[^;,]*;base64,/, '').replace(/\s+/g, '');

// Defense in depth: the validator already rejected oversized payloads, but
// the decoded size is re-checked here (service may be called directly).
function assertUploadSize(dataBase64, maxBytes) {
    const cleaned = cleanBase64(dataBase64);
    if (decodedBase64Bytes(cleaned) > maxBytes) {
        throw new AppError(`decoded file must not exceed ${Math.floor(maxBytes / (1024 * 1024))} MB`, 400, 'VALIDATION_ERROR');
    }
    return cleaned;
}

// Image upload returns Map{fileName: {hash, url, url_128, url_256, height,
// width, name}} per the reference — find the first struct entry; a response
// without a hash is a provider failure, never a silent success.
function extractImageUpload(data) {
    if (!data || typeof data !== 'object') return null;
    if (typeof data.hash === 'string') return data;
    for (const value of Object.values(data)) {
        if (value && typeof value === 'object' && typeof value.hash === 'string') return value;
    }
    return null;
}

// ---------------------------------------------------------------------------
// Preview helpers.
// ---------------------------------------------------------------------------

// Response shape per the reference: { data: [ { body: "<iframe …>" } ] } —
// tolerate `html` as well, but never invent content when Meta returns none.
function extractPreviewBody(data) {
    if (Array.isArray(data && data.data)) {
        const row = data.data.find((entry) => entry && (typeof entry.body === 'string' || typeof entry.html === 'string'));
        if (row) return row.body || row.html;
    }
    if (data && typeof data.body === 'string') return data.body;
    if (data && typeof data.html === 'string') return data.html;
    return null;
}

function normalizeFormats(formats) {
    const requested = Array.isArray(formats) && formats.length > 0 ? formats : DEFAULT_PREVIEW_FORMATS;
    return [...new Set(requested)].filter((f) => AD_FORMATS.includes(f));
}

const formatInfo = (list) => PREVIEW_FORMAT_INFO.filter((entry) => list.includes(entry.format));

// Runs one preview fetch per format; partial failures carry Meta's error
// per format. If EVERY format fails, the first real error is thrown so an
// auth/permission problem surfaces as a failed request, not a wall of
// per-format errors.
async function runPreviewFetches(list, fetchOne) {
    const errors = [];
    const previews = await Promise.all(list.map(async (format) => {
        try {
            const html = await fetchOne(format);
            if (!html) {
                return { format, source: 'meta', html: null, validHours: 24, error: 'Meta returned no preview iframe for this format' };
            }
            return { format, source: 'meta', html, validHours: 24, error: null };
        } catch (err) {
            errors.push(err);
            return { format, source: 'meta', html: null, validHours: 24, error: (err && err.message) || 'Meta preview failed', code: (err && err.code) || null };
        }
    }));
    if (errors.length === list.length && errors.length > 0) throw errors[0];
    return previews;
}

// UI targeting input → object_story_spec (shared by create + unsaved
// preview so both paths send byte-identical content). page_id is required
// by Meta for link ads (ADPRO2__AD_MUST_HAVE_PAGE) — schema-enforced.
function buildStorySpec(input) {
    const linkData = {
        link: input.link,
        message: input.message,
        name: input.headline,
        call_to_action: {
            type: input.ctaType,
            value: { link: input.ctaLink || input.link },
        },
    };
    if (input.description) linkData.description = input.description;
    if (input.mediaType === 'video') linkData.video_id = String(input.videoId);
    else linkData.image_hash = String(input.imageHash);
    return { page_id: String(input.pageId), link_data: linkData };
}

class MetaCreativeService {
    // ------------------------------------------------------------------
    // Media library — images.
    // ------------------------------------------------------------------

    static async listImages({ organizationId, adAccountId, limit = 50, after } = {}) {
        const { eff, token, accountId } = await conn(organizationId, adAccountId);
        const data = await graphRequest({
            path: `act_${accountId}/adimages`,
            params: {
                fields: IMAGE_LIST_FIELDS,
                summary: 'total_count',
                limit: Math.min(Math.max(parseInt(limit, 10) || 50, 1), 100),
                ...(after ? { after } : {}),
            },
            token,
            version: eff.graphVersion,
        });
        const items = Array.isArray(data.data) ? data.data.map(mapImage) : [];
        return {
            adAccountId: accountId,
            items,
            totalCount: data.summary && data.summary.total_count !== undefined ? data.summary.total_count : null,
            paging: data.paging || null,
        };
    }

    // Documented params only: `bytes` (base64 UTF-8). The filename carries
    // the extension (schema-enforced); Meta derives type from content.
    static async uploadImage({ organizationId, userId, adAccountId, fileName, mimeType, dataBase64, name } = {}) {
        const { eff, token, accountId } = await conn(organizationId, adAccountId);
        const bytes = assertUploadSize(dataBase64, MAX_IMAGE_BYTES);
        const created = await graphRequest({
            path: `act_${accountId}/adimages`,
            method: 'POST',
            body: { bytes },
            token,
            version: eff.graphVersion,
            timeoutMs: 60000,
        });
        const entry = extractImageUpload(created);
        if (!entry || !entry.hash) {
            throw new AppError('Meta did not return an image hash for this upload', 502, 'META_API_ERROR');
        }
        const image = {
            hash: String(entry.hash),
            id: null,
            name: entry.name || name || fileName || null,
            url: entry.url || null,
            url128: entry.url_128 || null,
            width: entry.width ?? null,
            height: entry.height ?? null,
            status: null,
            createdTime: null,
            usedInCreatives: [],
        };
        await audit(organizationId, userId || null, AUDIT_ACTIONS.META_MEDIA_UPLOADED, 'MetaAdImage', image.hash, {
            mediaType: 'image',
            fileName: fileName || null,
            mimeType: mimeType || null,
            width: image.width,
            height: image.height,
        });
        return image;
    }

    // Permanent in Meta's API and only valid for images NOT used by a
    // creative — the provider's error surfaces honestly when they are.
    // Route only reaches this with ?confirm=true.
    static async deleteImage({ organizationId, userId, adAccountId, hash } = {}) {
        const { eff, token, accountId } = await conn(organizationId, adAccountId);
        await graphRequest({
            path: `act_${accountId}/adimages`,
            method: 'DELETE',
            params: { hash: String(hash) },
            token,
            version: eff.graphVersion,
        });
        await audit(organizationId, userId || null, AUDIT_ACTIONS.META_MEDIA_DELETED, 'MetaAdImage', String(hash), {
            mediaType: 'image',
        });
        return { hash: String(hash), deleted: true };
    }

    // ------------------------------------------------------------------
    // Media library — videos (multipart upload, documented `source` file
    // param; single-request upload — Meta's chunked upload_phase flow is a
    // later phase, hence the 50 MB cap).
    // ------------------------------------------------------------------

    static async listVideos({ organizationId, adAccountId, limit = 50, after } = {}) {
        const { eff, token, accountId } = await conn(organizationId, adAccountId);
        const data = await graphRequest({
            path: `act_${accountId}/advideos`,
            params: {
                fields: VIDEO_LIST_FIELDS,
                summary: 'total_count',
                limit: Math.min(Math.max(parseInt(limit, 10) || 50, 1), 100),
                ...(after ? { after } : {}),
            },
            token,
            version: eff.graphVersion,
        });
        const items = Array.isArray(data.data) ? data.data.map(mapVideo) : [];
        return {
            adAccountId: accountId,
            items,
            totalCount: data.summary && data.summary.total_count !== undefined ? data.summary.total_count : null,
            paging: data.paging || null,
        };
    }

    static async uploadVideo({ organizationId, userId, adAccountId, fileName, mimeType, dataBase64, name, description } = {}) {
        const { eff, token, accountId } = await conn(organizationId, adAccountId);
        const cleaned = assertUploadSize(dataBase64, MAX_VIDEO_BYTES);
        const buffer = Buffer.from(cleaned, 'base64');
        if (buffer.length === 0) {
            throw new AppError('Decoded video is empty', 400, 'VALIDATION_ERROR');
        }
        const form = new FormData();
        form.append('source', new Blob([buffer], { type: mimeType }), fileName);
        form.append('name', name || fileName);
        if (description) form.append('description', description);
        const created = await graphFormRequest({
            path: `act_${accountId}/advideos`,
            method: 'POST',
            form,
            token,
            version: eff.graphVersion,
            timeoutMs: 180000,
        });
        const videoId = created && (created.id || created.video_id);
        if (!videoId) {
            throw new AppError('Meta did not return a video id for this upload', 502, 'META_API_ERROR');
        }
        await audit(organizationId, userId || null, AUDIT_ACTIONS.META_MEDIA_UPLOADED, 'MetaAdVideo', String(videoId), {
            mediaType: 'video',
            fileName: fileName || null,
            mimeType: mimeType || null,
            bytes: buffer.length,
        });
        return {
            id: String(videoId),
            videoId: created.video_id ? String(created.video_id) : String(videoId),
            title: name || fileName || null,
            description: description || null,
            lengthSeconds: null,
            createdTime: null,
        };
    }

    // Permanent. Route only reaches this with ?confirm=true.
    static async deleteVideo({ organizationId, userId, adAccountId, videoId } = {}) {
        const { eff, token, accountId } = await conn(organizationId, adAccountId);
        await graphRequest({
            path: `act_${accountId}/advideos`,
            method: 'DELETE',
            params: { video_id: String(videoId) },
            token,
            version: eff.graphVersion,
        });
        await audit(organizationId, userId || null, AUDIT_ACTIONS.META_MEDIA_DELETED, 'MetaAdVideo', String(videoId), {
            mediaType: 'video',
        });
        return { id: String(videoId), deleted: true };
    }

    // ------------------------------------------------------------------
    // Creatives — list / detail / create (validate_only pre-flight) /
    // rename / delete. Content is immutable in Meta's node API, so content
    // edits are NOT offered: a new creative must be built instead.
    // ------------------------------------------------------------------

    static async listCreatives({ organizationId, adAccountId, limit = 50, after } = {}) {
        const { eff, token, accountId } = await conn(organizationId, adAccountId);
        const data = await graphRequest({
            path: `act_${accountId}/adcreatives`,
            params: {
                fields: CREATIVE_FIELDS,
                summary: 'total_count',
                limit: Math.min(Math.max(parseInt(limit, 10) || 50, 1), 100),
                ...(after ? { after } : {}),
            },
            token,
            version: eff.graphVersion,
        });
        const items = Array.isArray(data.data) ? data.data.map(mapCreative) : [];
        return {
            adAccountId: accountId,
            items,
            totalCount: data.summary && data.summary.total_count !== undefined ? data.summary.total_count : null,
            paging: data.paging || null,
        };
    }

    static async getCreative({ organizationId, creativeId } = {}) {
        const { eff, token } = await conn(organizationId, null, { requireAccount: false });
        const data = await graphRequest({
            path: String(creativeId),
            params: { fields: CREATIVE_FIELDS },
            token,
            version: eff.graphVersion,
        });
        return mapCreative(data);
    }

    // Two-step create: Meta's validate_only dry-run first (full payload
    // validation, zero mutation), then the real create. dryRun stops after
    // validation and never audits (the builder's explicit "Validate"
    // action).
    static async createCreative({ organizationId, userId, adAccountId, input = {}, dryRun = false } = {}) {
        const { eff, token, accountId } = await conn(organizationId, adAccountId);
        const spec = buildStorySpec(input);
        const body = { name: input.name, object_story_spec: JSON.stringify(spec) };
        if (input.instagramUserId) body.instagram_user_id = String(input.instagramUserId);
        if (input.urlTags) body.url_tags = input.urlTags;

        await graphRequest({
            path: `act_${accountId}/adcreatives`,
            method: 'POST',
            body: { ...body, execution_options: ['validate_only'] },
            token,
            version: eff.graphVersion,
        });
        if (dryRun) return { ok: true, dryRun: true };

        const created = await graphRequest({
            path: `act_${accountId}/adcreatives`,
            method: 'POST',
            body,
            token,
            version: eff.graphVersion,
        });
        const id = created && created.id ? String(created.id) : null;
        if (!id) {
            throw new AppError('Meta did not return a creative id', 502, 'META_API_ERROR');
        }
        await audit(organizationId, userId || null, AUDIT_ACTIONS.META_CREATIVE_CREATED, 'MetaAdCreative', id, {
            name: input.name || null,
            mediaType: input.mediaType || null,
            pageId: input.pageId || null,
            ctaType: input.ctaType || null,
        });
        return {
            id,
            name: input.name || null,
            status: created.status || null,
            mediaType: input.mediaType || null,
            pageId: String(input.pageId),
            imageHash: input.mediaType === 'image' ? (input.imageHash || null) : null,
            videoId: input.mediaType === 'video' ? String(input.videoId) : null,
            link: input.link || null,
            message: input.message || null,
            headline: input.headline || null,
            callToActionType: input.ctaType || null,
            instagramUserId: input.instagramUserId ? String(input.instagramUserId) : null,
        };
    }

    static async updateCreative({ organizationId, userId, creativeId, input = {} } = {}) {
        const { eff, token } = await conn(organizationId, null, { requireAccount: false });
        if (!input.name) {
            throw new AppError('No creative fields to update (only name is updatable)', 400, 'VALIDATION_ERROR');
        }
        await graphRequest({
            path: String(creativeId),
            method: 'POST',
            body: { name: input.name },
            token,
            version: eff.graphVersion,
        });
        await audit(organizationId, userId || null, AUDIT_ACTIONS.META_CREATIVE_UPDATED, 'MetaAdCreative', String(creativeId), {
            fields: ['name'],
        });
        return {
            id: String(creativeId),
            updated: ['name'],
            contentEditable: false,
            note: 'Creative content is immutable in Meta\'s API — build a new creative to change content.',
        };
    }

    // Permanent in Meta's API. Route only reaches this with ?confirm=true.
    static async deleteCreative({ organizationId, userId, creativeId } = {}) {
        const { eff, token } = await conn(organizationId, null, { requireAccount: false });
        await graphRequest({
            path: String(creativeId),
            method: 'DELETE',
            token,
            version: eff.graphVersion,
        });
        await audit(organizationId, userId || null, AUDIT_ACTIONS.META_CREATIVE_DELETED, 'MetaAdCreative', String(creativeId), {});
        return { id: String(creativeId), deleted: true };
    }

    // ------------------------------------------------------------------
    // Ads — list / detail / create (PAUSED + validate_only) / rename /
    // status / duplicate (forced PAUSED) / delete.
    // ------------------------------------------------------------------

    // Account-scoped list, or the documented campaign/adset ads edges when a
    // filter id is given (the account ads edge documents no `filtering`
    // param — no unverifiable cross-edge filtering is attempted).
    static async listAds({ organizationId, adAccountId, campaignId, adsetId, status, limit = 50, after } = {}) {
        const { eff, token, accountId } = await conn(organizationId, adAccountId, {
            requireAccount: !campaignId && !adsetId,
        });
        const path = adsetId
            ? `${adsetId}/ads`
            : (campaignId ? `${campaignId}/ads` : `act_${accountId}/ads`);
        const params = {
            fields: AD_FIELDS,
            summary: 'total_count',
            limit: Math.min(Math.max(parseInt(limit, 10) || 50, 1), 100),
            ...(after ? { after } : {}),
            ...(status ? { effective_status: JSON.stringify([status]) } : {}),
        };
        const data = await graphRequest({ path, params, token, version: eff.graphVersion });
        const items = Array.isArray(data.data) ? data.data.map(mapAd) : [];
        return {
            adAccountId: accountId || null,
            campaignId: campaignId ? String(campaignId) : null,
            adsetId: adsetId ? String(adsetId) : null,
            items,
            totalCount: data.summary && data.summary.total_count !== undefined ? data.summary.total_count : null,
            paging: data.paging || null,
        };
    }

    static async getAd({ organizationId, adId } = {}) {
        const { eff, token } = await conn(organizationId, null, { requireAccount: false });
        const data = await graphRequest({
            path: String(adId),
            params: { fields: AD_FIELDS },
            token,
            version: eff.graphVersion,
        });
        return mapAd(data);
    }

    // Two-step create: Meta's validate_only + synchronous_ad_review dry-run
    // first (field validation + Ads Integrity checks, zero mutation), then
    // the real create with status=PAUSED. dryRun stops after validation.
    static async createAd({ organizationId, userId, adAccountId, input = {}, dryRun = false } = {}) {
        const { eff, token, accountId } = await conn(organizationId, adAccountId);
        const body = {
            name: input.name,
            adset_id: String(input.adsetId),
            creative: JSON.stringify({ creative_id: String(input.creativeId) }),
            status: 'PAUSED',
        };
        await graphRequest({
            path: `act_${accountId}/ads`,
            method: 'POST',
            body: { ...body, execution_options: ['validate_only', 'synchronous_ad_review'] },
            token,
            version: eff.graphVersion,
        });
        if (dryRun) return { ok: true, dryRun: true };

        const created = await graphRequest({
            path: `act_${accountId}/ads`,
            method: 'POST',
            body,
            token,
            version: eff.graphVersion,
        });
        const id = created && created.id ? String(created.id) : null;
        if (!id) {
            throw new AppError('Meta did not return an ad id', 502, 'META_API_ERROR');
        }
        await audit(organizationId, userId || null, AUDIT_ACTIONS.META_AD_CREATED, 'MetaAd', id, {
            name: input.name || null,
            adsetId: String(input.adsetId),
            creativeId: String(input.creativeId),
            status: 'PAUSED',
        });
        return {
            id,
            name: input.name || null,
            adsetId: String(input.adsetId),
            creativeId: String(input.creativeId),
            status: 'PAUSED',
            // New ads enter Meta's ad review first — reported honestly, the
            // caller must re-read the ad for the final effective_status.
            nextStep: 'PENDING_REVIEW',
            success: created && created.success !== undefined ? Boolean(created.success) : null,
        };
    }

    static async updateAd({ organizationId, userId, adId, input = {} } = {}) {
        const { eff, token } = await conn(organizationId, null, { requireAccount: false });
        if (!input.name) {
            throw new AppError('No ad fields to update (only name is updatable)', 400, 'VALIDATION_ERROR');
        }
        await graphRequest({
            path: String(adId),
            method: 'POST',
            body: { name: input.name },
            token,
            version: eff.graphVersion,
        });
        await audit(organizationId, userId || null, AUDIT_ACTIONS.META_AD_UPDATED, 'MetaAd', String(adId), {
            fields: ['name'],
        });
        return {
            id: String(adId),
            updated: ['name'],
            note: 'adset_id is immutable in Meta\'s API; creative changes are not exposed in this phase.',
        };
    }

    // Activation is the only path that can start spend: the route only
    // reaches this with status ACTIVE + confirm:true (validator-enforced).
    static async setAdStatus({ organizationId, userId, adId, status } = {}) {
        const { eff, token } = await conn(organizationId, null, { requireAccount: false });
        await graphRequest({
            path: String(adId),
            method: 'POST',
            body: { status },
            token,
            version: eff.graphVersion,
        });
        await audit(organizationId, userId || null, AUDIT_ACTIONS.META_AD_STATUS, 'MetaAd', String(adId), { status });
        return { id: String(adId), status };
    }

    // Documented /{ad_id}/copies edge. status_option is FORCED to the
    // documented PAUSED default explicitly so a copy can never inherit an
    // active source; Meta's default rename ("- Copy") applies and the copy
    // can be renamed afterwards via updateAd.
    static async duplicateAd({ organizationId, userId, adId, adsetId } = {}) {
        const { eff, token } = await conn(organizationId, null, { requireAccount: false });
        const body = { status_option: 'PAUSED' };
        if (adsetId) body.adset_id = String(adsetId);
        const created = await graphRequest({
            path: `${adId}/copies`,
            method: 'POST',
            body,
            token,
            version: eff.graphVersion,
        });
        const copiedId = created && created.copied_ad_id ? String(created.copied_ad_id) : null;
        if (!copiedId) {
            throw new AppError('Meta did not return a copied ad id', 502, 'META_API_ERROR');
        }
        await audit(organizationId, userId || null, AUDIT_ACTIONS.META_AD_DUPLICATED, 'MetaAd', copiedId, {
            sourceAdId: String(adId),
            adsetId: adsetId ? String(adsetId) : null,
            status: 'PAUSED',
        });
        return {
            id: copiedId,
            sourceAdId: String(adId),
            adsetId: adsetId ? String(adsetId) : null,
            status: 'PAUSED',
            success: true,
        };
    }

    // Permanent in Meta's API (delivery stops). Route only reaches this
    // with ?confirm=true.
    static async deleteAd({ organizationId, userId, adId } = {}) {
        const { eff, token } = await conn(organizationId, null, { requireAccount: false });
        await graphRequest({
            path: String(adId),
            method: 'DELETE',
            token,
            version: eff.graphVersion,
        });
        await audit(organizationId, userId || null, AUDIT_ACTIONS.META_AD_DELETED, 'MetaAd', String(adId), {});
        return { id: String(adId), deleted: true };
    }

    // ------------------------------------------------------------------
    // Previews — provider iframe HTML per placement (valid 24 hours).
    // The frontend extracts the iframe src and renders it sandboxed; raw
    // provider HTML is never injected into the DOM.
    // ------------------------------------------------------------------

    static async getAdPreviews({ organizationId, adId, formats } = {}) {
        const { eff, token } = await conn(organizationId, null, { requireAccount: false });
        const list = normalizeFormats(formats);
        const previews = await runPreviewFetches(list, async (format) => {
            const data = await graphRequest({
                path: `${adId}/previews`,
                params: { ad_format: format },
                token,
                version: eff.graphVersion,
            });
            return extractPreviewBody(data);
        });
        return {
            source: 'meta',
            validHours: 24,
            formats: formatInfo(list),
            previews,
        };
    }

    static async getCreativePreviews({ organizationId, creativeId, formats } = {}) {
        const { eff, token } = await conn(organizationId, null, { requireAccount: false });
        const list = normalizeFormats(formats);
        const previews = await runPreviewFetches(list, async (format) => {
            const data = await graphRequest({
                path: `${creativeId}/previews`,
                params: { ad_format: format },
                token,
                version: eff.graphVersion,
            });
            return extractPreviewBody(data);
        });
        return {
            source: 'meta',
            validHours: 24,
            formats: formatInfo(list),
            previews,
        };
    }

    // Preview of an UNSAVED creative via the documented
    // act_{id}/generatepreviews edge — the exact spec object_story_spec the
    // builder would submit (same buildStorySpec as create, so what you
    // preview is byte-identical to what you would save).
    static async previewCreativeSpec({ organizationId, adAccountId, input = {}, formats } = {}) {
        const { eff, token, accountId } = await conn(organizationId, adAccountId);
        const spec = buildStorySpec(input);
        const creativeParam = JSON.stringify({ object_story_spec: spec });
        const list = normalizeFormats(formats);
        const previews = await runPreviewFetches(list, async (format) => {
            const data = await graphRequest({
                path: `act_${accountId}/generatepreviews`,
                params: { creative: creativeParam, ad_format: format },
                token,
                version: eff.graphVersion,
            });
            return extractPreviewBody(data);
        });
        return {
            source: 'meta',
            validHours: 24,
            unsaved: true,
            formats: formatInfo(list),
            previews,
        };
    }
}

module.exports = MetaCreativeService;
