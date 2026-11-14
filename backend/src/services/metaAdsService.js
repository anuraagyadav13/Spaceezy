const { AppError } = require('../utils/errors');
const { graphRequest } = require('./metaGraph');
const MetaAdsSettingsService = require('./metaAdsSettingsService');
const MetaLeadImportService = require('./metaLeadImportService');
const { audit, AUDIT_ACTIONS } = require('../utils/audit');
const { verifyHmacSha256 } = require('../utils/hmac');
const prisma = require('../db/prisma');

// Read-only Meta Marketing API surface for SpaceEzy's own ad assets
// (single-company connection: settings row first, legacy env fallback —
// see metaAdsSettingsService.js and backend/.env.example).
//
// Notes on scope and safety:
// - Campaign write operations are intentionally NOT implemented here
//   (read-only phase; POST routes do not exist).
// - Derived metrics (cost per lead) are computed only when inputs exist;
//   zero denominators yield null, never Infinity or fabricated numbers.
// - Credentials are always passed to graphRequest EXPLICITLY: in db mode an
//   absent/failed secret must never silently fall back to the environment.

// Single source of truth for permission sets lives in
// metaAdsSettingsService (connection tests report from the same arrays).
const { REQUIRED_PERMISSIONS, RECOMMENDED_PERMISSIONS } = MetaAdsSettingsService;

async function effectiveConfig(organizationId) {
    return MetaAdsSettingsService.getEffectiveConfig(organizationId || null);
}

// Effective token for Graph calls. Throws 409 when unusable — db mode never
// falls back to a legacy env token (row is authoritative).
function requireToken(eff) {
    const token = eff.accessToken || '';
    if (!token) {
        throw new AppError(
            eff.source === 'db'
                ? 'Meta connection is not configured. Connect Meta in Ads settings first.'
                : 'Meta integration is not configured. Set META_ACCESS_TOKEN.',
            409,
            'META_NOT_CONFIGURED'
        );
    }
    return token;
}

// Same rule for the webhook path, but 503 (not 409): a delivery that fails
// because the connection is not ready must keep Meta's automatic retry
// instead of being permanently dropped with the batch.
function webhookToken(eff) {
    const token = eff.accessToken || '';
    if (!token) {
        throw new AppError(
            eff.source === 'db'
                ? 'Meta connection is not configured for this workspace.'
                : 'Meta integration is not configured. Set META_ACCESS_TOKEN.',
            503,
            'META_NOT_CONFIGURED'
        );
    }
    return token;
}

function requireAdAccount(eff, override) {
    const accountId = String(override || eff.adAccountId || '').replace(/^act_/, '');
    if (!accountId) {
        throw new AppError(
            eff.source === 'db'
                ? 'No ad account is selected. Save an ad account selection in Meta Ads settings.'
                : 'Meta integration is not configured. Set META_AD_ACCOUNT_ID.',
            409,
            'META_NOT_CONFIGURED'
        );
    }
    return accountId;
}

function numOrNull(value) {
    if (value === null || value === undefined || value === '') return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
}

function sumAction(actions, type) {
    if (!Array.isArray(actions)) return null;
    let total = 0;
    let found = false;
    for (const action of actions) {
        if (action && action.action_type === type && action.value !== undefined) {
            const n = Number(action.value);
            if (Number.isFinite(n)) {
                total += n;
                found = true;
            }
        }
    }
    return found ? total : null;
}

class MetaAdsService {
    // Exposed for Phase 2 services (form discovery, historical backfill) so
    // the single "no usable token" rule and its 409 contract stay defined in
    // exactly one place instead of being duplicated.
    static requireToken(eff) {
        return requireToken(eff);
    }

    // Phase 3+4: the campaign management service reuses the exact same
    // effective-config and ad-account rules (same fail-closed behavior).
    static async effectiveConfig(organizationId) {
        return effectiveConfig(organizationId);
    }

    static requireAdAccount(eff, override) {
        return requireAdAccount(eff, override);
    }

