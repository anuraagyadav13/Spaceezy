const prisma = require('../db/prisma');
const { AppError } = require('../utils/errors');
const { getWhatsAppProvider } = require('../providers/whatsapp');
const { canSeePII, maskPhone } = require('../utils/pii');
const { audit, AUDIT_ACTIONS } = require('../utils/audit');
const { buildPublicPropertyUrl } = require('../utils/publicLink');

const isExecRole = (role) => role === 'SALES_EXECUTIVE' || role === 'CHANNEL_PARTNER';

const maskConversation = (conv, role) => {
    if (!conv || canSeePII(role)) return conv;
    const out = { ...conv };
    if (out.lead && out.lead.phone) {
        out.lead = { ...out.lead, phone: maskPhone(out.lead.phone), piiMasked: true };
    }
    delete out.providerContactId;
    return out;
};

class WhatsAppService {
    static async getStatus() {
        const provider = getWhatsAppProvider();
        return {
            provider: provider.name,
            configured: provider.isConfigured(),
            simulated: Boolean(provider.simulated)
        };
    }

    static async listConversations(organizationId, query, role, userId) {
        const { leadId, limit = 50, status } = query;
        const where = { organizationId };
        if (leadId) where.leadId = leadId;
        if (status) where.status = status;
        if (isExecRole(role)) where.lead = { assignedToId: userId };

        const conversations = await prisma.whatsAppConversation.findMany({
            where,
            take: parseInt(limit),
            orderBy: { lastMessageAt: 'desc' },
            include: {
                lead: { select: { id: true, name: true, phone: true, status: true, assignedToId: true } },
                customer: { select: { id: true, name: true } },
                messages: {
                    orderBy: { createdAt: 'desc' },
                    take: 1,
                    select: { id: true, body: true, direction: true, status: true, createdAt: true }
                }
            }
        });
        return conversations.map((c) => maskConversation(c, role));
    }

    static async assertConversationScope(conversation, role, userId) {
        if (isExecRole(role) && conversation.lead && conversation.lead.assignedToId !== userId) {
            throw new AppError('You do not have access to this conversation', 403, 'FORBIDDEN');
        }
    }

    static async getOrCreateConversation(leadId, organizationId, userId, role) {
        const lead = await prisma.lead.findFirst({ where: { id: leadId, organizationId } });
        if (!lead) throw new AppError('Lead not found', 404, 'NOT_FOUND');
        if (isExecRole(role) && lead.assignedToId !== userId) {
            throw new AppError('You do not have access to this lead', 403, 'FORBIDDEN');
        }

        const provider = getWhatsAppProvider();
        const existing = await prisma.whatsAppConversation.findFirst({
            where: { organizationId, leadId, status: 'ACTIVE' },
            orderBy: { lastMessageAt: 'desc' }
        });
        if (existing) return existing;

        return await prisma.whatsAppConversation.create({
            data: {
                organizationId,
                leadId,
                provider: provider.name,
                providerContactId: lead.phone || null,
                lastMessageAt: new Date()
            }
        });
    }

    static async getConversationById(id, organizationId, role, userId) {
        const conversation = await prisma.whatsAppConversation.findFirst({
            where: { id, organizationId },
            include: {
                lead: { select: { id: true, name: true, phone: true, status: true, projectId: true, assignedToId: true } },
                customer: { select: { id: true, name: true } }
            }
        });
        if (!conversation) throw new AppError('Conversation not found', 404, 'NOT_FOUND');
        await WhatsAppService.assertConversationScope(conversation, role, userId);
        return conversation;
    }

    static async listMessages(conversationId, organizationId, query, role, userId) {
        const conversation = await WhatsAppService.getConversationById(conversationId, organizationId, role, userId);
        const { page = 1, limit = 50 } = query;
        const where = { conversationId };

        const [messages, total] = await Promise.all([
            prisma.whatsAppMessage.findMany({
                where,
                skip: (parseInt(page) - 1) * parseInt(limit),
                take: parseInt(limit),
                orderBy: { createdAt: 'desc' },
                include: { sentBy: { select: { id: true, name: true } } }
            }),
            prisma.whatsAppMessage.count({ where })
        ]);

        return {
            conversation: maskConversation(conversation, role),
            messages,
            total,
            pages: Math.ceil(total / limit)
        };
    }

