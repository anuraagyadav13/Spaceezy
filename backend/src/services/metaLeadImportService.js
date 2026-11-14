const { AppError } = require('../utils/errors');
const { graphRequest } = require('./metaGraph');
const LeadService = require('./leadService');
const { audit, AUDIT_ACTIONS } = require('../utils/audit');
const prisma = require('../db/prisma');
const { parseBudgetValue } = require('../utils/budgetParser');
const {
    PROPERTY_TYPES,
    configurationsFor,
    isValidConfiguration,
    extractBhk,
} = require('../utils/propertyRequirement');
const { MAPPABLE_FIELDS } = require('../constants/metaLeadMapping');

// ---------------------------------------------------------------------------
// Phase 2 — the SINGLE lead import path shared by the leadgen webhook and the
// historical backfill (2F: webhook and backfill must not diverge).
//
// Guarantees:
// - Dedup key is (organizationId, metaLeadId): pre-check + P2002 recovery, so
//   repeated webhook deliveries and repeated backfills are idempotent and a
//   concurrent race can never create two rows.
// - Leads are created through the existing LeadService.createLead, so
//   organization scoping, source/status conventions, self-claim eligibility,
//   claim limits and WhatsApp notifications behave exactly like every other
//   lead. No round-robin, no separate Meta leads store.
// - Mapping never invents data: unmatched Project/Property/Type answers stay
//   as text (requestedProjectName / metaAnswers) instead of pointing at a
//   random record; every original question/answer is preserved in
//   Lead.metaAnswers; only an answer explicitly mapped to "Additional
//   Requirements" is written to `message`.
// - Sync events/runs are written best-effort (a log failure must never drop a
//   lead) and contain Meta identifiers + status + error codes only — no raw
//   lead PII, never tokens or secrets.
// ---------------------------------------------------------------------------

const SOURCE_WEBHOOK = 'WEBHOOK';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Bounded retry for transient provider failures (429 / 5xx). Permanent
// errors are never retried. Callers still bound the total work with their
// own page/attempt caps — there is no unbounded loop anywhere here.
async function retryTransient(fn, { attempts = 3, baseMs = 200 } = {}) {
    let lastErr = null;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
        try {
            return await fn();
        } catch (err) {
            lastErr = err;
            const status = Number(err && err.statusCode) || 500;
            const transient = status === 429 || status >= 500;
            if (!transient || attempt === attempts - 1) throw err;
            await sleep(baseMs * Math.pow(2, attempt));
        }
    }
    throw lastErr;
}

function numOrNull(value) {
    if (value === null || value === undefined || value === '') return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
}

function toDate(unixSeconds) {
    const n = Number(unixSeconds);
    return Number.isFinite(n) && n > 0 ? new Date(n * 1000) : null;
}

// --------------------------- answer normalization --------------------------

// Case/space-insensitive slug so a saved mapping can match Meta's field_data
// name whether it arrives as "budget", "Budget" or "budget_est".
function slugKey(text) {
    return String(text || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
}

// Snapshot of every Meta answer with its ORIGINAL key/label/values — this is
// what lands in Lead.metaAnswers (mapped or not).
function buildAnswers(detail) {
    const fields = Array.isArray(detail && detail.field_data) ? detail.field_data : [];
    const answers = [];
    const lookup = new Map();
    for (const field of fields) {
        if (!field || typeof field.name !== 'string') continue;
        const values = Array.isArray(field.values) ? field.values.map((v) => String(v)) : [];
        const label = field.label || field.question_text || field.name;
        const answer = {
            questionKey: field.name,
            questionLabel: String(label),
            values,
        };
        answers.push(answer);
        const keys = new Set([field.name.toLowerCase(), slugKey(field.name), slugKey(label)]);
        for (const k of keys) {
            if (k && !lookup.has(k)) lookup.set(k, answer);
        }
    }
    return { answers, lookup };
}

function findAnswer(lookup, questionKey, questionLabel) {
    const candidates = [questionKey, slugKey(questionKey), slugKey(questionLabel)];
    for (const k of candidates) {
        if (k && lookup.has(k)) return lookup.get(k);
    }
    return null;
}

function firstValue(answer) {
    if (!answer) return '';
    const v = (answer.values || []).find((x) => String(x).trim() !== '');
    return v === undefined ? '' : String(v).trim();
}

// Validation only — the ORIGINAL submitted string is what gets stored.
function isValidPhone(raw) {
    const digits = String(raw || '').replace(/\D/g, '');
    return digits.length >= 10 && digits.length <= 15;
}

function isValidEmail(raw) {
    const s = String(raw || '').trim();
    return s !== '' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

function parseSiteVisitDate(raw) {
    const s = String(raw || '').trim();
    if (!s) return null;
    let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
    if (m) return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
    m = /^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/.exec(s); // DD/MM/YYYY (en-IN)
    if (m) return new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1])));
    // Free text only accepted when it contains an explicit year — otherwise a
    // permissive Date parse could invent a date.
    if (/\b(19|20)\d{2}\b/.test(s)) {
        const d = new Date(s);
        if (!Number.isNaN(d.getTime())) return d;
    }
    return null;
}

