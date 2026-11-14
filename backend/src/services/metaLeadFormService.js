const { AppError } = require('../utils/errors');
const { graphRequest } = require('./metaGraph');
const MetaAdsService = require('./metaAdsService');
const MetaAdsSettingsService = require('./metaAdsSettingsService');
const { audit, AUDIT_ACTIONS } = require('../utils/audit');
const prisma = require('../db/prisma');
const { MAPPABLE_FIELDS } = require('../constants/metaLeadMapping');

// ---------------------------------------------------------------------------
// Phase 2A/2B/2C — Instant Form discovery, per-form sync configuration and
// question→CRM field mapping.
//
// Rules:
// - Credentials come ONLY from the effective MetaAdsSettings config (stored
//   row first, legacy env fallback) via the existing graph transport; no
//   hardcoded tokens anywhere in this file.
// - Data is never fabricated: fields Meta omits come back as null and are
//   reported honestly (statusUnavailable, missingFromMeta).
// - Discovery reads are bounded (paged cursor walking with a hard page cap);
//   per-Page permission failures degrade to an error entry instead of
//   failing the whole listing, while rate limits / dead tokens surface
//   honestly as errors.
// - No credential material is stored in MetaLeadFormConfig — only form/page
//   identifiers, sync state and the mapping.
// ---------------------------------------------------------------------------

// `status` is not readable on every leadgen form node: retry once without it
// rather than failing discovery or inventing a value.
const FORM_FIELDS_WITH_STATUS = 'id,name,status,created_time';
const FORM_FIELDS_BASIC = 'id,name,created_time';
const MAX_PAGES_PER_EDGE = 5; // hard cap: max 500 forms per Page per call
const FORM_PAGE_SIZE_MAX = 100;

const digitsOnly = (value) => /^\d+$/.test(String(value || ''));

function isFieldError(err) {
    return Boolean(err) && err.code === 'META_API_ERROR';
}

function configView(row) {
    if (!row) {
        return {
            configured: false,
            isEnabled: true, // never-configured forms keep ingesting (Phase 1 parity)
            fieldMapping: [],
            mappingCount: 0,
            lastSyncedAt: null,
            pageId: null,
            formName: null,
        };
    }
    const mapping = Array.isArray(row.fieldMapping) ? row.fieldMapping : [];
    return {
        configured: true,
        isEnabled: row.isEnabled !== false,
        fieldMapping: mapping,
        mappingCount: mapping.length,
        lastSyncedAt: row.lastSyncedAt ? new Date(row.lastSyncedAt).toISOString() : null,
        pageId: row.pageId || null,
        formName: row.formName || null,
    };
}

// Walks one Page's leadgen_forms edge with a bounded cursor loop. Meta field
// failures degrade to the reduced field set; hard failures (rate limit, dead
// token) propagate so the caller reports them honestly.
async function fetchFormsForPage(pageId, { token, version, limit }) {
    const items = [];
    let fields = FORM_FIELDS_WITH_STATUS;
    let statusUnavailable = false;
    let after = null;
    let pages = 0;
    let truncated = false;

    for (;;) {
        let data;
        try {
            data = await graphRequest({
                path: `${pageId}/leadgen_forms`,
                params: { fields, limit, ...(after ? { after } : {}) },
                token,
                version,
            });
        } catch (err) {
            if (fields === FORM_FIELDS_WITH_STATUS && isFieldError(err)) {
                fields = FORM_FIELDS_BASIC;
                statusUnavailable = true;
                continue; // retry once with the reduced, proven field set
            }
            throw err;
        }
        pages += 1;
        const rows = Array.isArray(data.data) ? data.data : [];
        for (const row of rows) {
            if (!row || !digitsOnly(row.id)) continue;
            items.push({
                formId: String(row.id),
                formName: row.name !== undefined && row.name !== null ? String(row.name) : null,
                status: fields === FORM_FIELDS_WITH_STATUS && row.status !== undefined && row.status !== null
                    ? String(row.status)
                    : null,
                createdTime: row.created_time !== undefined && row.created_time !== null
                    ? String(row.created_time)
                    : null,
                pageId: String(pageId),
            });
        }
        const nextAfter = data.paging && data.paging.cursors ? data.paging.cursors.after : null;
        if (!nextAfter || rows.length === 0) break;
        if (pages >= MAX_PAGES_PER_EDGE) {
            truncated = true;
            break;
        }
        after = nextAfter;
    }
    return { items, truncated, statusUnavailable };
}