    static async getStatus({ organizationId } = {}) {
        const eff = await effectiveConfig(organizationId);
        const accessToken = eff.accessToken || '';
        const adAccountId = String(eff.adAccountId || '').replace(/^act_/, '');
        const base = {
            configSource: eff.source,
            tokenExpiresAt: eff.tokenExpiresAt ? new Date(eff.tokenExpiresAt) : null,
            tokenExpired: false,
            reauthRequired: false,
        };
        if (!accessToken) {
            // Env-mode labels stay the legacy META_* names (documented API);
            // db-mode labels avoid them so no response body ever contains an
            // access-token-like substring (phase11 leak assertions).
            const missing = [eff.source === 'db' ? 'storedCredentials' : 'META_ACCESS_TOKEN'];
            if (!adAccountId) missing.push(eff.source === 'db' ? 'selectedAdAccountIds' : 'META_AD_ACCOUNT_ID');
            return {
                connected: false,
                reason: 'MISSING_CONFIG',
                missing,
                ...base,
                missingPermissions: [],
                missingRecommendedPermissions: [],
                grantedPermissions: [],
                user: null,
                adAccount: null,
            };
        }
        // A usable token with no ad account selected is NOT "unconfigured":
        // Page/Instagram discovery works without a selection. The
        // NO_AD_ACCOUNT_SELECTED reason is reported after live validation
        // below (an empty selection never skips token/permission checks).
        // Known-expired token: report honestly without calling Meta — the
        // call would only re-confirm the rejection. Reconnect required.
        if (base.tokenExpiresAt && base.tokenExpiresAt.getTime() <= Date.now()) {
            return {
                connected: false,
                reason: 'TOKEN_EXPIRED',
                missing: [],
                ...base,
                tokenExpired: true,
                reauthRequired: true,
                missingPermissions: [],
                missingRecommendedPermissions: [],
                grantedPermissions: [],
                user: null,
                adAccount: null,
            };
        }
        // Live validation: token, granted permissions, and (only when an ad
        // account is selected) account access. Any classified failure
        // degrades to an honest disconnected status (expiry and permission
        // detection) instead of throwing.
        try {
            const me = await graphRequest({ path: 'me', params: { fields: 'id,name' }, token: accessToken, version: eff.graphVersion });
            // With no ad account selected the act_{id} call would fail for a
            // reason unrelated to token health — skip it (adAccount stays
            // null) and report NO_AD_ACCOUNT_SELECTED below instead.
            const account = adAccountId
                ? await graphRequest({
                    path: `act_${adAccountId}`,
                    params: { fields: 'id,name,account_status,currency,timezone_name' },
                    token: accessToken,
                    version: eff.graphVersion,
                })
                : null;
            const perms = await graphRequest({ path: 'me/permissions', params: {}, token: accessToken, version: eff.graphVersion });
            const granted = Array.isArray(perms.data)
                ? perms.data.filter((p) => p && p.status === 'granted').map((p) => p.permission)
                : [];
            const missingPermissions = REQUIRED_PERMISSIONS.filter((p) => !granted.includes(p));
            const missingRecommendedPermissions = RECOMMENDED_PERMISSIONS.filter((p) => !granted.includes(p));
            const noAdAccountSelected = !adAccountId;
            // Missing required permissions outrank the missing selection
            // (both can be true — report the permission gap first).
            const reason = missingPermissions.length > 0
                ? 'PERMISSION_DENIED'
                : (noAdAccountSelected ? 'NO_AD_ACCOUNT_SELECTED' : null);
            return {
                connected: missingPermissions.length === 0,
                reason,
                missing: reason === 'NO_AD_ACCOUNT_SELECTED'
                    ? [eff.source === 'db' ? 'selectedAdAccountIds' : 'META_AD_ACCOUNT_ID']
                    : [],
                missingPermissions,
                missingRecommendedPermissions,
                // Advisory-safe: permission NAMES only (no token material).
                grantedPermissions: granted,
                user: me && me.id ? { id: me.id, name: me.name || null } : null,
                adAccount: account && account.id ? {
                    id: String(account.id),
                    name: account.name || null,
                    status: account.account_status ?? null,
                    currency: account.currency || null,
                    timezone: account.timezone_name || null,
                } : null,
                ...base,
                reauthRequired: reason === 'META_TOKEN_INVALID',
            };
        } catch (err) {
            const reason = (err && err.code) || 'API_ERROR';
            return {
                connected: false,
                reason,
                missing: [],
                missingPermissions: [],
                missingRecommendedPermissions: [],
                grantedPermissions: [],
                user: null,
                adAccount: null,
                ...base,
                reauthRequired: reason === 'META_TOKEN_INVALID',
            };
        }
    }