const BUDGET_UNITS = ['crore', 'cr', 'lakh', 'lac', 'lk', 'l', 'k'];

function scaleBudget(value, unit) {
    const u = String(unit || '').toLowerCase();
    if (u === 'crore' || u === 'cr') return Math.round(value * 10000000);
    if (u === 'lakh' || u === 'lac' || u === 'lk' || u === 'l') return Math.round(value * 100000);
    if (u === 'k') return Math.round(value * 1000);
    return null;
}

// Parses "75 Lakhs", "1.5 Cr - 2 Cr", "₹95L", "50000000" into an explicit
// { min, max } requirement. Unparseable input returns null (the answer stays
// in metaAnswers; no fabricated number is ever stored).
function parseBudgetRange(raw) {
    const text = String(raw || '').trim();
    if (!text) return null;
    const cleaned = text.replace(/[₹,\s]/g, '');
    const unitAlt = BUDGET_UNITS.join('|');
    const range = new RegExp(`^([\\d.]+)(${unitAlt})?(?:-|–|to)([\\d.]+)(${unitAlt})?$`, 'i').exec(cleaned);
    if (range) {
        const a = Number(range[1]);
        const b = Number(range[3]);
        if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
        const unitA = range[2] || range[4] || '';
        const unitB = range[4] || range[2] || '';
        const va = scaleBudget(a, unitA);
        const vb = scaleBudget(b, unitB);
        if (va === null && unitA) return null;
        if (vb === null && unitB) return null;
        // Unitless bounds stay raw only when BOTH sides are unitless (the
        // bare-number guard in parseBudgetValue rejects sub-10k guesses).
        const finalA = va !== null ? va : a;
        const finalB = vb !== null ? vb : b;
        if (finalA < 10000 && finalB < 10000) return null;
        return { min: Math.min(finalA, finalB), max: Math.max(finalA, finalB) };
    }
    const single = parseBudgetValue(cleaned);
    if (single === null) return null;
    return { min: single, max: single };
}

// Canonical configuration label ONLY when the answer can be canonicalized
// ("3bhk" → "3 BHK", "studio" → "Studio"); anything else returns null and the
// raw answer stays untouched in metaAnswers (never invented, never coerced).
function canonicalConfiguration(raw) {
    const s = String(raw || '').trim();
    if (!s) return null;
    const bhk = extractBhk(s);
    if (bhk !== null) return `${bhk} BHK`;
    const lower = s.toLowerCase();
    for (const type of PROPERTY_TYPES) {
        for (const vocab of configurationsFor(type)) {
            if (vocab.toLowerCase() === lower) return vocab;
        }
    }
    return null;
}

function canonicalPropertyType(raw) {
    const s = String(raw || '').trim().toLowerCase();
    for (const type of PROPERTY_TYPES) {
        if (type.toLowerCase() === s) return type;
    }
    return null;
}

// ------------------------------ payload build ------------------------------

