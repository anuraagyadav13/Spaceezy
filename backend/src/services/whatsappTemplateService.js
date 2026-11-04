'use strict';

const prisma = require('../db/prisma');
const { AppError } = require('../utils/errors');
const MetaWhatsAppProvider = require('../providers/whatsapp/metaProvider');
const { normalizeMetaTemplateName } = require('../utils/metaTemplateName');
const { TEMPLATE_LIBRARY, getCatalogEntry } = require('./templateCatalog');

// Meta <-> CRM template bridge.
//
// The CRM used to know only two template sources: org-local rows and the
// code-owned library. A template approved in WhatsApp Manager was therefore
// invisible here, and every mismatch (name, language, parameter count) only
// surfaced as a cryptic Meta rejection after a live send.
//
// This service adds the missing three capabilities:
//   1. listMetaTemplates   read approved templates from the WABA (cached 60s)
//   2. assertSendable      fail BEFORE sending with a human explanation
//   3. syncFromMeta        materialize Meta templates as local rows
//
// Verification is best-effort by design: a read-only probe that fails (token
// missing whatsapp_business_management, network blip) must never block a send
// that Meta might accept. Only a *definitive* answer blocks: the template list
// was read successfully and the requested name/language/count is wrong.

const CACHE_TTL_MS = 60_000;
const META_FIELDS = 'id,name,status,category,language,components';
const metaCache = new Map();

function clearMetaTemplateCache() {
    metaCache.clear();
}

function bodyComponent(template) {
    const components = Array.isArray(template && template.components) ? template.components : [];
    return components.find((c) => c && String(c.type).toUpperCase() === 'BODY') || null;
}

function bodyTextOf(template) {
    const body = bodyComponent(template);
    return body && typeof body.text === 'string' ? body.text : null;
}

// Number of {{1}} style placeholders Meta will require at send time. Returns
// null when the payload carries no body (older API shape) so callers can skip
// the check instead of guessing.
function placeholderCount(text) {
    if (typeof text !== 'string') return null;
    const matches = text.match(/\{\{\s*\d+\s*\}\}/g);
    return matches ? matches.length : 0;
}

// Meta bodies use positional {{1}}; local rows use named {{customer_name}} for
// the composer preview. Convert one to the other deterministically.
function renderNamedBody(text, names) {
    if (typeof text !== 'string') return null;
    return text.replace(/\{\{\s*(\d+)\s*\}\}/g, (whole, raw) => {
        const name = names[Number(raw) - 1];
        return name ? `{{${name}}}` : whole;
    });
}

function catalogEntryFor(metaName) {
    const wanted = normalizeMetaTemplateName(metaName);
    if (!wanted) return null;
    const direct = getCatalogEntry(metaName);
    if (direct && normalizeMetaTemplateName(direct.name) === wanted) return direct;
    const byNormalized = TEMPLATE_LIBRARY.find((entry) => normalizeMetaTemplateName(entry.name) === wanted);
    return byNormalized || null;
}

// Preserve the variable names an admin already filled in when the count still
// matches; otherwise fall back to the catalog, then to generic positional
// names. Order is significant: it is the order Meta expects parameters in.
function variableNamesFor(count, existing, catalogEntry) {
    const target = Number(count);
    if (!Number.isFinite(target) || target < 0) return Array.isArray(existing) ? existing.map(String) : [];
    const keep = Array.isArray(existing) ? existing.map(String) : [];
    if (keep.length === target) return keep;
    if (catalogEntry && Array.isArray(catalogEntry.variables) && catalogEntry.variables.length === target) {
        return [...catalogEntry.variables];
    }
    const out = [];
    for (let index = 0; index < target; index += 1) {
        out.push(keep[index] || `variable_${index + 1}`);
    }
    return out;
}

function humanizeName(metaName) {
    const words = String(metaName || '').split(/[_\s]+/).filter(Boolean);
    if (words.length === 0) return String(metaName || '');
    return words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}

// Preferred variant when a name exists in several languages: keep the language
// the local row already uses (never silently flip an admin's choice), else the
// most common production pair.
function pickVariant(variants, existingLanguage) {
    const withLanguage = variants.filter((variant) => variant.language);
    if (existingLanguage) {
        const wanted = String(existingLanguage).toLowerCase();
        const same = withLanguage.find((variant) => variant.language.toLowerCase() === wanted);
        if (same) return same;
    }
    for (const preferred of ['en_US', 'en']) {
        const match = withLanguage.find((variant) => variant.language.toLowerCase() === preferred.toLowerCase());
        if (match) return match;
    }
    return withLanguage[0] || variants[0] || null;
}

