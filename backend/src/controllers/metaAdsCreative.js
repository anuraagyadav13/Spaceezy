const { asyncHandler } = require('../utils/errors');
const MetaCreativeService = require('../services/metaCreativeService');

// ---------------------------------------------------------------------------
// Phase 5 — Creative Library (media + ad creatives), Ad Management and Ad
// Preview. Every handler scopes to req.auth.organizationId (single-company
// convention) and passes the caller's userId for audit rows. Reads are
// marketing:view, mutations marketing:manage (enforced in routes). Safety
// invariants live in the schemas/service: uploads are size-gated before
// decode, creatives/ads are created through a Meta validate_only dry-run
// first, ads are forced PAUSED at creation, activation only via the
// /status endpoint (body confirm:true) and every permanent delete requires
// ?confirm=true. Responses carry Meta identifiers, statuses, mapped fields
// and honest per-format preview errors — never credentials or tokens.
// ---------------------------------------------------------------------------

const listImages = asyncHandler(async (req, res) => {
    const data = await MetaCreativeService.listImages({
        organizationId: req.auth.organizationId,
        adAccountId: req.query.adAccountId,
        limit: req.query.limit,
        after: req.query.after,
    });
    res.status(200).json({ success: true, data, message: 'Images fetched' });
});

const uploadImage = asyncHandler(async (req, res) => {
    const data = await MetaCreativeService.uploadImage({
        organizationId: req.auth.organizationId,
        userId: req.auth.userId,
        adAccountId: req.query.adAccountId,
        fileName: req.body.fileName,
        mimeType: req.body.mimeType,
        dataBase64: req.body.dataBase64,
        name: req.body.name,
    });
    res.status(201).json({ success: true, data, message: 'Image uploaded to Meta' });
});

const deleteImage = asyncHandler(async (req, res) => {
    const data = await MetaCreativeService.deleteImage({
        organizationId: req.auth.organizationId,
        userId: req.auth.userId,
        adAccountId: req.query.adAccountId,
        hash: req.params.hash,
    });
    res.status(200).json({ success: true, data, message: 'Image deleted from Meta' });
});

const listVideos = asyncHandler(async (req, res) => {
    const data = await MetaCreativeService.listVideos({
        organizationId: req.auth.organizationId,
        adAccountId: req.query.adAccountId,
        limit: req.query.limit,
        after: req.query.after,
    });
    res.status(200).json({ success: true, data, message: 'Videos fetched' });
});

const uploadVideo = asyncHandler(async (req, res) => {
    const data = await MetaCreativeService.uploadVideo({
        organizationId: req.auth.organizationId,
        userId: req.auth.userId,
        adAccountId: req.query.adAccountId,
        fileName: req.body.fileName,
        mimeType: req.body.mimeType,
        dataBase64: req.body.dataBase64,
        name: req.body.name,
        description: req.body.description,
    });
    res.status(201).json({ success: true, data, message: 'Video uploaded to Meta' });
});

const deleteVideo = asyncHandler(async (req, res) => {
    const data = await MetaCreativeService.deleteVideo({
        organizationId: req.auth.organizationId,
        userId: req.auth.userId,
        adAccountId: req.query.adAccountId,
        videoId: req.params.videoId,
    });
    res.status(200).json({ success: true, data, message: 'Video deleted from Meta' });
});

const listCreatives = asyncHandler(async (req, res) => {
    const data = await MetaCreativeService.listCreatives({
        organizationId: req.auth.organizationId,
        adAccountId: req.query.adAccountId,
        limit: req.query.limit,
        after: req.query.after,
    });
    res.status(200).json({ success: true, data, message: 'Creatives fetched' });
});

const getCreative = asyncHandler(async (req, res) => {
    const data = await MetaCreativeService.getCreative({
        organizationId: req.auth.organizationId,
        creativeId: req.params.creativeId,
    });
    res.status(200).json({ success: true, data, message: 'Creative fetched' });
});

// Explicit pre-flight: full Meta validation, no mutation, no audit row.
const validateCreative = asyncHandler(async (req, res) => {
    const data = await MetaCreativeService.createCreative({
        organizationId: req.auth.organizationId,
        adAccountId: req.query.adAccountId,
        input: req.body,
        dryRun: true,
    });
    res.status(200).json({ success: true, data, message: 'Creative validated by Meta — nothing was saved' });
});

// Real create — runs its own validate_only pass first (service), lands
// without any delivery, audited with the caller's userId.
const createCreative = asyncHandler(async (req, res) => {
    const data = await MetaCreativeService.createCreative({
        organizationId: req.auth.organizationId,
        userId: req.auth.userId,
        adAccountId: req.query.adAccountId,
        input: req.body,
    });
    res.status(201).json({ success: true, data, message: 'Creative created' });
});

// Rename only — Meta creative content is immutable (documented limitation).
const updateCreative = asyncHandler(async (req, res) => {
    const data = await MetaCreativeService.updateCreative({
        organizationId: req.auth.organizationId,
        userId: req.auth.userId,
        creativeId: req.params.creativeId,
        input: req.body,
    });
    res.status(200).json({ success: true, data, message: 'Creative renamed' });
});

