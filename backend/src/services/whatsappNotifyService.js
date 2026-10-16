const prisma = require('../db/prisma');
const { AppError } = require('../utils/errors');
const { audit, AUDIT_ACTIONS } = require('../utils/audit');
const { getWhatsAppProvider } = require('../providers/whatsapp');
const MetaWhatsAppProvider = require('../providers/whatsapp/metaProvider');
const WhatsappSettingsService = require('./whatsappSettingsService');
const { getCatalogEntry } = require('./templateCatalog');

// Outbox-driven new-lead WhatsApp notifications (owner/team alerts, never
// customer messages). Design notes:
// - One row per (organization, lead, recipient) — the unique constraint makes
//   retries, redeliveries and concurrent processing idempotent by construction.
// - Sending happens OUTSIDE any lead-creation transaction; enqueue failures
//   never break lead creation (all errors contained here).
// - No job infrastructure exists, so retries are bounded inline setTimeout
//   chains (documented upgrade path: persistent scheduler). Mock mode never
//   touches the network.
// - Template approval is VERIFIED live via Meta before every Meta-mode send;
//   local library names are never treated as approved.

const MAX_ATTEMPTS = 3;
const RETRY_DELAYS_MS = [5000, 30000];
const NOTIFY_VARIABLES = {
    customer_name: (lead) => lead.name,
    lead_name: (lead) => lead.name,
    lead_source: (lead) => lead.source,
    source: (lead) => lead.source,
    project_name: (lead) => (lead.project ? lead.project.name : null),
    project: (lead) => (lead.project ? lead.project.name : null),
    assigned_employee: (lead) => (lead.assignedTo ? lead.assignedTo.name : null),
    salesperson: (lead) => (lead.assignedTo ? lead.assignedTo.name : null),
    salesperson_name: (lead) => (lead.assignedTo ? lead.assignedTo.name : null),
};

function normalizeRecipient(phone) {
    const digits = String(phone || '').replace(/\D/g, '');
    if (!/^[1-9]\d{7,14}$/.test(digits)) {
        throw new AppError('Recipient phone number is not a valid E.164 number', 400, 'INVALID_RECIPIENT');
    }
    return digits;
}

function enabledRecipients(settings) {
    const list = settings && Array.isArray(settings.notifyRecipients) ? settings.notifyRecipients : [];
    const out = [];
    for (const entry of list) {
        if (!entry || entry.enabled === false) continue;
        try {
            out.push({ phone: normalizeRecipient(entry.phone), label: entry.label || entry.phone });
        } catch {
            continue;
        }
    }
    return out;
}

class WhatsappNotifyService {
    static async resolveTemplate(organizationId, templateName) {
        if (!templateName) {
            throw new AppError('No notification template configured', 409, 'TEMPLATE_NOT_CONFIGURED');
        }
        let template = await prisma.whatsAppTemplate.findFirst({
            where: { organizationId, name: templateName },
        });
        // Library picks provision a local row on first use (same semantics as
        // center sends); unknown names stay 404. No Meta calls happen here.
        if (!template && getCatalogEntry(templateName)) {
            try {
                template = await prisma.whatsAppTemplate.create({
                    data: {
                        organizationId,
                        name: getCatalogEntry(templateName).name,
                        providerTemplateId: null,
                        language: 'en',
                        category: getCatalogEntry(templateName).metaCategory,
                        description: getCatalogEntry(templateName).description,
                        body: getCatalogEntry(templateName).body,
                        variables: [...getCatalogEntry(templateName).variables],
                        active: true,
                        createdById: null,
                    },
                });
            } catch (err) {
                if (err && err.code === 'P2002') {
                    template = await prisma.whatsAppTemplate.findFirst({
                        where: { organizationId, name: templateName },
                    });
                } else {
                    throw err;
                }
            }
        }
        if (!template) throw new AppError('Notification template not found', 404, 'NOT_FOUND');
        if (!template.active) throw new AppError('Notification template is inactive', 409, 'TEMPLATE_INACTIVE');
        return template;
    }

    // Live approval check against Meta (meta mode only). Returns silently on
    // success; throws a permanent, non-retryable error otherwise. Uses the
    // WABA template list — local library names are never treated as approved.
    static async verifyTemplateApproval(credentials, templateName) {
        if (!credentials || !credentials.wabaId) {
            throw Object.assign(
                new AppError('Template approval cannot be verified without a WABA ID', 400, 'TEMPLATE_NOT_APPROVED'),
                { permanent: true }
            );
        }
        const provider = new MetaWhatsAppProvider();
        const data = await provider.graphGet(`/${credentials.wabaId}/message_templates`, {
            fields: 'name,status,language',
            limit: 100,
        }, credentials);
        const approved = (Array.isArray(data.data) ? data.data : []).some(
            (t) => t && typeof t.name === 'string'
                && t.name.toLowerCase() === String(templateName).toLowerCase()
                && String(t.status).toUpperCase() === 'APPROVED'
        );
        if (!approved) {
            throw Object.assign(
                new AppError(
                    `Template "${templateName}" is not Meta-approved; notification not sent`,
                    400,
                    'TEMPLATE_NOT_APPROVED'
                ),
                { permanent: true }
            );
        }
    }