class MetaLeadFormService {
    // 2A — discover Instant Forms on the selected (accessible) Pages.
    // Optional pageId scopes discovery to one Page; without it every
    // configured Page is walked (bounded). Configured forms Meta no longer
    // returns are still listed, flagged missingFromMeta, so an admin can
    // always disable them.
    static async listForms({ organizationId, pageId, limit } = {}) {
        const eff = await MetaAdsSettingsService.getEffectiveConfig(organizationId || null);
        const token = MetaAdsService.requireToken(eff);

        const configured = Array.isArray(eff.pageIds) ? eff.pageIds.map(String) : [];
        if (configured.length === 0) {
            throw new AppError(
                eff.source === 'db'
                    ? 'No Facebook Pages are selected. Select Pages in Meta Ads settings first.'
                    : 'Meta integration is not configured. Set META_PAGE_ID.',
                409,
                'META_NOT_CONFIGURED'
            );
        }
        let pages = configured;
        if (pageId !== undefined && pageId !== null && pageId !== '') {
            const pid = String(pageId);
            if (!configured.includes(pid)) {
                throw new AppError('Selected Page is not among the connected Meta Pages', 400, 'PAGE_MISMATCH');
            }
            pages = [pid];
        }
        const pageSize = Math.min(Math.max(parseInt(limit, 10) || 100, 1), FORM_PAGE_SIZE_MAX);

        const items = [];
        const errors = [];
        let truncated = false;
        let statusUnavailable = false;
        for (const pid of pages) {
            try {
                const res = await fetchFormsForPage(pid, { token, version: eff.graphVersion, limit: pageSize });
                items.push(...res.items);
                if (res.truncated) truncated = true;
                if (res.statusUnavailable) statusUnavailable = true;
            } catch (err) {
                const code = (err && err.code) || 'API_ERROR';
                // Rate limits and unusable tokens fail the whole discovery
                // honestly; other per-Page failures (missing permission etc.)
                // degrade to a per-Page error entry.
                if (code === 'META_RATE_LIMITED' || code === 'META_TOKEN_INVALID' || code === 'META_NOT_CONFIGURED') {
                    throw err;
                }
                errors.push({ pageId: pid, code, message: (err && err.message) || 'Meta API error' });
            }
        }

        // Merge saved configuration (sync status, last sync, mapping count).
        const configs = await prisma.metaLeadFormConfig.findMany({ where: { organizationId } });
        const byForm = new Map(configs.map((c) => [String(c.formId), c]));
        const seen = new Set(items.map((i) => i.formId));
        for (const c of configs) {
            const fid = String(c.formId);
            if (seen.has(fid)) continue;
            items.push({
                formId: fid,
                pageId: c.pageId || null,
                formName: c.formName || null,
                status: null,
                createdTime: null,
                missingFromMeta: true,
            });
        }

        const merged = items.map((item) => {
            const view = configView(byForm.get(item.formId));
            return {
                ...item,
                missingFromMeta: item.missingFromMeta === true,
                configured: view.configured,
                isEnabled: view.isEnabled,
                fieldMapping: view.fieldMapping,
                mappingCount: view.mappingCount,
                lastSyncedAt: view.lastSyncedAt,
                // Meta's Page/name win when present; the saved config row is
                // only the fallback (configView returns null when absent).
                pageId: item.pageId || view.pageId,
                formName: item.formName || view.formName,
            };
        });
        // Stable, newest-first ordering by creation time when Meta provides it.
        merged.sort((a, b) => String(b.createdTime || '').localeCompare(String(a.createdTime || '')));

        return {
            items: merged,
            errors,
            truncated,
            // True when Meta would not return the `status` field: forms then
            // report status:null instead of a guessed value.
            statusUnavailable,
            pages: pages.length,
        };
    }

