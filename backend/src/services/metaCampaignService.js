const { AppError } = require('../utils/errors');
const { graphRequest } = require('./metaGraph');
const MetaAdsService = require('./metaAdsService');
const { audit, AUDIT_ACTIONS } = require('../utils/audit');

// ---------------------------------------------------------------------------
// Phase 3+4 — Campaign, ad set and audience management (Meta Marketing API).
//
// Contract and safety rules:
// - Same effective-config chain as every other Meta service: the settings
//   row (db mode) is authoritative, the token travels only in the Authorization
//   header, and a missing credential fails closed with 409 META_NOT_CONFIGURED.
// - EVERY campaign/ad set is created with status=PAUSED. Activation happens
//   exclusively through setCampaignStatus/setAdsetStatus, which the router
//   only reaches with confirm:true — nothing here can implicitly start spend.
// - Ad set creation runs Meta's own execution_options:["validate_only"]
//   dry-run first: the payload (targeting, audiences, placements, budgets)
//   is validated by the provider WITHOUT performing any mutation. The
//   dedicated dry-run endpoint reuses the same path with dryRun: true.
// - All Graph field/enum values come from the official reference docs; no
//   invented parameters. Responses are mapped to camelCase identifiers,
//   counts and statuses only — never credentials.
// - Every management mutation writes an AuditLog row (reused existing table,
//   no new persistence): Meta remains the source of truth for the objects.
// ---------------------------------------------------------------------------

const CAMPAIGN_FIELDS = 'id,name,status,effective_status,objective,daily_budget,lifetime_budget,spend_cap,special_ad_categories,created_time,updated_time,start_time,stop_time';
const ADSET_LIST_FIELDS = 'id,name,campaign_id,status,effective_status,daily_budget,lifetime_budget,start_time,end_time,billing_event,optimization_goal';
const ADSET_FIELDS = `${ADSET_LIST_FIELDS},bid_amount,targeting,promoted_object`;

// Budgets arrive as digit strings (or plain integers from JSON) — Meta wants
// int64 numeric strings on the wire.
const toAmount = (value) => (typeof value === 'number' ? String(Math.trunc(value)) : String(value));

// Shared connection resolution. Object-level reads/writes (GET/PATCH
// /{id}) do not need an ad account id; account-level edges do.
async function conn(organizationId, adAccountId, { requireAccount = true } = {}) {
    const eff = await MetaAdsService.effectiveConfig(organizationId);
    const token = MetaAdsService.requireToken(eff);
    const accountId = requireAccount ? MetaAdsService.requireAdAccount(eff, adAccountId) : null;
    return { eff, token, accountId };
}

const mapCampaign = (c) => ({
    id: String(c.id),
    name: c.name || null,
    status: c.status || null,
    effectiveStatus: c.effective_status || null,
    objective: c.objective || null,
    dailyBudget: c.daily_budget ?? null,
    lifetimeBudget: c.lifetime_budget ?? null,
    spendCap: c.spend_cap ?? null,
    specialAdCategories: Array.isArray(c.special_ad_categories) ? c.special_ad_categories : [],
    startTime: c.start_time || null,
    stopTime: c.stop_time || null,
    createdTime: c.created_time || null,
    updatedTime: c.updated_time || null,
});

const mapAdSet = (a) => ({
    id: String(a.id),
    name: a.name || null,
    campaignId: a.campaign_id ? String(a.campaign_id) : null,
    status: a.status || null,
    effectiveStatus: a.effective_status || null,
    dailyBudget: a.daily_budget ?? null,
    lifetimeBudget: a.lifetime_budget ?? null,
    startTime: a.start_time || null,
    endTime: a.end_time || null,
    billingEvent: a.billing_event || null,
    optimizationGoal: a.optimization_goal || null,
    bidAmount: a.bid_amount ?? null,
    pageId: a.promoted_object && a.promoted_object.page_id ? String(a.promoted_object.page_id) : null,
    targeting: a.targeting || null,
});