// Applies the saved form mapping (plus identity fallbacks) to a Meta lead
// detail and returns the LeadService.createLead payload. Every answer —
// mapped or unmapped, before any normalization — is preserved in
// `metaAnswers`. Inventory references are only set on an exact match inside
// the organization; an unmatched Project answer becomes requestedProjectName
// (the existing free-text convention), never a random Project row.
async function buildLeadPayload({ organizationId, detail, mapping }) {
    const { answers, lookup } = buildAnswers(detail);
    const byField = new Map();
    const rows = Array.isArray(mapping) ? mapping : [];
    for (const row of rows) {
        if (!row || !row.crmField || !MAPPABLE_FIELDS.has(String(row.crmField))) continue;
        const answer = findAnswer(lookup, row.questionKey, row.questionLabel);
        if (answer && !byField.has(row.crmField)) byField.set(row.crmField, answer);
    }

    // Identity fallbacks keep Phase 1 behavior when a question is unmapped.
    const nameAnswer = byField.get('fullName')
        || lookup.get('full_name') || lookup.get('name') || null;
    const firstAnswer = lookup.get('first_name') || null;
    const lastAnswer = lookup.get('last_name') || null;
    const phoneAnswer = byField.get('mobile')
        || lookup.get('phone_number') || lookup.get('phone') || lookup.get('mobile') || null;
    const emailAnswer = byField.get('email') || lookup.get('email') || lookup.get('email_address') || null;

    const fullName = firstValue(nameAnswer);
    const joinedName = `${firstValue(firstAnswer)} ${firstValue(lastAnswer)}`.trim();
    const name = fullName || joinedName;
    const phoneRaw = firstValue(phoneAnswer);
    const emailRaw = firstValue(emailAnswer);

    const payload = {
        name: name || 'Meta Lead',
        // Original submitted value — validated, never rewritten.
        phone: isValidPhone(phoneRaw) ? phoneRaw : '',
        email: isValidEmail(emailRaw) ? emailRaw : null,
        message: null,
    };

    const takeText = (field) => {
        const answer = byField.get(field);
        if (!answer) return null;
        return firstValue(answer);
    };

    // --- Project: exact name match only -------------------------------
    const projectText = takeText('project');
    if (projectText) {
        const project = await prisma.project.findFirst({
            where: { organizationId, name: { equals: projectText, mode: 'insensitive' } },
            select: { id: true },
        });
        if (project) payload.projectId = project.id;
        else payload.requestedProjectName = projectText;
    }

    // --- Property: exact title/unit match (scoped to the project when
    // known). No match → nothing is linked (the answer stays in metaAnswers).
    const propertyText = takeText('property');
    if (propertyText) {
        const property = await prisma.property.findFirst({
            where: {
                organizationId,
                ...(payload.projectId ? { projectId: payload.projectId } : {}),
                OR: [
                    { title: { equals: propertyText, mode: 'insensitive' } },
                    { unitNumber: { equals: propertyText, mode: 'insensitive' } },
                ],
            },
            select: { id: true, projectId: true },
        });
        if (property) payload.propertyId = property.id;
    }

    // --- Property type: canonical vocabulary only ----------------------
    const typeText = takeText('propertyType');
    if (typeText) {
        const canonicalType = canonicalPropertyType(typeText);
        if (canonicalType) payload.propertyType = canonicalType;
    }

    // --- Configuration / BHK ------------------------------------------
    // A multi-select question can map several values to Configuration.
    const mappedConfigAnswer = byField.get('configuration');
    const configValues = mappedConfigAnswer
        ? (mappedConfigAnswer.values || []).map((v) => String(v).trim()).filter(Boolean)
        : [];
    const labels = [];
    for (const raw of configValues) {
        const canonical = canonicalConfiguration(raw);
        if (canonical && !labels.includes(canonical)) labels.push(canonical);
    }
    if (labels.length > 0) payload.configurations = labels;
    if (payload.projectId && labels.length > 0) {
        const configs = await prisma.configuration.findMany({
            where: { organizationId, projectId: payload.projectId },
            select: { id: true, name: true },
        });
        const match = configs.find((c) => labels.includes(c.name));
        if (match) payload.configurationId = match.id;
    }

    // --- Budget --------------------------------------------------------
    const budgetText = takeText('budget');
    if (budgetText) {
        const range = parseBudgetRange(budgetText);
        if (range) {
            payload.budgetMin = range.min;
            payload.budgetMax = range.max;
        }
    }

    // --- Preferred location → enquiryLocation (free text by design: Meta
    // answers are arbitrary area names that cannot resolve to a location row)
    const locationText = takeText('preferredLocation');
    if (locationText) payload.enquiryLocation = locationText;

    // --- Site visit date ------------------------------------------------
    const dateText = takeText('siteVisitDate');
    if (dateText) {
        const date = parseSiteVisitDate(dateText);
        if (date) payload.preferredVisitDate = date;
    }

    // --- Additional requirements → `message` (the ONLY answer allowed there)
    const requirementsText = takeText('additionalRequirements');
    if (requirementsText) payload.message = requirementsText;

    // Every original answer, mapped or not — nothing is discarded.
    const mappedByAnswer = new Map();
    for (const [field, answer] of byField) {
        if (!mappedByAnswer.has(answer)) mappedByAnswer.set(answer, field);
    }
    payload.metaAnswers = answers.map((answer) => ({
        questionKey: answer.questionKey,
        questionLabel: answer.questionLabel,
        values: answer.values,
        mappedField: mappedByAnswer.get(answer) || null,
    }));

    return { payload };
}