    // 2A/2C — actual questions/field definitions for one form. `questions`
    // comes straight from Meta (never derived or invented); an empty list
    // with available:false means Meta did not provide them.
    static async getFormQuestions({ organizationId, formId }) {
        const eff = await MetaAdsSettingsService.getEffectiveConfig(organizationId || null);
        const token = MetaAdsService.requireToken(eff);
        const data = await graphRequest({
            path: String(formId),
            params: { fields: 'id,name,questions' },
            token,
            version: eff.graphVersion,
        });
        const raw = Array.isArray(data.questions) ? data.questions : [];
        const questions = raw.filter(Boolean).map((q) => ({
            key: q.key !== undefined && q.key !== null ? String(q.key) : null,
            label: q.label !== undefined && q.label !== null
                ? String(q.label)
                : (q.key !== undefined && q.key !== null ? String(q.key) : null),
            type: q.type !== undefined && q.type !== null ? String(q.type) : null,
            questionId: q.id !== undefined && q.id !== null ? String(q.id) : null,
        }));
        const config = await prisma.metaLeadFormConfig.findUnique({
            where: { organizationId_formId: { organizationId, formId: String(formId) } },
        });
        const view = configView(config);
        return {
            formId: String(formId),
            formName: (data && data.name) || view.formName || null,
            pageId: view.pageId,
            questions,
            available: questions.length > 0,
            configured: view.configured,
            isEnabled: view.isEnabled,
            fieldMapping: view.fieldMapping,
        };
    }

    // 2B — enable/disable sync for one form. Validates that the Page is one
    // of the connected Pages (existing webhook allow-list contract) and that
    // the form actually belongs to that Page (bounded scan), then upserts on
    // the (organizationId, formId) unique key — duplicates are impossible.
    static async saveConfig({ organizationId, userId, formId, pageId, formName, isEnabled }) {
        const eff = await MetaAdsSettingsService.getEffectiveConfig(organizationId);
        // Reuses the webhook's page allow-list contracts: 503 when no Pages
        // are configured, 400 PAGE_MISMATCH for a foreign Page, 500 when no
        // organization can be resolved.
        await MetaAdsService.resolveLeadgenOrganization(String(pageId), organizationId, eff);
        const token = MetaAdsService.requireToken(eff);

        const scan = await fetchFormsForPage(String(pageId), {
            token, version: eff.graphVersion, limit: FORM_PAGE_SIZE_MAX,
        });
        if (!scan.items.some((item) => item.formId === String(formId))) {
            throw new AppError('Instant Form does not belong to the selected Meta Page', 400, 'FORM_PAGE_MISMATCH');
        }

        const row = await prisma.metaLeadFormConfig.upsert({
            where: { organizationId_formId: { organizationId, formId: String(formId) } },
            create: {
                organizationId,
                formId: String(formId),
                pageId: String(pageId),
                formName: formName !== undefined && formName !== null && formName !== '' ? String(formName) : null,
                isEnabled: isEnabled !== false,
            },
            update: {
                pageId: String(pageId),
                ...(formName !== undefined && formName !== null && formName !== ''
                    ? { formName: String(formName) } : {}),
                isEnabled: isEnabled !== false,
            },
        });
        // Meta identifiers and the boolean only — no credentials, no PII.
        await audit(organizationId, userId, AUDIT_ACTIONS.META_LEAD_FORMS_UPDATED,
            'MetaLeadFormConfig', row.id, {
                formId: String(formId), pageId: String(pageId), isEnabled: row.isEnabled,
            });
        return { formId: String(formId), ...configView(row) };
    }