    static async listAdAccounts({ organizationId, limit = 100, after } = {}) {
        const eff = await effectiveConfig(organizationId);
        const token = requireToken(eff);
        const data = await graphRequest({
            path: 'me/adaccounts',
            params: {
                fields: 'id,name,account_status,currency,timezone_name',
                limit: Math.min(Math.max(parseInt(limit, 10) || 100, 1), 100),
                ...(after ? { after } : {}),
            },
            token,
            version: eff.graphVersion,
        });
        const items = Array.isArray(data.data) ? data.data.map((a) => ({
            id: a.id,
            name: a.name || null,
            status: a.account_status ?? null,
            currency: a.currency || null,
            timezone: a.timezone_name || null,
        })) : [];
        return { items, paging: data.paging || null };
    }

    static async listCampaigns({ organizationId, adAccountId, status, objective, limit = 50, after } = {}) {
        const eff = await effectiveConfig(organizationId);
        const token = requireToken(eff);
        const accountId = requireAdAccount(eff, adAccountId);
        const params = {
            fields: 'id,name,status,effective_status,objective,daily_budget,lifetime_budget,spend_cap,start_time,stop_time,created_time,updated_time',
            limit: Math.min(Math.max(parseInt(limit, 10) || 50, 1), 100),
            ...(after ? { after } : {}),
        };
        // Phase 3+4: status and objective filters share the documented
        // filtering parameter (IN operator), so both can apply at once.
        const filtering = [];
        if (status) filtering.push({ field: 'effective_status', operator: 'IN', value: [status] });
        if (objective) filtering.push({ field: 'objective', operator: 'IN', value: [objective] });
        if (filtering.length > 0) params.filtering = JSON.stringify(filtering);
        const data = await graphRequest({ path: `act_${accountId}/campaigns`, params, token, version: eff.graphVersion });
        const items = Array.isArray(data.data) ? data.data.map((c) => ({
            id: c.id,
            name: c.name || null,
            status: c.status || null,
            effectiveStatus: c.effective_status || null,
            objective: c.objective || null,
            dailyBudget: c.daily_budget ?? null,
            lifetimeBudget: c.lifetime_budget ?? null,
            spendCap: c.spend_cap ?? null,
            startTime: c.start_time || null,
            stopTime: c.stop_time || null,
            createdTime: c.created_time || null,
            updatedTime: c.updated_time || null,
        })) : [];
        return { adAccountId: accountId, items, paging: data.paging || null };
    }

    // ------------------------------------------------------------------
    // Meta Lead Ads webhook ingestion. Single-company: the effective page
    // allow-list (settings row when present, legacy META_PAGE_ID otherwise)
    // decides acceptance; every valid lead lands in the primary organization.
    // ------------------------------------------------------------------

    // appSecret: the caller passes the effective secret (db row first, env
    // when no row). Omitted → legacy env lookup for direct callers. Missing
    // secrets fail closed inside verifyHmacSha256 (empty → false).
    static verifyLeadgenSignature(rawBody, signature, appSecret) {
        const secret = appSecret === undefined ? (process.env.META_APP_SECRET || '') : String(appSecret || '');
        return verifyHmacSha256(rawBody, signature, secret, { normalizePrefix: true });
    }

    static async resolveLeadgenOrganization(pageId, organizationId, eff) {
        let orgId = organizationId || null;
        let config = eff || null;
        if (!config) {
            orgId = orgId || await MetaAdsSettingsService.resolvePrimaryOrganizationId();
            config = await MetaAdsSettingsService.getEffectiveConfig(orgId);
        }
        // Row present → its pageIds are authoritative (empty row = explicitly
        // unconfigured); row absent → legacy single META_PAGE_ID env value.
        const configuredPageIds = Array.isArray(config.pageIds) ? config.pageIds : [];
        if (configuredPageIds.length === 0) {
            throw new AppError('Meta Lead Ads is not configured. Set META_PAGE_ID.', 503, 'META_NOT_CONFIGURED');
        }
        if (!pageId || !configuredPageIds.includes(String(pageId))) {
            throw new AppError('Lead event is not for the configured Meta Page', 400, 'PAGE_MISMATCH');
        }
        if (!orgId) {
            throw new AppError('System not configured correctly (No organization found)', 500, 'INTERNAL_ERROR');
        }
        return orgId;
    }