// ----------------------------- sync bookkeeping ----------------------------

// Best-effort event log: a logging failure must never fail a lead import.
async function recordEvent({ organizationId, source, metaLeadId, pageId, formId, leadId, status, errorCode, runId }) {
    const key = String(metaLeadId || '').trim();
    if (!/^\d+$/.test(key)) return;
    try {
        const existing = await prisma.metaLeadSyncEvent.findUnique({
            where: { organizationId_idempotencyKey: { organizationId, idempotencyKey: key } },
        });
        const now = new Date();
        if (!existing) {
            await prisma.metaLeadSyncEvent.create({
                data: {
                    organizationId,
                    idempotencyKey: key,
                    metaLeadId: key,
                    pageId: pageId || null,
                    formId: formId || null,
                    leadId: leadId || null,
                    source,
                    status,
                    attemptCount: 1,
                    errorCode: errorCode || null,
                    runId: runId || null,
                    processedAt: status === 'FAILED' ? null : now,
                },
            });
            return;
        }
        // An imported lead is never downgraded by a later redelivery/attempt.
        const nextStatus = existing.status === 'IMPORTED' ? 'IMPORTED' : status;
        await prisma.metaLeadSyncEvent.update({
            where: { id: existing.id },
            data: {
                attemptCount: { increment: 1 },
                source,
                status: nextStatus,
                errorCode: nextStatus === 'FAILED' ? (errorCode || existing.errorCode) : null,
                leadId: leadId || existing.leadId,
                pageId: pageId || existing.pageId,
                formId: formId || existing.formId,
                runId: runId || existing.runId,
                processedAt: nextStatus === 'FAILED' ? existing.processedAt : now,
            },
        });
    } catch (err) {
        console.warn('[meta-lead-sync] event write failed', { code: (err && err.code) || 'UNKNOWN' });
    }
}

// Webhook sync runs are created after the outcome (single-lead batch) so the
// Sync History tab shows accurate counts per delivery. Backfill/retry runs
// are created up-front by metaLeadSyncService and passed in as runId.
async function createWebhookRun({ organizationId, formId, pageId, counts, status, errorCode }) {
    try {
        const run = await prisma.metaLeadSyncRun.create({
            data: {
                organizationId,
                formId: formId || '',
                pageId: pageId || '',
                source: SOURCE_WEBHOOK,
                status,
                errorCode: errorCode || null,
                startedAt: new Date(),
                completedAt: new Date(),
                fetchedCount: counts.fetched,
                importedCount: counts.imported,
                duplicateCount: counts.duplicates,
                skippedCount: counts.skipped,
                failedCount: counts.failed,
            },
        });
        return run && run.id ? run.id : null;
    } catch (err) {
        console.warn('[meta-lead-sync] run write failed', { code: (err && err.code) || 'UNKNOWN' });
        return null;
    }
}

async function touchFormSync(organizationId, formId) {
    if (!formId) return;
    try {
        await prisma.metaLeadFormConfig.updateMany({
            where: { organizationId, formId },
            data: { lastSyncedAt: new Date() },
        });
    } catch (err) {
        console.warn('[meta-lead-sync] lastSyncedAt write failed', { code: (err && err.code) || 'UNKNOWN' });
    }
}