    // 2C — save (and later edit) the question→CRM field mapping for a form.
    // Unmapped questions (crmField null) are valid; every original label is
    // stored with its machine key. A row that does not exist yet is created
    // (with the Page validated against the same allow-list as enable sync);
    // an existing disabled form keeps its isEnabled state — saving a mapping
    // never silently re-enables or disables sync.
    static async saveMapping({ organizationId, userId, formId, pageId, formName, mappings }) {
        const cleaned = [];
        const targets = new Set();
        for (const row of Array.isArray(mappings) ? mappings : []) {
            const key = row && row.questionKey !== undefined && row.questionKey !== null
                ? String(row.questionKey).trim() : '';
            if (!key) {
                throw new AppError('Each mapping needs a question key', 400, 'VALIDATION_ERROR');
            }
            const crmField = row.crmField === null || row.crmField === undefined || row.crmField === ''
                ? null : String(row.crmField);
            if (crmField !== null && !MAPPABLE_FIELDS.has(crmField)) {
                throw new AppError(`Unknown CRM field: ${crmField}`, 400, 'VALIDATION_ERROR');
            }
            if (crmField !== null) {
                if (targets.has(crmField)) {
                    throw new AppError(`CRM field "${crmField}" is mapped more than once`, 400, 'VALIDATION_ERROR');
                }
                targets.add(crmField);
            }
            cleaned.push({
                questionKey: key,
                questionLabel: row.questionLabel !== undefined && row.questionLabel !== null && row.questionLabel !== ''
                    ? String(row.questionLabel).trim().slice(0, 300)
                    : key,
                crmField,
            });
        }

        const where = { organizationId_formId: { organizationId, formId: String(formId) } };
        const existing = await prisma.metaLeadFormConfig.findUnique({ where });
        let row;
        if (existing) {
            row = await prisma.metaLeadFormConfig.update({
                where: { id: existing.id },
                data: { fieldMapping: cleaned },
            });
        } else {
            const pid = pageId !== undefined && pageId !== null ? String(pageId) : '';
            if (!digitsOnly(pid)) {
                throw new AppError('A valid Page ID is required to configure this form', 400, 'VALIDATION_ERROR');
            }
            const eff = await MetaAdsSettingsService.getEffectiveConfig(organizationId);
            await MetaAdsService.resolveLeadgenOrganization(pid, organizationId, eff);
            try {
                row = await prisma.metaLeadFormConfig.create({
                    data: {
                        organizationId,
                        formId: String(formId),
                        pageId: pid,
                        formName: formName !== undefined && formName !== null && formName !== ''
                            ? String(formName) : null,
                        isEnabled: true,
                        fieldMapping: cleaned,
                    },
                });
            } catch (err) {
                // Concurrent first-save race on the unique key → fall back to update.
                if (err && err.code === 'P2002') {
                    row = await prisma.metaLeadFormConfig.upsert({
                        where,
                        create: {
                            organizationId,
                            formId: String(formId),
                            pageId: pid,
                            formName: null,
                            isEnabled: true,
                            fieldMapping: cleaned,
                        },
                        update: { fieldMapping: cleaned },
                    });
                } else {
                    throw err;
                }
            }
        }

        // Counts only — question labels/answers are never written to audit.
        await audit(organizationId, userId, AUDIT_ACTIONS.META_LEAD_MAPPING_UPDATED,
            'MetaLeadFormConfig', row.id, {
                formId: String(formId),
                mapped: cleaned.filter((m) => m.crmField !== null).length,
                unmapped: cleaned.filter((m) => m.crmField === null).length,
            });
        return { formId: String(formId), ...configView(row) };
    }

    // Saved config for one form (used by tests/clients that only need state).
    static async getConfig({ organizationId, formId }) {
        const row = await prisma.metaLeadFormConfig.findUnique({
            where: { organizationId_formId: { organizationId, formId: String(formId) } },
        });
        return { formId: String(formId), ...configView(row) };
    }
}

module.exports = MetaLeadFormService;