    // Enqueue one notification row per enabled recipient. Safe to call from
    // any lead-creation path: duplicate (lead, recipient) pairs resolve to
    // the existing row, and every failure is contained (never thrown).
    static async enqueueForLead(organizationId, leadId) {
        try {
            const settings = await WhatsappSettingsService.getSettings(organizationId);
            if (!settings || !settings.notifyEnabled) return { skipped: 'disabled', rows: [] };
            const recipients = enabledRecipients(settings);
            if (recipients.length === 0) return { skipped: 'no-recipients', rows: [] };
            await WhatsappNotifyService.resolveTemplate(organizationId, settings.notifyTemplateName);
            const rows = [];
            for (const recipient of recipients) {
                try {
                    rows.push(await prisma.whatsappNotification.create({
                        data: {
                            organizationId,
                            leadId,
                            recipient: recipient.phone,
                            templateName: settings.notifyTemplateName,
                            status: 'PENDING',
                        },
                    }));
                } catch (err) {
                    if (err && err.code === 'P2002') {
                        const existing = await prisma.whatsappNotification.findFirst({
                            where: { organizationId, leadId, recipient: recipient.phone },
                        });
                        if (existing) rows.push(existing);
                    } else {
                        throw err;
                    }
                }
            }
            void WhatsappNotifyService.processPending(organizationId, leadId).catch(() => {});
            return { queued: rows.length, rows: rows.map((r) => r.id) };
        } catch {
            return { skipped: 'error', rows: [] };
        }
    }

    static async processPending(organizationId, leadId) {
        const rows = await prisma.whatsappNotification.findMany({
            where: { organizationId, leadId, status: 'PENDING' },
        });
        for (const row of rows) {
            await WhatsappNotifyService.processRow(row.id).catch(() => {});
        }
    }

    static async processRow(notificationId) {
        const row = await prisma.whatsappNotification.findFirst({ where: { id: notificationId } });
        if (!row || row.status !== 'PENDING') return row;
        const settings = await WhatsappSettingsService.getSettings(row.organizationId);
        try {
            if (!settings || !settings.notifyEnabled) {
                throw Object.assign(new AppError('Notifications are disabled', 400, 'NOTIFICATIONS_DISABLED'), { permanent: true });
            }
            const template = await WhatsappNotifyService.resolveTemplate(row.organizationId, row.templateName);
            const lead = await prisma.lead.findFirst({
                where: { id: row.leadId, organizationId: row.organizationId },
                include: {
                    project: { select: { name: true } },
                    assignedTo: { select: { name: true } },
                },
            });
            if (!lead) {
                throw Object.assign(new AppError('Lead no longer exists', 400, 'LEAD_GONE'), { permanent: true });
            }
            const required = Array.isArray(template.variables) ? template.variables : [];
            const values = [];
            const missing = [];
            for (const name of required) {
                const resolver = NOTIFY_VARIABLES[name];
                const value = resolver ? resolver(lead) : null;
                if (value === undefined || value === null || String(value).trim() === '') missing.push(name);
                else values.push(String(value).trim());
            }
            if (missing.length > 0) {
                throw Object.assign(
                    new AppError(`Notification variables unresolved: ${missing.join(', ')}`, 400, 'TEMPLATE_VARIABLES_MISSING'),
                    { permanent: true }
                );
            }
            const effective = await WhatsappSettingsService.getEffectiveConfig(row.organizationId);
            const useDbMeta = effective.source === 'db' && effective.providerMode === 'meta';
            const credentials = useDbMeta
                ? {
                    phoneNumberId: effective.phoneNumberId,
                    accessToken: effective.accessToken,
                    appSecret: effective.appSecret,
                    graphVersion: effective.graphVersion,
                    wabaId: effective.wabaId,
                }
                : undefined;
            if (useDbMeta) {
                if (!effective.accessToken || !effective.phoneNumberId) {
                    throw Object.assign(new AppError('WhatsApp credentials are incomplete', 409, 'WHATSAPP_NOT_CONFIGURED'), { permanent: true });
                }
                await WhatsappNotifyService.verifyTemplateApproval(credentials, template.name);
            }
            const provider = useDbMeta ? new MetaWhatsAppProvider() : getWhatsAppProvider();
            const result = await provider.sendMessage({
                to: row.recipient,
                body: `[notify: ${template.name}]`,
                templateName: template.name,
                variables: values,
                language: template.language,
                credentials,
            });
            const updated = await prisma.whatsappNotification.update({
                where: { id: row.id },
                data: {
                    status: 'SENT',
                    attempts: row.attempts + 1,
                    error: null,
                    providerMessageId: result.providerMessageId || null,
                },
            });
            await prisma.leadActivity.create({
                data: {
                    organizationId: row.organizationId,
                    leadId: row.leadId,
                    type: 'NOTE',
                    description: `WhatsApp new-lead notification sent to ${row.recipient} (${template.name})`,
                    metadata: { notificationId: row.id, templateName: template.name },
                },
            });
            return updated;
        } catch (err) {
            const permanent = Boolean(err && (err.permanent || (err.statusCode && err.statusCode < 500 && err.statusCode !== 429)));
            const attempts = row.attempts + 1;
            if (!permanent && attempts < MAX_ATTEMPTS) {
                await prisma.whatsappNotification.update({
                    where: { id: row.id },
                    data: { attempts, error: (err && err.message) || 'Send failed' },
                });
                const delay = RETRY_DELAYS_MS[Math.min(attempts - 1, RETRY_DELAYS_MS.length - 1)];
                setTimeout(() => {
                    WhatsappNotifyService.processRow(row.id).catch(() => {});
                }, delay);
                return await prisma.whatsappNotification.findFirst({ where: { id: row.id } });
            }
            const failed = await prisma.whatsappNotification.update({
                where: { id: row.id },
                data: { status: 'FAILED', attempts, error: (err && err.message) || 'Send failed' },
            });
            await prisma.leadActivity.create({
                data: {
                    organizationId: row.organizationId,
                    leadId: row.leadId,
                    type: 'NOTE',
                    description: `WhatsApp new-lead notification failed for ${row.recipient}: ${(err && err.message) || 'send failed'}`.slice(0, 240),
                },
            }).catch(() => {});
            return failed;
        }
    }