class MetaLeadImportService {
    // Single import path for webhook AND backfill (2F). Throws AppError for
    // anything that must not be reported as imported; returns
    // { ok, leadId, duplicate?, ignored? } otherwise. `resolveToken` is
    // invoked only after the dedupe check so the existing webhook contract
    // (duplicate short-circuit without any Meta call, 503 before fetch) holds.
    static async importLead({ organizationId, eff, value, source = SOURCE_WEBHOOK, runId = null, resolveToken }) {
        const leadgenId = value && value.leadgen_id !== undefined && value.leadgen_id !== null
            ? String(value.leadgen_id) : '';
        if (!/^\d+$/.test(leadgenId)) {
            throw new AppError('Invalid leadgen payload: leadgen_id missing', 400, 'VALIDATION_ERROR');
        }
        const pageId = value && value.page_id !== undefined && value.page_id !== null
            ? String(value.page_id) : '';
        const formId = value && value.form_id !== undefined && value.form_id !== null
            ? String(value.form_id) : '';

        let currentRunId = runId;
        const webhookRun = async (outcome, errorCode = null) => {
            if (source !== SOURCE_WEBHOOK || currentRunId) return currentRunId;
            const counts = {
                fetched: 1,
                imported: outcome === 'imported' ? 1 : 0,
                duplicates: outcome === 'duplicate' ? 1 : 0,
                skipped: outcome === 'ignored' ? 1 : 0,
                failed: outcome === 'failed' ? 1 : 0,
            };
            currentRunId = await createWebhookRun({
                organizationId, formId, pageId, counts,
                status: outcome === 'failed' ? 'FAILED' : 'COMPLETED',
                errorCode,
            });
            return currentRunId;
        };

        try {
            // 1) Dedupe (pre-check): a redelivery/repeat backfill never fetches
            //    from Meta twice and never creates a second row.
            const existing = await prisma.lead.findFirst({
                where: { organizationId, metaLeadId: leadgenId },
            });
            if (existing) {
                const rid = await webhookRun('duplicate');
                await recordEvent({
                    organizationId, source, metaLeadId: leadgenId, pageId, formId,
                    leadId: existing.id, status: 'DUPLICATE', runId: rid,
                });
                return { ok: true, duplicate: true, leadId: existing.id };
            }

            // 2) Form sync gate (webhook only): an explicitly disabled form
            //    records an ignored event and creates no lead. A form that has
            //    never been configured keeps ingesting (Phase 1 behavior) —
            //    see docs/META_ADS_LEAD_SYNC.md.
            let config = null;
            if (formId && source === SOURCE_WEBHOOK) {
                config = await prisma.metaLeadFormConfig.findUnique({
                    where: { organizationId_formId: { organizationId, formId } },
                });
                if (config && config.isEnabled === false) {
                    const rid = await webhookRun('ignored');
                    await recordEvent({
                        organizationId, source, metaLeadId: leadgenId, pageId, formId,
                        status: 'IGNORED', errorCode: 'FORM_DISABLED', runId: rid,
                    });
                    return { ok: true, ignored: 'form_disabled' };
                }
            }

            // 3) Token resolution (contract preserved: 503 on the webhook path
            //    so Meta keeps retrying until the connection is fixed).
            const token = typeof resolveToken === 'function' ? resolveToken() : '';

            // 4) Full details always come from Meta, never from the webhook body.
            let detail;
            try {
                detail = await graphRequest({
                    path: leadgenId,
                    params: { fields: 'id,created_time,field_data,ad_id,adset_id,campaign_id,form_id' },
                    token,
                    version: eff.graphVersion,
                });
            } catch (err) {
                // Deleted/inaccessible leads must not retry forever.
                if (err && err.metaCode === 100) {
                    const rid = await webhookRun('ignored');
                    await recordEvent({
                        organizationId, source, metaLeadId: leadgenId, pageId, formId,
                        status: 'IGNORED', errorCode: 'LEAD_DELETED', runId: rid,
                    });
                    return { ok: true, ignored: 'lead_deleted' };
                }
                throw err;
            }

            // 5) Apply the saved field mapping (identity fallbacks included).
            const { payload } = await buildLeadPayload({
                organizationId,
                detail: detail || {},
                mapping: config && Array.isArray(config.fieldMapping) ? config.fieldMapping : [],
            });
            if (!payload.phone) {
                const rid = await webhookRun('ignored');
                await recordEvent({
                    organizationId, source, metaLeadId: leadgenId, pageId, formId,
                    status: 'IGNORED', errorCode: 'NO_IDENTITY', runId: rid,
                });
                return { ok: true, ignored: 'no_identity' };
            }

            // 6) Campaign name enrichment — best effort, never blocks import.
            const campaignId = detail.campaign_id !== undefined && detail.campaign_id !== null
                ? String(detail.campaign_id) : null;
            let campaignName = null;
            if (campaignId && /^\d+$/.test(campaignId)) {
                try {
                    const campaign = await graphRequest({
                        path: campaignId, params: { fields: 'id,name' }, token, version: eff.graphVersion,
                    });
                    if (campaign && campaign.name) campaignName = String(campaign.name);
                } catch {
                    campaignName = null;
                }
            }

            // 7) Attribution — only what Meta actually reports; platform is
            //    never guessed (null unless the webhook says Facebook/Instagram).
            const platformRaw = value.platform || value.publisher || null;
            const metaPlatform = platformRaw === 'Facebook' || platformRaw === 'Instagram' ? platformRaw : null;
            const attributes = {
                metaLeadId: leadgenId,
                metaPageId: pageId || null,
                metaFormId: detail.form_id !== undefined && detail.form_id !== null
                    ? String(detail.form_id) : (formId || null),
                metaAdId: detail.ad_id !== undefined && detail.ad_id !== null
                    ? String(detail.ad_id)
                    : (value.ad_id !== undefined && value.ad_id !== null ? String(value.ad_id) : null),
                metaAdsetId: detail.adset_id !== undefined && detail.adset_id !== null
                    ? String(detail.adset_id) : null,
                metaCampaignId: campaignId,
                metaCampaignName: campaignName,
                metaPlatform,
                metaCreatedAt: toDate(value.created_time ?? detail.created_time),
            };

            // 8) Conservative phone-match attach (existing public-enquiry
            //    convention): attribution travels with the latest touch;
            //    identity, message, status and ownership are never overwritten.
            const phoneMatch = await prisma.lead.findFirst({
                where: { organizationId, phone: payload.phone },
            });
            if (phoneMatch) {
                const updated = await prisma.lead.update({
                    where: { id: phoneMatch.id },
                    data: {
                        ...attributes,
                        campaign: campaignName || phoneMatch.campaign,
                        // Reopen stale interest; an active pipeline stage is untouched.
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
                await touchFormSync(organizationId, attributes.metaFormId);
                const rid = await webhookRun('duplicate');
                await recordEvent({
                    organizationId, source, metaLeadId: leadgenId, pageId, formId: attributes.metaFormId,
                    leadId: updated.id, status: 'DUPLICATE', runId: rid,
                });
                return { ok: true, duplicate: true, leadId: updated.id };
            }

            // 9) Create through the EXISTING lead service: same normalization,
            //    inventory validation, budget sync, self-claim eligibility,
            //    activity trail and WhatsApp notification outbox as manual leads.
            let created;
            try {
                created = await LeadService.createLead({
                    ...payload,
                    ...attributes,
                    source: 'Meta',
                    campaign: campaignName,
                    status: 'NEW',
                }, organizationId, null);
            } catch (err) {
                // Concurrent duplicate delivery: unique (organizationId, metaLeadId).
                if (err && err.code === 'P2002') {
                    const winner = await prisma.lead.findFirst({
                        where: { organizationId, metaLeadId: leadgenId },
                    });
                    const rid = await webhookRun('duplicate');
                    await recordEvent({
                        organizationId, source, metaLeadId: leadgenId, pageId, formId,
                        leadId: winner ? winner.id : null, status: 'DUPLICATE', runId: rid,
                    });
                    return { ok: true, duplicate: true, leadId: winner ? winner.id : null };
                }
                throw err;
            }

            await prisma.leadActivity.create({
                data: {
                    organizationId,
                    leadId: created.id,
                    type: 'NOTE',
                    description: 'Meta Lead Ad synced from Facebook/Instagram lead form',
                    metadata: {
                        metaLeadId: leadgenId,
                        metaFormId: attributes.metaFormId,
                        metaCampaignId: campaignId,
                    },
                },
            });
            await audit(organizationId, null, AUDIT_ACTIONS.META_LEAD_SYNC, 'Lead', created.id, {
                metaLeadId: leadgenId,
            });
            await touchFormSync(organizationId, attributes.metaFormId);
            const rid = await webhookRun('imported');
            await recordEvent({
                organizationId, source, metaLeadId: leadgenId, pageId, formId: attributes.metaFormId,
                leadId: created.id, status: 'IMPORTED', runId: rid,
            });
            return { ok: true, leadId: created.id };
        } catch (err) {
            // Never reported as imported: record a FAILED attempt (safe code
            // only) and rethrow so webhook batch isolation / backfill counts
            // classify it correctly.
            const status = Number(err && err.statusCode) || 500;
            const rid = await webhookRun('failed', (err && err.code) || 'UNKNOWN');
            await recordEvent({
                organizationId, source, metaLeadId: leadgenId, pageId, formId,
                status: 'FAILED', errorCode: (err && err.code) || `HTTP_${status}`, runId: rid,
            });
            throw err;
        }
    }

    static buildLeadPayload(args) {
        return buildLeadPayload(args);
    }

    static recordEvent(args) {
        return recordEvent(args);
    }

    static retryTransient(fn, opts) {
        return retryTransient(fn, opts);
    }

    static parseBudgetRange(value) {
        return parseBudgetRange(value);
    }

}

module.exports = MetaLeadImportService;