    static async sendMessage(conversationId, data, organizationId, userId, role) {
        const provider = getWhatsAppProvider();
        if (!provider.isConfigured()) {
            throw new AppError('WhatsApp integration not configured. Ask your administrator to connect the WhatsApp Business API.', 409, 'WHATSAPP_NOT_CONFIGURED');
        }

        const conversation = await prisma.whatsAppConversation.findFirst({
            where: { id: conversationId, organizationId },
            include: { lead: true }
        });
        if (!conversation) throw new AppError('Conversation not found', 404, 'NOT_FOUND');
        await WhatsAppService.assertConversationScope(conversation, role, userId);

        if (conversation.status !== 'ACTIVE') {
            throw new AppError('This conversation is closed', 409, 'CONVERSATION_CLOSED');
        }
        const to = conversation.providerContactId || (conversation.lead && conversation.lead.phone);
        if (!to) {
            throw new AppError('This lead has no phone number', 400, 'BAD_REQUEST');
        }

        // Optional share context: resolve the referenced unit server-side and
        // record property ID + public URL on the message and lead timeline, so
        // every WhatsApp share is trackable end-to-end (delivery status keeps
        // arriving through providerMessageId, as before).
        let shareContext = null;
        if (data.share && data.share.propertyId) {
            const shared = await prisma.property.findFirst({
                where: { id: data.share.propertyId, organizationId },
                select: {
                    id: true,
                    title: true,
                    publicToken: true,
                    project: { select: { name: true } }
                }
            });
            if (!shared) throw new AppError('Property not found', 404, 'NOT_FOUND');
            shareContext = {
                propertyId: shared.id,
                propertyTitle: shared.title,
                projectName: shared.project ? shared.project.name : null,
                publicToken: shared.publicToken,
                publicUrl: shared.publicToken ? buildPublicPropertyUrl(shared.publicToken) : null,
                sharedAt: new Date().toISOString()
            };
        }

        let body = data.body || '';
        let templateName = null;
        let variables = null;

        if (data.templateName) {
            const template = await prisma.whatsAppTemplate.findFirst({
                where: { organizationId, name: data.templateName }
            });
            if (!template) throw new AppError('Template not found', 404, 'NOT_FOUND');
            if (!template.active) throw new AppError('This template is inactive', 409, 'TEMPLATE_INACTIVE');

            const required = Array.isArray(template.variables) ? template.variables : [];
            const provided = Array.isArray(data.variables) ? data.variables : [];
            if (provided.length < required.length) {
                throw new AppError(
                    `Template requires variables: ${required.join(', ')}`,
                    400,
                    'TEMPLATE_VARIABLES_MISSING'
                );
            }
            templateName = template.name;
            variables = provided;
            body = template.name; // placeholder body for previews; provider renders template
        } else {
            if (!body || !String(body).trim()) {
                throw new AppError('Message body is required', 400, 'VALIDATION_ERROR');
            }
            body = String(body).trim();
        }

        const result = await provider.sendMessage({ to, body, templateName, variables });

        const message = await prisma.$transaction(async (tx) => {
            const created = await tx.whatsAppMessage.create({
                data: {
                    organizationId,
                    conversationId: conversation.id,
                    leadId: conversation.leadId,
                    direction: 'OUTBOUND',
                    status: result.status === 'QUEUED' ? 'QUEUED' : 'SENT',
                    body: templateName ? `[template: ${templateName}]` : body,
                    templateName,
                    variables: variables || shareContext || null,
                    providerMessageId: result.providerMessageId || null,
                    sentById: userId
                }
            });
            await tx.whatsAppConversation.update({
                where: { id: conversation.id },
                data: { lastMessageAt: new Date() }
            });
            await tx.leadActivity.create({
                data: {
                    organizationId,
                    leadId: conversation.leadId,
                    type: 'WHATSAPP',
                    description: shareContext
                        ? `WhatsApp property share sent: ${shareContext.propertyTitle}`
                        : (templateName ? `WhatsApp template sent: ${templateName}` : `WhatsApp sent: ${body.slice(0, 120)}`),
                    performedById: userId,
                    metadata: {
                        conversationId: conversation.id,
                        messageId: created.id,
                        templateName,
                        ...(shareContext ? { share: shareContext } : {})
                    }
                }
            });
            return created;
        });

        await audit(organizationId, userId, AUDIT_ACTIONS.WHATSAPP_SENT, 'WhatsAppMessage', message.id, {
            conversationId: conversation.id,
            leadId: conversation.leadId,
            channel: 'text',
            templateName,
            ...(shareContext ? { propertyId: shareContext.propertyId, publicUrl: shareContext.publicUrl } : {})
        });

        return message;
    }