const mapAudience = (a, type) => ({
    id: String(a.id),
    name: a.name || null,
    description: a.description || null,
    subtype: a.subtype || null,
    type,
});

// UI targeting input → Meta's targeting spec (geo_locations.countries is
// required by the adsets edge; audiences become [{id}] references; omitted
// sections fall back to Meta defaults).
function buildTargeting(spec) {
    const targeting = { geo_locations: { countries: [...spec.countries] } };
    if (spec.ageMin !== undefined) targeting.age_min = spec.ageMin;
    if (spec.ageMax !== undefined) targeting.age_max = spec.ageMax;
    if (Array.isArray(spec.genders) && spec.genders.length > 0) {
        targeting.genders = [...new Set(spec.genders)];
    }
    if (Array.isArray(spec.customAudiences) && spec.customAudiences.length > 0) {
        targeting.custom_audiences = spec.customAudiences.map((id) => ({ id: String(id) }));
    }
    if (Array.isArray(spec.excludedCustomAudiences) && spec.excludedCustomAudiences.length > 0) {
        targeting.excluded_custom_audiences = spec.excludedCustomAudiences.map((id) => ({ id: String(id) }));
    }
    if (Array.isArray(spec.publisherPlatforms) && spec.publisherPlatforms.length > 0) {
        targeting.publisher_platforms = [...spec.publisherPlatforms];
    }
    if (Array.isArray(spec.devicePlatforms) && spec.devicePlatforms.length > 0) {
        targeting.device_platforms = [...spec.devicePlatforms];
    }
    if (Array.isArray(spec.facebookPositions) && spec.facebookPositions.length > 0) {
        targeting.facebook_positions = [...spec.facebookPositions];
    }
    if (Array.isArray(spec.instagramPositions) && spec.instagramPositions.length > 0) {
        targeting.instagram_positions = [...spec.instagramPositions];
    }
    return targeting;
}

function buildCampaignBody(input, { forCreate = false } = {}) {
    const body = {};
    if (input.name !== undefined) body.name = input.name;
    if (input.objective !== undefined) body.objective = input.objective;
    if (input.dailyBudget !== undefined) body.daily_budget = toAmount(input.dailyBudget);
    if (input.lifetimeBudget !== undefined) body.lifetime_budget = toAmount(input.lifetimeBudget);
    if (input.spendCap !== undefined) body.spend_cap = toAmount(input.spendCap);
    if (forCreate) {
        body.special_ad_categories = Array.isArray(input.specialAdCategories) ? input.specialAdCategories : [];
        // Never created active — enforced again by the validator.
        body.status = 'PAUSED';
    }
    return body;
}

function buildAdSetBody(input) {
    const body = {
        name: input.name,
        campaign_id: input.campaignId,
        billing_event: input.billingEvent,
        optimization_goal: input.optimizationGoal,
        targeting: buildTargeting(input.targeting),
        status: 'PAUSED',
    };
    if (input.dailyBudget !== undefined) {
        body.daily_budget = toAmount(input.dailyBudget);
        // Meta documents end_time=0 as "ongoing, no end date" for daily
        // budgets; an absent end_time with an explicit start is ambiguous.
        body.end_time = input.endTime || '0';
    }
    if (input.lifetimeBudget !== undefined) body.lifetime_budget = toAmount(input.lifetimeBudget);
    if (input.startTime) body.start_time = input.startTime;
    if (input.endTime) body.end_time = input.endTime;
    if (input.bidAmount !== undefined) body.bid_amount = input.bidAmount;
    if (input.pageId) body.promoted_object = { page_id: String(input.pageId) };
    return body;
}