class WhatsappTemplateService {
    // Read-only Meta query. Cached briefly so one notify test does not spend
    // two Graph calls (guard + provider) on the same list.
    static async listMetaTemplates(credentials, options = {}) {
        if (!credentials || !credentials.wabaId) {
            throw new AppError(
                'A WhatsApp Business Account ID is required to read Meta templates. Save it in Integrations first.',
                400,
                'TEMPLATE_WABA_MISSING'
            );
        }
        const key = String(credentials.wabaId);
        const cached = metaCache.get(key);
        if (!options.force && cached && Date.now() - cached.at < CACHE_TTL_MS) {
            return cached.templates;
        }
        const provider = new MetaWhatsAppProvider();
        const data = await provider.graphGet(
            `/${encodeURIComponent(key)}/message_templates`,
            { fields: META_FIELDS, limit: 200 },
            credentials
        );
        const templates = (Array.isArray(data && data.data) ? data.data : [])
            .filter((entry) => entry && entry.name)
            .map((entry) => {
                const text = bodyTextOf(entry);
                return {
                    providerTemplateId: entry.id ? String(entry.id) : null,
                    name: String(entry.name),
                    status: String(entry.status || '').toUpperCase(),
                    category: entry.category ? String(entry.category).toUpperCase() : null,
                    language: entry.language ? String(entry.language) : null,
                    body: text,
                    variableCount: placeholderCount(text)
                };
            });
        metaCache.set(key, { at: Date.now(), templates });
        return templates;
    }

    // Pre-send guard. Throws an actionable AppError on a definitive mismatch;
    // returns { checked: false } when Meta cannot be asked (never blocks).
    static async assertSendable({ credentials, name, language, variableCount }) {
        if (!credentials || !credentials.wabaId) return { checked: false, reason: 'no-waba' };
        let templates;
        try {
            // Always fresh: a cached "missing" answer would keep blocking a
            // send for up to a minute after the admin fixed the template.
            templates = await WhatsappTemplateService.listMetaTemplates(credentials, { force: true });
        } catch (err) {
            console.warn('[whatsapp-template-guard] verification skipped', {
                reason: (err && err.message) || 'unknown'
            });
            return { checked: false, reason: 'unavailable' };
        }

        const wanted = normalizeMetaTemplateName(name);
        const matches = templates.filter((entry) => normalizeMetaTemplateName(entry.name) === wanted);
        if (matches.length === 0) {
            throw Object.assign(
                new AppError(
                    `Template "${name}" is not Meta-approved on this WhatsApp Business Account. Create it in WhatsApp Manager (name "${wanted}"), wait for Active, then retry.`,
                    400,
                    'TEMPLATE_NOT_APPROVED'
                ),
                { permanent: true }
            );
        }

        const approved = matches.filter((entry) => entry.status === 'APPROVED');
        if (approved.length === 0) {
            const status = matches[0].status || 'NOT_APPROVED';
            throw Object.assign(
                new AppError(
                    `Template "${name}" is ${status} on Meta, not approved. Wait for Meta review (or fix the rejection) before sending.`,
                    400,
                    'TEMPLATE_NOT_APPROVED'
                ),
                { permanent: true }
            );
        }

        const languages = [...new Set(matches.map((entry) => entry.language).filter(Boolean))];
        let chosen = pickVariant(approved, language);
        if (language && languages.length > 0) {
            const wantedLanguage = String(language).toLowerCase();
            const exact = approved.find(
                (entry) => entry.language && entry.language.toLowerCase() === wantedLanguage
            );
            if (!exact) {
                throw Object.assign(
                    new AppError(
                        `Template "${name}" is approved in ${languages.join(', ')}, but the CRM sends "${language}". Set the CRM template language to one of: ${languages.join(', ')}.`,
                        400,
                        'TEMPLATE_LANGUAGE_MISMATCH'
                    ),
                    { permanent: true }
                );
            }
            chosen = exact;
        }

        if (variableCount !== null && variableCount !== undefined
            && chosen && chosen.variableCount !== null && chosen.variableCount !== undefined
            && Number(chosen.variableCount) !== Number(variableCount)) {
            throw Object.assign(
                new AppError(
                    `Template "${name}" (${chosen.language || 'default'}) has ${chosen.variableCount} placeholder(s), but the CRM row defines ${variableCount} variable(s). Make both counts equal (order matters).`,
                    400,
                    'TEMPLATE_PARAMETER_MISMATCH'
                ),
                { permanent: true }
            );
        }

        return { checked: true, template: chosen };
    }