    // --- Templates ---

    static async listTemplates(organizationId, query = {}) {
        const { active } = query;
        const where = { organizationId };
        if (active !== undefined && active !== '') where.active = active === 'true' || active === true;
        return await prisma.whatsAppTemplate.findMany({
            where,
            orderBy: { createdAt: 'desc' }
        });
    }

    static async createTemplate(data, organizationId, userId) {
        const existing = await prisma.whatsAppTemplate.findFirst({
            where: { organizationId, name: data.name }
        });
        if (existing) throw new AppError('A template with this name already exists', 409, 'DUPLICATE_TEMPLATE');

        return await prisma.whatsAppTemplate.create({
            data: {
                organizationId,
                name: data.name,
                providerTemplateId: data.providerTemplateId || null,
                language: data.language || 'en',
                category: data.category || 'UTILITY',
                variables: Array.isArray(data.variables) ? data.variables : [],
                active: data.active !== false,
                createdById: userId
            }
        });
    }

    static async updateTemplate(id, data, organizationId) {
        const template = await prisma.whatsAppTemplate.findFirst({
            where: { id, organizationId }
        });
        if (!template) throw new AppError('Template not found', 404, 'NOT_FOUND');

        const updateData = {};
        if (data.active !== undefined) updateData.active = Boolean(data.active);
        if (data.language !== undefined) updateData.language = data.language;
        if (data.variables !== undefined) updateData.variables = Array.isArray(data.variables) ? data.variables : [];
        if (data.providerTemplateId !== undefined) updateData.providerTemplateId = data.providerTemplateId;

        return await prisma.whatsAppTemplate.update({ where: { id }, data: updateData });
    }

    /**
     * Webhook: signature-verified, idempotent by providerMessageId.
     * Supports inbound messages and sent/delivered/read/failed status events.
     */
    static async processWebhook(providerName, rawBody, signature) {
        const provider = getWhatsAppProvider();
        if (!provider.isConfigured() || provider.name !== providerName) {
            throw new AppError('WhatsApp webhook is not configured', 503, 'WEBHOOK_NOT_CONFIGURED');
        }
        if (!provider.verifyWebhookSignature(rawBody, signature)) {
            throw new AppError('Invalid webhook signature', 401, 'WEBHOOK_SIGNATURE_INVALID');
        }

        let payload;
        try {
            payload = JSON.parse(rawBody);
        } catch {
            throw new AppError('Invalid webhook payload', 400, 'VALIDATION_ERROR');
        }

        const type = payload.type;
        if (type === 'status') {
            return await WhatsAppService._processStatusEvent(payload);
        }
        if (type === 'message') {
            return await WhatsAppService._processInboundEvent(payload, providerName);
        }
        throw new AppError('Unsupported webhook event type', 400, 'VALIDATION_ERROR');
    }