function buildAdSetUpdateBody(input) {
    const body = {};
    if (input.name !== undefined) body.name = input.name;
    if (input.dailyBudget !== undefined) body.daily_budget = toAmount(input.dailyBudget);
    if (input.lifetimeBudget !== undefined) body.lifetime_budget = toAmount(input.lifetimeBudget);
    if (input.startTime !== undefined) body.start_time = input.startTime;
    if (input.endTime !== undefined) body.end_time = input.endTime;
    if (input.billingEvent !== undefined) body.billing_event = input.billingEvent;
    if (input.optimizationGoal !== undefined) body.optimization_goal = input.optimizationGoal;
    if (input.bidAmount !== undefined) body.bid_amount = input.bidAmount;
    if (input.pageId !== undefined) body.promoted_object = { page_id: String(input.pageId) };
    if (input.targeting !== undefined) body.targeting = buildTargeting(input.targeting);
    return body;
}

class MetaCampaignService {
    // ------------------------------------------------------------------
    // Campaigns (detail / create / edit / status). The list endpoint stays
    // on MetaAdsService.listCampaigns (Phase 11 reporting + Phase 3 list
    // share one GET /campaigns).
    // ------------------------------------------------------------------

    static async getCampaign({ organizationId, campaignId } = {}) {
        const { eff, token } = await conn(organizationId, null, { requireAccount: false });
        const data = await graphRequest({
            path: String(campaignId),
            params: { fields: CAMPAIGN_FIELDS },
            token,
            version: eff.graphVersion,
        });
        return mapCampaign(data);
    }

    static async createCampaign({ organizationId, userId, adAccountId, input = {} } = {}) {
        const { eff, token, accountId } = await conn(organizationId, adAccountId);
        const body = buildCampaignBody(input, { forCreate: true });
        const created = await graphRequest({
            path: `act_${accountId}/campaigns`,
            method: 'POST',
            body,
            token,
            version: eff.graphVersion,
        });
        const id = created && created.id ? String(created.id) : null;
        await audit(organizationId, userId || null, AUDIT_ACTIONS.META_CAMPAIGN_CREATED, 'MetaCampaign', id, {
            name: input.name || null,
            objective: input.objective || null,
            status: 'PAUSED',
            dailyBudget: body.daily_budget || null,
            lifetimeBudget: body.lifetime_budget || null,
        });
        return {
            id,
            name: input.name || null,
            objective: input.objective || null,
            status: 'PAUSED',
            effectiveStatus: 'PAUSED',
            dailyBudget: body.daily_budget || null,
            lifetimeBudget: body.lifetime_budget || null,
            spendCap: body.spend_cap || null,
            specialAdCategories: body.special_ad_categories,
        };
    }

    static async updateCampaign({ organizationId, userId, campaignId, input = {} } = {}) {
        const { eff, token } = await conn(organizationId, null, { requireAccount: false });
        const body = buildCampaignBody(input);
        const fields = Object.keys(body);
        if (fields.length === 0) {
            throw new AppError('No campaign fields to update', 400, 'VALIDATION_ERROR');
        }
        await graphRequest({
            path: String(campaignId),
            method: 'POST',
            body,
            token,
            version: eff.graphVersion,
        });
        await audit(organizationId, userId || null, AUDIT_ACTIONS.META_CAMPAIGN_UPDATED, 'MetaCampaign', String(campaignId), {
            fields,
            name: input.name || null,
        });
        return { id: String(campaignId), updated: fields };
    }

    // Activation is the only path that can start spend: the route only
    // reaches this with status ACTIVE + confirm:true (validator-enforced).
    static async setCampaignStatus({ organizationId, userId, campaignId, status } = {}) {
        const { eff, token } = await conn(organizationId, null, { requireAccount: false });
        await graphRequest({
            path: String(campaignId),
            method: 'POST',
            body: { status },
            token,
            version: eff.graphVersion,
        });
        await audit(organizationId, userId || null, AUDIT_ACTIONS.META_CAMPAIGN_STATUS, 'MetaCampaign', String(campaignId), { status });
        return { id: String(campaignId), status };
    }

    // ------------------------------------------------------------------
    // Ad sets.
    // ------------------------------------------------------------------