    // Upsert exactly one Meta template variant into the local table.
    static async importMetaTemplate(organizationId, userId, credentials, { name, language } = {}) {
        if (!name) throw new AppError('Template name is required', 400, 'VALIDATION_ERROR');
        const templates = await WhatsappTemplateService.listMetaTemplates(credentials, { force: true });
        const wanted = normalizeMetaTemplateName(name);
        const variants = templates.filter((entry) => normalizeMetaTemplateName(entry.name) === wanted);
        if (variants.length === 0) {
            throw new AppError(`Template "${name}" was not found on Meta`, 404, 'NOT_FOUND');
        }
        const approved = variants.filter((entry) => entry.status === 'APPROVED');
        if (approved.length === 0) {
            throw new AppError(
                `Template "${name}" is ${variants[0].status || 'not approved'} on Meta, not approved yet`,
                409,
                'TEMPLATE_NOT_APPROVED'
            );
        }
        const chosen = language
            ? approved.find((entry) => entry.language && entry.language.toLowerCase() === String(language).toLowerCase())
            : pickVariant(approved, null);
        if (!chosen) {
            const languages = [...new Set(approved.map((entry) => entry.language).filter(Boolean))];
            throw new AppError(
                `Template "${name}" is not approved in "${language}". Available: ${languages.join(', ')}`,
                400,
                'TEMPLATE_LANGUAGE_MISMATCH'
            );
        }
        return await WhatsappTemplateService.saveMetaVariant(organizationId, userId, chosen);
    }

    // Materialize every approved Meta template as a local row. Existing rows
    // keep their variable names whenever the count still matches, and keep
    // their language when Meta has that variant.
    static async syncFromMeta(organizationId, userId, credentials, options = {}) {
        const templates = await WhatsappTemplateService.listMetaTemplates(credentials, { force: options.force !== false });
        const approved = templates.filter((entry) => entry.status === 'APPROVED');
        const existingRows = await prisma.whatsAppTemplate.findMany({ where: { organizationId } });
        const byNormalized = new Map();
        for (const row of existingRows) {
            byNormalized.set(normalizeMetaTemplateName(row.name), row);
        }

        const groups = new Map();
        for (const entry of approved) {
            const key = normalizeMetaTemplateName(entry.name);
            if (!key) continue;
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(entry);
        }

        const imported = [];
        const updated = [];
        const skipped = [];

        for (const [key, variants] of groups) {
            const existing = byNormalized.get(key) || null;
            const chosen = pickVariant(variants, existing && existing.language);
            if (!chosen) {
                skipped.push(key);
                continue;
            }
            try {
                const saved = await WhatsappTemplateService.saveMetaVariant(
                    organizationId, userId, chosen, existing
                );
                if (existing) updated.push(saved);
                else imported.push(saved);
            } catch (err) {
                if (err && err.code === 'P2002') skipped.push(key);
                else throw err;
            }
        }

        return {
            imported: imported.length,
            updated: updated.length,
            skipped,
            templates: [...imported, ...updated].map((row) => ({
                id: row.id,
                name: row.name,
                language: row.language,
                category: row.category,
                variables: Array.isArray(row.variables) ? row.variables : [],
                active: row.active
            }))
        };
    }

    static async saveMetaVariant(organizationId, userId, metaTemplate, existingRow = null) {
        // Match on the normalized name, not the display name: Meta stores
        // `enquiry_follow_up` while the local row is "Enquiry Follow-up".
        // Without this, an import would create a second row for one template.
        let existing = existingRow;
        if (!existing) {
            const rows = await prisma.whatsAppTemplate.findMany({ where: { organizationId } });
            const wanted = normalizeMetaTemplateName(metaTemplate.name);
            existing = rows.find((row) => normalizeMetaTemplateName(row.name) === wanted) || null;
        }
        const catalogEntry = catalogEntryFor(metaTemplate.name);
        const names = variableNamesFor(
            metaTemplate.variableCount,
            existing && existing.variables,
            catalogEntry
        );
        const payload = {
            providerTemplateId: metaTemplate.providerTemplateId,
            language: metaTemplate.language || (existing && existing.language) || 'en_US',
            category: metaTemplate.category || (existing && existing.category) || 'UTILITY',
            body: renderNamedBody(metaTemplate.body, names) || (existing && existing.body) || null,
            variables: names,
            active: true
        };

        if (existing) {
            return await prisma.whatsAppTemplate.update({ where: { id: existing.id }, data: payload });
        }
        return await prisma.whatsAppTemplate.create({
            data: {
                organizationId,
                name: humanizeName(metaTemplate.name),
                createdById: userId || null,
                ...payload
            }
        });
    }
}

module.exports = WhatsappTemplateService;
module.exports.clearMetaTemplateCache = clearMetaTemplateCache;
module.exports.placeholderCount = placeholderCount;
module.exports.renderNamedBody = renderNamedBody;
module.exports.pickVariant = pickVariant;