const deleteCreative = asyncHandler(async (req, res) => {
    const data = await MetaCreativeService.deleteCreative({
        organizationId: req.auth.organizationId,
        userId: req.auth.userId,
        creativeId: req.params.creativeId,
    });
    res.status(200).json({ success: true, data, message: 'Creative deleted' });
});

const listAds = asyncHandler(async (req, res) => {
    const data = await MetaCreativeService.listAds({
        organizationId: req.auth.organizationId,
        adAccountId: req.query.adAccountId,
        campaignId: req.query.campaignId,
        adsetId: req.query.adsetId,
        status: req.query.status,
        limit: req.query.limit,
        after: req.query.after,
    });
    res.status(200).json({ success: true, data, message: 'Ads fetched' });
});

const getAd = asyncHandler(async (req, res) => {
    const data = await MetaCreativeService.getAd({
        organizationId: req.auth.organizationId,
        adId: req.params.adId,
    });
    res.status(200).json({ success: true, data, message: 'Ad fetched' });
});

const validateAd = asyncHandler(async (req, res) => {
    const data = await MetaCreativeService.createAd({
        organizationId: req.auth.organizationId,
        adAccountId: req.query.adAccountId,
        input: req.body,
        dryRun: true,
    });
    res.status(200).json({ success: true, data, message: 'Ad validated by Meta — nothing was saved' });
});

// The schema forces status PAUSED; the service adds validate_only +
// synchronous_ad_review before the real write. New ads go to Meta's review
// queue — never live delivery.
const createAd = asyncHandler(async (req, res) => {
    const data = await MetaCreativeService.createAd({
        organizationId: req.auth.organizationId,
        userId: req.auth.userId,
        adAccountId: req.query.adAccountId,
        input: req.body,
    });
    res.status(201).json({ success: true, data, message: 'Ad created in PAUSED state' });
});

// Rename only (adset_id is immutable at the node level).
const updateAd = asyncHandler(async (req, res) => {
    const data = await MetaCreativeService.updateAd({
        organizationId: req.auth.organizationId,
        userId: req.auth.userId,
        adId: req.params.adId,
        input: req.body,
    });
    res.status(200).json({ success: true, data, message: 'Ad renamed' });
});

// Activation (status ACTIVE) is only reachable here and the body schema
// requires confirm:true — the UI's acknowledge dialog mirrors it.
const changeAdStatus = asyncHandler(async (req, res) => {
    const data = await MetaCreativeService.setAdStatus({
        organizationId: req.auth.organizationId,
        userId: req.auth.userId,
        adId: req.params.adId,
        status: req.body.status,
    });
    res.status(200).json({
        success: true,
        data,
        message: req.body.status === 'ACTIVE' ? 'Ad activated' : 'Ad paused',
    });
});

// Duplicate always uses status_option PAUSED (service forces it) — a copy
// can never start delivering on its own.
const duplicateAd = asyncHandler(async (req, res) => {
    const data = await MetaCreativeService.duplicateAd({
        organizationId: req.auth.organizationId,
        userId: req.auth.userId,
        adId: req.params.adId,
        adsetId: req.body && req.body.adsetId,
    });
    res.status(201).json({ success: true, data, message: 'Ad duplicated in PAUSED state' });
});

const deleteAd = asyncHandler(async (req, res) => {
    const data = await MetaCreativeService.deleteAd({
        organizationId: req.auth.organizationId,
        userId: req.auth.userId,
        adId: req.params.adId,
    });
    res.status(200).json({ success: true, data, message: 'Ad deleted' });
});

// Previews are per-format fetches: a format Meta rejects comes back as an
// honest per-format error entry, not a fabricated image.
const parseFormats = (value) => (typeof value === 'string' && value !== ''
    ? value.split(',').map((s) => s.trim()).filter(Boolean)
    : undefined);

const getAdPreviews = asyncHandler(async (req, res) => {
    const data = await MetaCreativeService.getAdPreviews({
        organizationId: req.auth.organizationId,
        adId: req.params.adId,
        formats: parseFormats(req.query.formats),
    });
    res.status(200).json({ success: true, data, message: 'Ad previews fetched' });
});

const getCreativePreviews = asyncHandler(async (req, res) => {
    const data = await MetaCreativeService.getCreativePreviews({
        organizationId: req.auth.organizationId,
        creativeId: req.params.creativeId,
        formats: parseFormats(req.query.formats),
    });
    res.status(200).json({ success: true, data, message: 'Creative previews fetched' });
});

// Preview of an UNSAVED creative spec (generatepreviews) — read-only, so it
// sits under marketing:view like the other preview reads. `formats` rides in
// the query (the body schema strips unknown keys).
const previewCreativeSpec = asyncHandler(async (req, res) => {
    const data = await MetaCreativeService.previewCreativeSpec({
        organizationId: req.auth.organizationId,
        adAccountId: req.query.adAccountId,
        input: req.body,
        formats: parseFormats(req.query.formats),
    });
    res.status(200).json({ success: true, data, message: 'Creative preview generated' });
});

module.exports = {
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
};