    // Account-scoped list, or the documented campaign adsets edge when a
    // campaignId is given (avoids unverifiable cross-edge filtering).
    static async listAdSets({ organizationId, adAccountId, campaignId, status, limit = 50, after } = {}) {
        const { eff, token, accountId } = await conn(organizationId, adAccountId, {
            requireAccount: !campaignId,
        });
        const params = {
            fields: ADSET_LIST_FIELDS,
            limit: Math.min(Math.max(parseInt(limit, 10) || 50, 1), 100),
            ...(after ? { after } : {}),
        };
        if (status) {
            params.filtering = JSON.stringify([{ field: 'effective_status', operator: 'IN', value: [status] }]);
        }
        const path = campaignId ? `${campaignId}/adsets` : `act_${accountId}/adsets`;
        const data = await graphRequest({ path, params, token, version: eff.graphVersion });
        const items = Array.isArray(data.data) ? data.data.map(mapAdSet) : [];
        return {
            adAccountId: accountId || null,
            campaignId: campaignId ? String(campaignId) : null,
            items,
            paging: data.paging || null,
        };
    }

    static async getAdSet({ organizationId, adsetId } = {}) {
        const { eff, token } = await conn(organizationId, null, { requireAccount: false });
        const data = await graphRequest({
            path: String(adsetId),
            params: { fields: ADSET_FIELDS },
            token,
            version: eff.graphVersion,
        });
        return mapAdSet(data);
    }

    // Two-step create: Meta's validate_only dry-run first (full payload
    // validation, zero mutation), then the real create. dryRun stops after
    // the validation call and never audits — used by the wizard's explicit
    // "Validate targeting" action.
    static async createAdSet({ organizationId, userId, adAccountId, input = {}, dryRun = false } = {}) {
        const { eff, token, accountId } = await conn(organizationId, adAccountId);
        const body = buildAdSetBody(input);
        await graphRequest({
            path: `act_${accountId}/adsets`,
            method: 'POST',
            body: { ...body, execution_options: ['validate_only'] },
            token,
            version: eff.graphVersion,
        });
        if (dryRun) return { ok: true, dryRun: true };
        const created = await graphRequest({
            path: `act_${accountId}/adsets`,
            method: 'POST',
            body,
            token,
            version: eff.graphVersion,
        });
        const id = created && created.id ? String(created.id) : null;
        await audit(organizationId, userId || null, AUDIT_ACTIONS.META_ADSET_CREATED, 'MetaAdSet', id, {
            name: input.name || null,
            campaignId: input.campaignId || null,
            optimizationGoal: input.optimizationGoal || null,
            status: 'PAUSED',
        });
        return {
            id,
            name: input.name || null,
            campaignId: input.campaignId || null,
            status: 'PAUSED',
            effectiveStatus: 'PAUSED',
            dailyBudget: body.daily_budget || null,
            lifetimeBudget: body.lifetime_budget || null,
            billingEvent: input.billingEvent || null,
            optimizationGoal: input.optimizationGoal || null,
            targeting: body.targeting,
        };
    }

    static async updateAdSet({ organizationId, userId, adsetId, input = {} } = {}) {
        const { eff, token } = await conn(organizationId, null, { requireAccount: false });
        const body = buildAdSetUpdateBody(input);
        const fields = Object.keys(body);
        if (fields.length === 0) {
            throw new AppError('No ad set fields to update', 400, 'VALIDATION_ERROR');
        }
        await graphRequest({
            path: String(adsetId),
            method: 'POST',
            body,
            token,
            version: eff.graphVersion,
        });
        await audit(organizationId, userId || null, AUDIT_ACTIONS.META_ADSET_UPDATED, 'MetaAdSet', String(adsetId), { fields });
        return { id: String(adsetId), updated: fields };
    }

    static async setAdsetStatus({ organizationId, userId, adsetId, status } = {}) {
        const { eff, token } = await conn(organizationId, null, { requireAccount: false });
        await graphRequest({
            path: String(adsetId),
            method: 'POST',
            body: { status },
            token,
            version: eff.graphVersion,
        });
        await audit(organizationId, userId || null, AUDIT_ACTIONS.META_ADSET_STATUS, 'MetaAdSet', String(adsetId), { status });
        return { id: String(adsetId), status };
    }