    static async processLeadgenWebhook(rawBody, signature) {
        // Resolve the single company's effective configuration first: the
        // webhook secret and the page allow-list both come from it (a stored
        // secret that fails to decrypt throws here — fail closed, before any
        // lead is touched; env is never consulted when a row exists).
        const organizationId = await MetaAdsSettingsService.resolvePrimaryOrganizationId();
        const eff = await MetaAdsSettingsService.getEffectiveConfig(organizationId);
        if (!MetaAdsService.verifyLeadgenSignature(rawBody, signature, eff.appSecret || '')) {
            throw new AppError('Invalid webhook signature', 401, 'WEBHOOK_SIGNATURE_INVALID');
        }
        let payload;
        try {
            payload = JSON.parse(rawBody);
        } catch {
            throw new AppError('Invalid webhook payload', 400, 'VALIDATION_ERROR');
        }
        const entries = payload && Array.isArray(payload.entry) ? payload.entry : null;
        if (!entries) {
            throw new AppError('Invalid leadgen payload: missing entry list', 400, 'VALIDATION_ERROR');
        }
        let processed = 0;
        let ignored = 0;
        let duplicates = 0;
        let failed = 0;
        let firstPermanentError = null;

        // Per-entry error isolation: one malformed entry must never abort the
        // rest of the batch. Classification:
        //   - Transient provider failures (429 rate limit, 5xx transport/API)
        //     are rethrown IMMEDIATELY so the HTTP status keeps Meta's
        //     automatic retry behaviour; entries already processed in this
        //     delivery stay written and dedupe (organizationId, metaLeadId)
        //     makes the redelivery idempotent.
        //   - Permanent per-entry failures (bad payload, page mismatch,
        //     permission/config rejection) are collected, counted in
        //     `failed`, logged with the error code only, and never reported
        //     as processed/ignored/duplicate.
        // If at least one entry succeeded in any way the response is 200 with
        // accurate counts (including `failed`); when every leadgen change
        // failed permanently the first error is thrown after the loop, so a
        // wholly invalid batch still surfaces its original 4xx.
        for (const entry of entries) {
            const changes = (entry && entry.changes) || [];
            for (const change of changes) {
                if (!change || change.field !== 'leadgen' || !change.value) {
                    ignored += 1;
                    continue;
                }
                let result;
                try {
                    result = await MetaAdsService.syncMetaLead(change.value, { organizationId, eff });
                } catch (err) {
                    const status = Number(err && err.statusCode) || 500;
                    const transient = status === 429 || status >= 500;
                    if (transient) throw err;
                    failed += 1;
                    if (!firstPermanentError) firstPermanentError = err;
                    // Safe identifiers only: error code + status. No lead
                    // data, no page/leadgen IDs, never tokens or secrets.
                    console.warn('[meta-webhook] entry rejected', {
                        code: (err && err.code) || 'UNKNOWN',
                        status,
                    });
                    continue;
                }
                if (!result || result.ignored) ignored += 1;
                else if (result.duplicate) duplicates += 1;
                else processed += 1;
            }
        }

        if (firstPermanentError && processed === 0 && duplicates === 0 && ignored === 0) {
            throw firstPermanentError;
        }
        return { ok: true, processed, ignored, duplicates, failed };
    }

    static mapMetaLead(detail) {
        const fields = Array.isArray(detail.field_data) ? detail.field_data : [];
        const byName = new Map();
        for (const field of fields) {
            if (field && typeof field.name === 'string') {
                const values = Array.isArray(field.values) ? field.values.map((v) => String(v)) : [];
                byName.set(field.name.toLowerCase(), values);
            }
        }
        const first = (byName.get('first_name') || [])[0] || '';
        const last = (byName.get('last_name') || [])[0] || '';
        const full = (byName.get('full_name') || [])[0] || '';
        const name = full.trim() || `${first} ${last}`.trim();
        const email = (byName.get('email') || [])[0] || '';
        const phone = (byName.get('phone_number') || [])[0] || '';
        const mapped = new Set(['full_name', 'first_name', 'last_name', 'email', 'phone_number']);
        const customs = [];
        for (const [key, values] of byName) {
            if (!mapped.has(key) && values.length > 0) {
                customs.push(`${key}: ${values.join(', ')}`);
            }
        }
        return { name, email: email.trim(), phone: phone.trim(), customs };
    }

