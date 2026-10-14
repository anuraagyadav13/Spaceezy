const { AppError } = require('../utils/errors');
const { graphRequest } = require('./metaGraph');
const { audit, AUDIT_ACTIONS } = require('../utils/audit');
const crypto = require('crypto');
const prisma = require('../db/prisma');

// Read-only Meta Marketing API surface for SpaceEzy's own ad assets
// (single-tenant system-user token from env — see backend/.env.example).
//
// Notes on scope and safety:
// - No Prisma usage in this module: Meta reporting data is never stored and
//   can never leak across organisations (there is nothing org-scoped to leak;
//   the connection itself is deployment-global by task scope).
// - Campaign write operations are intentionally NOT implemented here
//   (read-only phase; POST routes do not exist).
// - Derived metrics (cost per lead) are computed only when inputs exist;
//   zero denominators yield null, never Infinity or fabricated numbers.

const REQUIRED_PERMISSIONS = ['ads_read'];

function requiredConfig() {
    const accessToken = process.env.META_ACCESS_TOKEN || '';
    const adAccountId = (process.env.META_AD_ACCOUNT_ID || '').replace(/^act_/, '');
    return { accessToken, adAccountId };
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
    static async getStatus() {
        const { accessToken, adAccountId } = requiredConfig();
        if (!accessToken || !adAccountId) {
            return { connected: false, reason: 'MISSING_CONFIG', missing: [
                ...(!accessToken ? ['META_ACCESS_TOKEN'] : []),
                ...(!adAccountId ? ['META_AD_ACCOUNT_ID'] : []),
            ] };
        }
        // Live validation: token, account access, and granted permissions.
        // Any classified failure degrades to an honest disconnected status
        // (expiry and permission detection) instead of throwing.
        try {
            const me = await graphRequest({ path: 'me', params: { fields: 'id,name' } });
            const account = await graphRequest({
                path: `act_${adAccountId}`,
                params: { fields: 'id,name,account_status,currency,timezone_name' },
            });
            const perms = await graphRequest({ path: 'me/permissions' });
            const granted = Array.isArray(perms.data)
                ? perms.data.filter((p) => p && p.status === 'granted').map((p) => p.permission)
                : [];
            const missingPermissions = REQUIRED_PERMISSIONS.filter((p) => !granted.includes(p));
            return {
                connected: missingPermissions.length === 0,
                reason: missingPermissions.length === 0 ? null : 'PERMISSION_DENIED',
                missingPermissions,
                user: me && me.id ? { id: me.id, name: me.name || null } : null,
                adAccount: account && account.id ? {
                    id: String(account.id),
                    name: account.name || null,
                    status: account.account_status ?? null,
                    currency: account.currency || null,
                    timezone: account.timezone_name || null,
                } : null,
            };
        } catch (err) {
            return {
                connected: false,
                reason: (err && err.code) || 'API_ERROR',
                missingPermissions: [],
                user: null,
                adAccount: null,
            };
        }
    }

    static async listAdAccounts({ limit = 100, after } = {}) {
        const data = await graphRequest({
            path: 'me/adaccounts',
            params: {
                fields: 'id,name,account_status,currency,timezone_name',
                limit: Math.min(Math.max(parseInt(limit, 10) || 100, 1), 100),
                ...(after ? { after } : {}),
            },
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

    static async listCampaigns({ adAccountId, status, limit = 50, after } = {}) {
        const { adAccountId: defaultAccount } = requiredConfig();
        const accountId = String(adAccountId || defaultAccount).replace(/^act_/, '');
        if (!accountId) {
            throw new AppError('Meta integration is not configured. Set META_AD_ACCOUNT_ID.', 409, 'META_NOT_CONFIGURED');
        }
        const params = {
            fields: 'id,name,status,effective_status,objective,daily_budget,lifetime_budget,start_time,stop_time',
            limit: Math.min(Math.max(parseInt(limit, 10) || 50, 1), 100),
            ...(after ? { after } : {}),
        };
        if (status) {
            params.filtering = JSON.stringify([{ field: 'effective_status', operator: 'IN', value: [status] }]);
        }
        const data = await graphRequest({ path: `act_${accountId}/campaigns`, params });
        const items = Array.isArray(data.data) ? data.data.map((c) => ({
            id: c.id,
            name: c.name || null,
            status: c.status || null,
            effectiveStatus: c.effective_status || null,
            objective: c.objective || null,
            dailyBudget: c.daily_budget ?? null,
            lifetimeBudget: c.lifetime_budget ?? null,
            startTime: c.start_time || null,
            stopTime: c.stop_time || null,
        })) : [];
        return { adAccountId: accountId, items, paging: data.paging || null };
    }

    // ------------------------------------------------------------------
    // Meta Lead Ads webhook ingestion (Phase 3). Single-tenant: the
    // configured META_PAGE_ID is SpaceEzy's own Page; events from any other
    // page are rejected, and leads land in the primary organisation.
    // ------------------------------------------------------------------

    static verifyLeadgenSignature(rawBody, signature) {
        const secret = process.env.META_APP_SECRET || '';
        if (!signature || !secret) return false;
        const normalized = String(signature).startsWith('sha256=') ? String(signature) : `sha256=${signature}`;
        const expected = `sha256=${crypto.createHmac('sha256', secret).update(rawBody || '').digest('hex')}`;
        const a = Buffer.from(normalized);
        const b = Buffer.from(expected);
        return a.length === b.length && crypto.timingSafeEqual(a, b);
    }

    static async resolveLeadgenOrganization(pageId) {
        const configuredPageId = process.env.META_PAGE_ID || '';
        if (!configuredPageId) {
            throw new AppError('Meta Lead Ads is not configured. Set META_PAGE_ID.', 503, 'META_NOT_CONFIGURED');
        }
        if (!pageId || String(pageId) !== String(configuredPageId)) {
            throw new AppError('Lead event is not for the configured Meta Page', 400, 'PAGE_MISMATCH');
        }
        const org = await prisma.organization.findFirst({ select: { id: true } });
        if (!org) {
            throw new AppError('System not configured correctly (No organization found)', 500, 'INTERNAL_ERROR');
        }
        return org.id;
    }

    static async processLeadgenWebhook(rawBody, signature) {
        if (!MetaAdsService.verifyLeadgenSignature(rawBody, signature)) {
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
        for (const entry of entries) {
            const changes = (entry && entry.changes) || [];
            for (const change of changes) {
                if (!change || change.field !== 'leadgen' || !change.value) {
                    ignored += 1;
                    continue;
                }
                const result = await MetaAdsService.syncMetaLead(change.value);
                if (!result || result.ignored) ignored += 1;
                else if (result.duplicate) duplicates += 1;
                else processed += 1;
            }
        }
        return { ok: true, processed, ignored, duplicates };
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

    static async syncMetaLead(value) {
        const leadgenId = value && value.leadgen_id !== undefined ? String(value.leadgen_id) : '';
        if (!/^\d+$/.test(leadgenId)) {
            throw new AppError('Invalid leadgen payload: leadgen_id missing', 400, 'VALIDATION_ERROR');
        }
        const organizationId = await MetaAdsService.resolveLeadgenOrganization(value.page_id);

        // Existing sync (retry or duplicate delivery) — never create twice.
        const existingSync = await prisma.lead.findFirst({ where: { organizationId, metaLeadId: leadgenId } });
        if (existingSync) return { ok: true, duplicate: true, leadId: existingSync.id };

        // Full details always come from Meta, never from the webhook body.
        let detail;
        try {
            detail = await graphRequest({
                path: leadgenId,
                params: { fields: 'id,created_time,field_data,ad_id,adset_id,campaign_id,form_id' },
            });
        } catch (err) {
            // Deleted/inaccessible leads must not retry forever.
            if (err && err.metaCode === 100) return { ok: true, ignored: 'lead_deleted' };
            throw err;
        }
        const mapped = MetaAdsService.mapMetaLead(detail || {});
        if (!mapped.phone) return { ok: true, ignored: 'no_identity' };

        const toDate = (unixSeconds) => {
            const n = Number(unixSeconds);
            return Number.isFinite(n) && n > 0 ? new Date(n * 1000) : null;
        };
        // Campaign name is a best-effort enrichment; its failure must never
        // block lead creation.
        let campaignName = null;
        const campaignId = detail.campaign_id !== undefined && detail.campaign_id !== null ? String(detail.campaign_id) : null;
        if (campaignId && /^\d+$/.test(campaignId)) {
            try {
                const campaign = await graphRequest({ path: campaignId, params: { fields: 'id,name' } });
                if (campaign && campaign.name) campaignName = String(campaign.name);
            } catch {
                campaignName = null;
            }
        }
        const platformRaw = value.platform || value.publisher || null;
        const metaPlatform = platformRaw === 'Facebook' || platformRaw === 'Instagram' ? platformRaw : null;
        const attributes = {
            metaLeadId: leadgenId,
            metaPageId: value.page_id !== undefined ? String(value.page_id) : null,
            metaFormId: detail.form_id !== undefined && detail.form_id !== null ? String(detail.form_id)
                : (value.form_id !== undefined ? String(value.form_id) : null),
            metaAdId: detail.ad_id !== undefined && detail.ad_id !== null ? String(detail.ad_id)
                : (value.ad_id !== undefined ? String(value.ad_id) : null),
            metaAdsetId: detail.adset_id !== undefined && detail.adset_id !== null ? String(detail.adset_id) : null,
            metaCampaignId: campaignId,
            metaCampaignName: campaignName,
            metaPlatform,
            metaCreatedAt: toDate(value.created_time ?? detail.created_time),
        };

        // Phone-match attach mirrors the public-enquiry convention: meta
        // attribution travels with the latest touch, while name, contact
        // details, message, status and ownership are never overwritten.
        const phoneMatch = await prisma.lead.findFirst({ where: { organizationId, phone: mapped.phone } });
        if (phoneMatch) {
            const updated = await prisma.lead.update({
                where: { id: phoneMatch.id },
                data: {
                    ...attributes,
                    campaign: campaignName || phoneMatch.campaign,
                    // Reopen stale interest; an active pipeline stage is never touched.
                    ...(phoneMatch.status === 'LOST' ? { status: 'NEW' } : {}),
                },
            });
            await prisma.leadActivity.create({
                data: {
                    organizationId,
                    leadId: updated.id,
                    type: 'NOTE',
                    description: 'Meta Lead Ad synced to existing lead (matched by phone)',
                    metadata: { metaLeadId: leadgenId, metaFormId: attributes.metaFormId },
                },
            });
            await audit(organizationId, null, AUDIT_ACTIONS.META_LEAD_SYNC, 'Lead', updated.id, {
                metaLeadId: leadgenId,
                deduped: 'phone-match',
            });
            return { ok: true, duplicate: true, leadId: updated.id };
        }

        try {
            const created = await prisma.lead.create({
                data: {
                    organizationId,
                    name: mapped.name || 'Meta Lead',
                    phone: mapped.phone,
                    email: mapped.email || null,
                    source: 'Meta',
                    campaign: campaignName,
                    message: mapped.customs.length > 0 ? mapped.customs.join('\n') : null,
                    status: 'NEW',
                    ...attributes,
                },
            });
            await prisma.leadActivity.create({
                data: {
                    organizationId,
                    leadId: created.id,
                    type: 'NOTE',
                    description: 'Meta Lead Ad synced from Facebook/Instagram lead form',
                    metadata: { metaLeadId: leadgenId, metaFormId: attributes.metaFormId, metaCampaignId: campaignId },
                },
            });
            await audit(organizationId, null, AUDIT_ACTIONS.META_LEAD_SYNC, 'Lead', created.id, { metaLeadId: leadgenId });
            return { ok: true, leadId: created.id };
        } catch (err) {
            // Concurrent duplicate delivery: unique (organizationId, metaLeadId).
            if (err && err.code === 'P2002') {
                const winner = await prisma.lead.findFirst({ where: { organizationId, metaLeadId: leadgenId } });
                return { ok: true, duplicate: true, leadId: winner ? winner.id : null };
            }
            throw err;
        }
    }

    static async getInsights({ level = 'campaign', adAccountId, campaignIds, datePreset, since, until, limit = 50, after } = {}) {
        const { adAccountId: defaultAccount } = requiredConfig();
        const accountId = String(adAccountId || defaultAccount).replace(/^act_/, '');
        if (!accountId) {
            throw new AppError('Meta integration is not configured. Set META_AD_ACCOUNT_ID.', 409, 'META_NOT_CONFIGURED');
        }
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
        const data = await graphRequest({ path: `act_${accountId}/insights`, params });
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
}

module.exports = MetaAdsService;