    // ------------------------------------------------------------------
    // Audiences. Saved audiences are READ-ONLY through the API (Meta
    // documents the saved_audiences edge as listing-only), so this phase
    // lists them and creates/updates/deletes CUSTOM audiences only.
    // ------------------------------------------------------------------

    static async listAudiences({ organizationId, adAccountId, type = 'all', limit = 50, after } = {}) {
        const { eff, token, accountId } = await conn(organizationId, adAccountId);
        const bounded = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 100);
        const wantSaved = type === 'all' || type === 'saved';
        const wantCustom = type === 'all' || type === 'custom';
        const pagingParams = { limit: bounded, ...(after ? { after } : {}) };

        const fetchSaved = wantSaved
            ? graphRequest({
                path: `act_${accountId}/saved_audiences`,
                params: { fields: 'id,name', ...pagingParams },
                token,
                version: eff.graphVersion,
            })
            : Promise.resolve(null);
        const fetchCustom = wantCustom
            ? graphRequest({
                path: `act_${accountId}/customaudiences`,
                params: { fields: 'id,name,description,subtype', ...pagingParams },
                token,
                version: eff.graphVersion,
            })
            : Promise.resolve(null);

        const [savedData, customData] = await Promise.all([fetchSaved, fetchCustom]);
        const map = (data, t) => ({
            items: data && Array.isArray(data.data) ? data.data.map((a) => mapAudience(a, t)) : [],
            paging: (data && data.paging) || null,
        });
        return {
            adAccountId: accountId,
            saved: savedData ? map(savedData, 'saved') : { items: [], paging: null },
            custom: customData ? map(customData, 'custom') : { items: [], paging: null },
        };
    }

    // Blank custom audience container (subtype CUSTOM). Membership and
    // lookalikes are managed in Ads Manager / later phases.
    static async createAudience({ organizationId, userId, adAccountId, name, description } = {}) {
        const { eff, token, accountId } = await conn(organizationId, adAccountId);
        const body = { name, subtype: 'CUSTOM' };
        if (description) body.description = description;
        const created = await graphRequest({
            path: `act_${accountId}/customaudiences`,
            method: 'POST',
            body,
            token,
            version: eff.graphVersion,
        });
        const id = created && created.id ? String(created.id) : null;
        await audit(organizationId, userId || null, AUDIT_ACTIONS.META_AUDIENCE_CREATED, 'MetaAudience', id, { name });
        return { id, name, description: description || null, subtype: 'CUSTOM', type: 'custom' };
    }

    static async updateAudience({ organizationId, userId, audienceId, input = {} } = {}) {
        const { eff, token } = await conn(organizationId, null, { requireAccount: false });
        const body = {};
        if (input.name !== undefined) body.name = input.name;
        if (input.description !== undefined) body.description = input.description;
        const fields = Object.keys(body);
        if (fields.length === 0) {
            throw new AppError('No audience fields to update', 400, 'VALIDATION_ERROR');
        }
        await graphRequest({
            path: String(audienceId),
            method: 'POST',
            body,
            token,
            version: eff.graphVersion,
        });
        await audit(organizationId, userId || null, AUDIT_ACTIONS.META_AUDIENCE_UPDATED, 'MetaAudience', String(audienceId), { fields });
        return { id: String(audienceId), updated: fields };
    }

    // Permanent in Meta's API (documented: ads using it stop delivering).
    // The route only reaches this with ?confirm=true.
    static async deleteAudience({ organizationId, userId, audienceId } = {}) {
        const { eff, token } = await conn(organizationId, null, { requireAccount: false });
        await graphRequest({
            path: String(audienceId),
            method: 'DELETE',
            token,
            version: eff.graphVersion,
        });
        await audit(organizationId, userId || null, AUDIT_ACTIONS.META_AUDIENCE_DELETED, 'MetaAudience', String(audienceId), {});
        return { id: String(audienceId), deleted: true };
    }
}

module.exports = MetaCampaignService;