    static async _processStatusEvent(payload) {
        const { providerMessageId, status, eventId } = payload;
        if (!providerMessageId || !status) {
            throw new AppError('providerMessageId and status are required', 400, 'VALIDATION_ERROR');
        }
        const statusMap = { sent: 'SENT', delivered: 'DELIVERED', read: 'READ', failed: 'FAILED' };
        const mapped = statusMap[String(status).toLowerCase()];
        if (!mapped) throw new AppError('Unknown message status', 400, 'VALIDATION_ERROR');

        const message = await prisma.whatsAppMessage.findFirst({
            where: { providerMessageId }
        });
        if (!message) return { ok: true, ignored: true };

        // Rank ordering makes retries/duplicates idempotent (never downgrade).
        const rank = { QUEUED: 0, SENT: 1, DELIVERED: 2, READ: 3, FAILED: 3 };
        if (mapped === 'FAILED') {
            if (message.status === 'FAILED') return { ok: true, duplicate: true };
            await prisma.whatsAppMessage.update({
                where: { id: message.id },
                data: { status: 'FAILED', error: payload.error || 'Provider reported failure' }
            });
        } else if (rank[mapped] > rank[message.status]) {
            await prisma.whatsAppMessage.update({
                where: { id: message.id },
                data: { status: mapped }
            });
        } else {
            return { ok: true, duplicate: true };
        }
        return { ok: true, eventId: eventId || null };
    }

    static async _processInboundEvent(payload, providerName) {
        const { providerMessageId, providerContactId, leadId, body, phone } = payload;
        if (!body) throw new AppError('body is required for inbound messages', 400, 'VALIDATION_ERROR');

        // Idempotency: unique (organizationId, providerMessageId).
        if (providerMessageId) {
            const existing = await prisma.whatsAppMessage.findFirst({
                where: { providerMessageId }
            });
            if (existing) return { ok: true, duplicate: true };
        }

        // Resolve lead: explicit leadId (mock/test) or exact phone match.
        let lead = null;
        if (payload.organizationId) {
            lead = await prisma.lead.findFirst({
                where: { id: leadId || '', organizationId: payload.organizationId }
            });
        }
        if (!lead && phone) {
            lead = await prisma.lead.findFirst({
                where: { phone: String(phone).trim() },
                orderBy: { createdAt: 'desc' }
            });
        }
        if (!lead) {
            return { ok: true, ignored: 'no_lead' };
        }

        const provider = getWhatsAppProvider();
        let conversation = await prisma.whatsAppConversation.findFirst({
            where: { organizationId: lead.organizationId, leadId: lead.id, status: 'ACTIVE' },
            orderBy: { lastMessageAt: 'desc' }
        });
        if (!conversation) {
            conversation = await prisma.whatsAppConversation.create({
                data: {
                    organizationId: lead.organizationId,
                    leadId: lead.id,
                    provider: provider.name,
                    providerContactId: providerContactId || phone || lead.phone || null,
                    lastMessageAt: new Date()
                }
            });
        }

        const message = await prisma.$transaction(async (tx) => {
            const created = await tx.whatsAppMessage.create({
                data: {
                    organizationId: lead.organizationId,
                    conversationId: conversation.id,
                    leadId: lead.id,
                    direction: 'INBOUND',
                    status: 'READ',
                    body: String(body),
                    providerMessageId: providerMessageId || null
                }
            });
            await tx.whatsAppConversation.update({
                where: { id: conversation.id },
                data: { lastMessageAt: new Date(), unreadCount: { increment: 1 } }
            });
            await tx.leadActivity.create({
                data: {
                    organizationId: lead.organizationId,
                    leadId: lead.id,
                    type: 'WHATSAPP',
                    description: `WhatsApp received: ${String(body).slice(0, 120)}`,
                    metadata: { conversationId: conversation.id, messageId: created.id, direction: 'INBOUND' }
                }
            });
            return created;
        });

        await audit(lead.organizationId, null, AUDIT_ACTIONS.WHATSAPP_INBOUND, 'WhatsAppMessage', message.id, {
            conversationId: conversation.id,
            leadId: lead.id
        });

        return { ok: true, messageId: message.id };
    }
}

module.exports = WhatsAppService;