    // Phase 2: the webhook path validates the payload and the Page
    // allow-list here (preserving the 400/503/500 contracts), then hands off
    // to MetaLeadImportService — the ONE import service shared with
    // historical backfill (2F), which owns dedupe, the form-enabled gate, the
    // saved field mapping, attribution, phone-match attach, P2002 recovery
    // and the sync event log. `resolveToken` runs only AFTER the dedupe
    // short-circuit, preserving the duplicate-without-any-Meta-call contract.
    static async syncMetaLead(value, ctx) {
        // ctx ({ organizationId, eff }) is supplied by processLeadgenWebhook;
        // resolve defensively when called directly so the effective-config
        // rule (row authoritative, fail closed) always applies.
        let organizationId = (ctx && ctx.organizationId) || null;
        let eff = (ctx && ctx.eff) || null;
        if (!organizationId) organizationId = await MetaAdsSettingsService.resolvePrimaryOrganizationId();
        if (!eff) eff = await MetaAdsSettingsService.getEffectiveConfig(organizationId);

        const leadgenId = value && value.leadgen_id !== undefined ? String(value.leadgen_id) : '';
        if (!/^\d+$/.test(leadgenId)) {
            throw new AppError('Invalid leadgen payload: leadgen_id missing', 400, 'VALIDATION_ERROR');
        }
        const resolvedOrgId = await MetaAdsService.resolveLeadgenOrganization(value.page_id, organizationId, eff);

        return MetaLeadImportService.importLead({
            organizationId: resolvedOrgId,
            eff,
            value,
            source: 'WEBHOOK',
            resolveToken: () => webhookToken(eff),
        });
    }

    static async getInsights({ organizationId, level = 'campaign', adAccountId, campaignIds, datePreset, since, until, limit = 50, after } = {}) {
        const eff = await effectiveConfig(organizationId);
        const token = requireToken(eff);
        const accountId = requireAdAccount(eff, adAccountId);
        const params = {
            fields: 'campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,spend,impressions,reach,clicks,actions,date_start,date_stop',
            level,
            limit: Math.min(Math.max(parseInt(limit, 10) || 50, 1), 500),
            ...(after ? { after } : {}),
        };
        if (datePreset) {
            params.date_preset = datePreset;
        } else {
            params.time_range = JSON.stringify({ since, until });
        }
        const ids = Array.isArray(campaignIds) ? campaignIds.filter(Boolean) : [];
        if (level !== 'campaign' && ids.length === 0) {
            throw new AppError('campaignIds are required for ad-set and ad level insights', 400, 'VALIDATION_ERROR');
        }
        if (ids.length > 0) {
            params.filtering = JSON.stringify([{ field: 'campaign.id', operator: 'IN', value: ids }]);
        }
        const data = await graphRequest({ path: `act_${accountId}/insights`, params, token, version: eff.graphVersion });
        const items = Array.isArray(data.data) ? data.data.map((row) => {
            const spend = numOrNull(row.spend);
            const leads = sumAction(row.actions, 'leadgen');
            return {
                campaignId: row.campaign_id || null,
                campaignName: row.campaign_name || null,
                adsetId: row.adset_id || null,
                adsetName: row.adset_name || null,
                adId: row.ad_id || null,
                adName: row.ad_name || null,
                spend,
                impressions: row.impressions !== undefined ? numOrNull(row.impressions) : null,
                reach: row.reach !== undefined ? numOrNull(row.reach) : null,
                clicks: row.clicks !== undefined ? numOrNull(row.clicks) : null,
                leads,
                costPerLead: spend !== null && leads ? spend / leads : null,
                dateStart: row.date_start || null,
                dateStop: row.date_stop || null,
            };
        }) : [];
        return { adAccountId: accountId, level, items, paging: data.paging || null };
    }