    // Delivery-status bridge: called from the webhook status flow after the
    // message row flips. Upgrades SENT→DELIVERED/READ only, never downgrades.
    static async handleStatusEvent(organizationId, providerMessageId, mappedStatus) {
        if (!providerMessageId || !['DELIVERED', 'READ'].includes(mappedStatus)) return;
        const rows = await prisma.whatsappNotification.findMany({
            where: { organizationId, providerMessageId, status: mappedStatus === 'READ' ? { in: ['SENT', 'DELIVERED'] } : 'SENT' },
        });
        for (const row of rows) {
            await prisma.whatsappNotification.update({
                where: { id: row.id },
                data: { status: mappedStatus },
            }).catch(() => {});
        }
    }

    static async latestForOrg(organizationId) {
        const row = await prisma.whatsappNotification.findFirst({
            where: { organizationId },
            orderBy: { createdAt: 'desc' },
            select: {
                id: true, leadId: true, recipient: true, templateName: true,
                status: true, attempts: true, error: true, createdAt: true, updatedAt: true,
            },
        });
        return row;
    }

    // Safe configuration test: sends a clearly-labeled TEST notification to
    // a configured recipient only (never an arbitrary number).
    static async testNotify(organizationId, userId, recipient) {
        const settings = await WhatsappSettingsService.getSettings(organizationId);
        if (!settings || !settings.notifyEnabled) {
            throw new AppError('Enable new-lead notifications first', 409, 'NOTIFICATIONS_DISABLED');
        }
        const allowed = enabledRecipients(settings);
        if (allowed.length === 0) {
            throw new AppError('Configure at least one recipient first', 409, 'NO_RECIPIENTS');
        }
        const target = recipient
            ? allowed.find((r) => r.phone === normalizeRecipient(recipient))
            : allowed[0];
        if (!target) {
            throw new AppError('Test recipient must be one of the configured recipients', 400, 'INVALID_RECIPIENT');
        }
        const template = await WhatsappNotifyService.resolveTemplate(organizationId, settings.notifyTemplateName);
        const effective = await WhatsappSettingsService.getEffectiveConfig(organizationId);
        const useDbMeta = effective.source === 'db' && effective.providerMode === 'meta';
        const credentials = useDbMeta
            ? {
                phoneNumberId: effective.phoneNumberId,
                accessToken: effective.accessToken,
                appSecret: effective.appSecret,
                graphVersion: effective.graphVersion,
                wabaId: effective.wabaId,
            }
            : undefined;
        if (useDbMeta) {
            if (!effective.accessToken || !effective.phoneNumberId) {
                throw new AppError('WhatsApp credentials are incomplete', 409, 'WHATSAPP_NOT_CONFIGURED');
            }
            await WhatsappNotifyService.verifyTemplateApproval(credentials, template.name);
        }
        const provider = useDbMeta ? new MetaWhatsAppProvider() : getWhatsAppProvider();
        const testValues = (Array.isArray(template.variables) ? template.variables : []).map(() => '[TEST]');
        const result = await provider.sendMessage({
            to: target.phone,
            body: `[notify-test: ${template.name}]`,
            templateName: template.name,
            variables: testValues,
            language: template.language,
            credentials,
        });
        await audit(organizationId, userId, AUDIT_ACTIONS.WHATSAPP_NOTIFY_TEST, 'WhatsappNotification', null, {
            recipient: target.phone,
            templateName: template.name,
        });
        return { ok: true, providerMessageId: result.providerMessageId || null, recipient: target.phone };
    }
}

module.exports = WhatsappNotifyService;