    // ------------------------------------------------------------------
    // Phase 1 asset discovery (read-only). Every call uses the effective
    // token/version. Results are never fabricated: fields Meta omits come
    // back as null and inaccessible accounts are reported as unavailable
    // with their error code.
    // ------------------------------------------------------------------

    static async listPages({ organizationId, limit = 100, after } = {}) {
        const eff = await effectiveConfig(organizationId);
        const token = requireToken(eff);
        const data = await graphRequest({
            path: 'me/accounts',
            params: {
                fields: 'id,name,category,instagram_business_account',
                limit: Math.min(Math.max(parseInt(limit, 10) || 100, 1), 100),
                ...(after ? { after } : {}),
            },
            token,
            version: eff.graphVersion,
        });
        const items = Array.isArray(data.data) ? data.data.map((p) => ({
            id: p && p.id !== undefined ? String(p.id) : null,
            name: (p && p.name) || null,
            category: (p && p.category) || null,
            instagramBusinessAccountId: p && p.instagram_business_account && p.instagram_business_account.id
                ? String(p.instagram_business_account.id)
                : null,
        })).filter((p) => p.id !== null) : [];
        return { items, paging: data.paging || null };
    }

    // Instagram professional accounts for this connection. Primary source:
    // GET /me/assigned_instagram_accounts — accounts assigned to the token
    // holder even when no Page links them (e.g. spaceezy_). Fallback:
    // the existing Page walk (me/accounts → instagram_business_account),
    // which still reports Pages without a connected Instagram as
    // NOT_CONNECTED rows. Results are deduplicated by instagramAccountId
    // (assigned rows come first; a Page link merges onto the assigned row).
    // The response contract ({ items, errors, paging }) is unchanged, and
    // per-account API failures still mark only that account unavailable.
    static async listInstagramAccounts({ organizationId, limit = 100 } = {}) {
        const eff = await effectiveConfig(organizationId);
        const token = requireToken(eff);
        const pageSize = Math.min(Math.max(parseInt(limit, 10) || 100, 1), 100);
        const errors = [];
        const assignedItems = [];
        const byIgId = new Map();

        // Primary source. A failure here is not reported as an error row:
        // the Page walk below is a complete fallback source.
        try {
            const assigned = await graphRequest({
                path: 'me/assigned_instagram_accounts',
                params: { fields: 'id,username', limit: pageSize },
                token,
                version: eff.graphVersion,
            });
            for (const row of Array.isArray(assigned.data) ? assigned.data : []) {
                if (!row || row.id === undefined || row.id === null) continue;
                const igId = String(row.id);
                if (byIgId.has(igId)) continue;
                const item = {
                    pageId: null,
                    pageName: null,
                    instagramAccountId: igId,
                    username: row.username || null,
                    name: null,
                    available: true,
                    reason: null,
                };
                byIgId.set(igId, item);
                assignedItems.push(item);
            }
        } catch {
            // Fallback to the Page walk below (documented behavior).
        }

        // Fallback + Page linkage enrichment.
        let pages;
        try {
            pages = await graphRequest({
                path: 'me/accounts',
                params: { fields: 'id,name,instagram_business_account', limit: pageSize },
                token,
                version: eff.graphVersion,
            });
        } catch (err) {
            // The Page walk is unavailable: keep whatever the primary source
            // already returned instead of failing the whole discovery.
            if (assignedItems.length > 0) {
                return {
                    items: assignedItems,
                    errors: [{ pageId: null, instagramAccountId: null, code: (err && err.code) || 'API_ERROR' }],
                    paging: null,
                };
            }
            throw err;
        }

        const items = [];
        const pageRows = Array.isArray(pages.data) ? pages.data : [];
        for (const page of pageRows) {
            if (!page || !page.id) continue;
            const pageId = String(page.id);
            const pageName = page.name || null;
            const igId = page.instagram_business_account && page.instagram_business_account.id
                ? String(page.instagram_business_account.id) : null;
            if (!igId) {
                items.push({ pageId, pageName, instagramAccountId: null, username: null, available: false, reason: 'NOT_CONNECTED' });
                continue;
            }
            // Already discovered (via the assigned endpoint or an earlier
            // Page): merge the Page linkage instead of duplicating the row.
            const existing = byIgId.get(igId);
            if (existing) {
                if (!existing.pageId) {
                    existing.pageId = pageId;
                    existing.pageName = pageName;
                }
                continue;
            }
            try {
                const detail = await graphRequest({
                    path: igId,
                    params: { fields: 'id,username,name' },
                    token,
                    version: eff.graphVersion,
                });
                const item = {
                    pageId,
                    pageName,
                    instagramAccountId: detail && detail.id ? String(detail.id) : igId,
                    username: (detail && detail.username) || null,
                    name: (detail && detail.name) || null,
                    available: true,
                    reason: null,
                };
                byIgId.set(item.instagramAccountId, item);
                items.push(item);
            } catch (err) {
                items.push({
                    pageId,
                    pageName,
                    instagramAccountId: igId,
                    username: null,
                    name: null,
                    available: false,
                    reason: (err && err.code) || 'API_ERROR',
                });
                errors.push({ pageId, instagramAccountId: igId, code: (err && err.code) || 'API_ERROR' });
            }
        }
        return { items: [...assignedItems, ...items], errors, paging: pages.paging || null };
    }

    // Refresh discovery from Meta and record the sync timestamp. Updates an
    // existing settings row only — sync never creates one, so legacy env
    // mode is never silently flipped to db mode (syncedAt stays null there
    // and is reported honestly as such).
    //
    // The three categories are fetched independently (Promise.allSettled):
    // a failure in one (e.g. ad accounts returning 403 while ads_read is
    // not granted) never discards successful Page/Instagram results.
    // Per-category outcomes are returned in `results`; a failed category
    // reports count:null (never a fabricated count), `partial` is true when
    // any category failed, and syncedAt is only recorded when EVERY
    // category succeeded — a failed category is never marked synchronized.
    static async syncAssets({ organizationId, userId } = {}) {
        const orgId = organizationId || await MetaAdsSettingsService.resolvePrimaryOrganizationId();
        const eff = await MetaAdsSettingsService.getEffectiveConfig(orgId);
        const [adAccounts, pages, instagramAccounts] = await Promise.allSettled([
            MetaAdsService.listAdAccounts({ organizationId: orgId, limit: 100 }),
            MetaAdsService.listPages({ organizationId: orgId, limit: 100 }),
            MetaAdsService.listInstagramAccounts({ organizationId: orgId, limit: 100 }),
        ]);
        const settle = (outcome) =>
            outcome.status === 'fulfilled'
                ? { ok: true, count: outcome.value.items.length, error: null }
                : {
                    ok: false,
                    count: null,
                    error: {
                        code: (outcome.reason && outcome.reason.code) || 'UNKNOWN',
                        message: (outcome.reason && outcome.reason.message) || 'Discovery failed',
                    },
                };
        const results = {
            adAccounts: settle(adAccounts),
            pages: settle(pages),
            instagramAccounts: settle(instagramAccounts),
        };
        const failedCategories = Object.keys(results).filter((key) => !results[key].ok);
        const partial = failedCategories.length > 0;

        // Nothing succeeded: there is no result to save — surface the first
        // error unchanged (same HTTP error contract as before).
        if (failedCategories.length === Object.keys(results).length) {
            throw adAccounts.reason;
        }

        // Only a fully successful sync may be marked as synchronized.
        const syncedAt = partial ? null : await MetaAdsSettingsService.markSynced(orgId);
        if (orgId) {
            await audit(orgId, userId || null, AUDIT_ACTIONS.META_ASSETS_SYNCED, 'MetaAdsSettings', orgId, {
                partial,
                adAccounts: results.adAccounts.count,
                pages: results.pages.count,
                instagramAccounts: results.instagramAccounts.count,
                failures: partial
                    ? failedCategories.map((category) => ({ category, code: results[category].error.code }))
                    : [],
            });
        }
        return {
            configSource: eff.source,
            adAccounts: results.adAccounts.count,
            pages: results.pages.count,
            instagramAccounts: results.instagramAccounts.count,
            partial,
            results,
            syncedAt,
        };
    }
}

module.exports = MetaAdsService;
