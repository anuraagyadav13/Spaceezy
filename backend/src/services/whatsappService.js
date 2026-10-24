const prisma = require('../db/prisma');
const { AppError } = require('../utils/errors');
const { getWhatsAppProvider } = require('../providers/whatsapp');
const MetaWhatsAppProvider = require('../providers/whatsapp/metaProvider');
const WhatsappSettingsService = require('./whatsappSettingsService');
const WhatsappNotifyService = require('./whatsappNotifyService');
const { getCatalogEntry, listCatalog, renderPreview } = require('./templateCatalog');
const { canSeePII, maskPhone } = require('../utils/pii');
const { audit, AUDIT_ACTIONS } = require('../utils/audit');
const { buildPublicPropertyUrl, buildPublicApiUrl, slugify } = require('../utils/publicLink');
const { findBrochureDocument } = require('./storageService');
const { buildQuotationUrl, sanitizeAddons, sanitizeQuote, VALIDITY_DAYS: QUOTATION_VALIDITY_DAYS } = require('./quotationPdf');
const { isExecRole } = require('../utils/roles');
const { assertOwnership } = require('../utils/roles');

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
    static async getStatus(organizationId) {
        // Resolve the org's effective transport so the reported mode matches
        // what sends actually do (a saved DB row always wins over env).
        const t = await WhatsappSettingsService.resolveTransport(organizationId);
        return {
            provider: t.mode,
            configured: t.configured,
            simulated: t.simulated
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
        if (conversation.lead) assertOwnership(conversation.lead, role, userId, 'assignedToId', 'You do not have access to this conversation');
    }

    static async getOrCreateConversation(leadId, organizationId, userId, role) {
        const lead = await prisma.lead.findFirst({ where: { id: leadId, organizationId } });
        if (!lead) throw new AppError('Lead not found', 404, 'NOT_FOUND');
        assertOwnership(lead, role, userId, 'assignedToId', 'You do not have access to this lead');

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

    static async sendMessage(conversationId, data, organizationId, userId, role, transport) {
        // Transport is authoritative: a saved DB row (meta or mock) always wins
        // over env; only a missing row falls back to the legacy env provider.
        // A DB row saved as 'mock' sends through the mock provider (simulated)
        // and never reaches for env Meta credentials.
        const t = transport || (await WhatsappSettingsService.resolveTransport(organizationId));
        const provider = t.provider;
        if (!t.configured) {
            if (t.source === 'db' && t.mode === 'meta') {
                throw new AppError('WhatsApp credentials are incomplete. Save an access token and Phone Number ID first.', 409, 'WHATSAPP_NOT_CONFIGURED');
            }
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
        let templateLanguage = null;
        // What gets stored on the message row. For template sends this is the
        // fully rendered text, so the thread shows the real message instead of
        // a "[template: X]" tag; plain sends store their body unchanged.
        let storedBody = null;

        if (data.templateName) {
            let template = await prisma.whatsAppTemplate.findFirst({
                where: { organizationId, name: data.templateName }
            });
            if (!template) {
                // Catalog pre-check: reject missing variables BEFORE provisioning,
                // so invalid attempts never create rows.
                const catalogEntry = getCatalogEntry(data.templateName);
                if (catalogEntry) {
                    const provided = Array.isArray(data.variables) ? data.variables : [];
                    if (provided.length < catalogEntry.variables.length) {
                        throw new AppError(
                            `Template requires variables: ${catalogEntry.variables.join(', ')}`,
                            400,
                            'TEMPLATE_VARIABLES_MISSING'
                        );
                    }
                }
                template = await WhatsAppService.provisionCatalogTemplate(data.templateName, organizationId, userId);
            }
            if (!template) throw new AppError('Template not found', 404, 'NOT_FOUND');
            if (!template.active) throw new AppError('This template is inactive', 409, 'TEMPLATE_INACTIVE');

            // The row is only a local provisioning copy of the code-owned
            // catalog (no Meta provider id yet). When the catalog evolves —
            // e.g. {{property_name}} was removed so house numbers never go
            // out — a send speaking the CURRENT catalog contract (its
            // variable count matches the catalog exactly) must validate,
            // render and store against the catalog, not the stale copy.
            // Any other count means the caller speaks the row's own
            // contract (customized rows keep winning) — positionally it is
            // already aligned with the stored body. In-memory only: the row
            // itself is untouched (the composer also hides rows that shadow
            // a catalog name, so no stale variable list is ever sent).
            const catalogCurrent = getCatalogEntry(data.templateName);
            const providedNow = Array.isArray(data.variables) ? data.variables : [];
            if (catalogCurrent && !template.providerTemplateId
                && typeof template.body === 'string'
                && providedNow.length === catalogCurrent.variables.length
                && (template.body !== catalogCurrent.body
                    || JSON.stringify(template.variables || []) !== JSON.stringify(catalogCurrent.variables))) {
                template = { ...template, body: catalogCurrent.body, variables: [...catalogCurrent.variables] };
            }

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
            templateLanguage = template.language || null;
            body = template.name; // placeholder body for previews; provider renders template
            // Render the template's {{placeholders}} against the positional
            // values (order comes from template.variables — the same contract
            // the provider uses) so the saved message reads like the actual
            // text that went out. Templates without preview text keep the
            // readable tag as a fallback.
            const declaredNames = Array.isArray(template.variables) ? template.variables : [];
            const renderValues = {};
            declaredNames.forEach((name, index) => { renderValues[name] = provided[index]; });
            storedBody = template.body
                ? renderPreview(template.body, renderValues).text
                : `[template: ${template.name}]`;
        } else {
            if (!body || !String(body).trim()) {
                throw new AppError('Message body is required', 400, 'VALIDATION_ERROR');
            }
            body = String(body).trim();
        }

        // Optional companion media (all opt-in per send): resolve the target
        // project within the organization and derive the public PDF link +
        // filename server-side. The row always records the PDF link so the
        // CRM thread renders the attachment even on providers that do not
        // deliver documents (mock/none); providers that do (meta) fetch the
        // link below. `attachment.kinds` (falling back to the single
        // `attachment.kind`) picks the document(s), and the two are
        // INDEPENDENT — both can ride one send: 'brochure' attaches the
        // employee-uploaded brochure PDF (never generated — 404 NO_BROCHURE
        // when none is on file) and 'quotation' attaches the itemised
        // quotation, which also files a Quotation record (see the
        // transaction below) and may carry per-send add-on values. Each
        // requested document travels as its own message (WhatsApp carries
        // one document per message) with one thread row per file, so one
        // click in the CRM can deliver brochure + quotation together.
        let attachments = []; // [{ kind, url, name }] in send order
        let imageUrls = [];
        let quotationRecord = null;
        if (data.attachment && data.attachment.projectId) {
            const requestedKinds = [
                ...new Set(
                    (Array.isArray(data.attachment.kinds) && data.attachment.kinds.length > 0
                        ? data.attachment.kinds
                        : (data.attachment.kind ? [data.attachment.kind] : [])
                    ).filter((k) => k === 'brochure' || k === 'quotation')
                )
            ];
            const wantsBrochure = data.attachment.pdf !== false && requestedKinds.includes('brochure');
            const wantsQuotation = data.attachment.pdf !== false && requestedKinds.includes('quotation');
            const project = await prisma.project.findFirst({
                where: { id: data.attachment.projectId, organizationId },
                select: { id: true, name: true, images: true, startingPrice: true, documents: true }
            });
            if (!project) throw new AppError('Project not found', 404, 'NOT_FOUND');
            let unitImages = null;
            let unitPrice = null;
            if (data.attachment.propertyId) {
                const unit = await prisma.property.findFirst({
                    where: { id: data.attachment.propertyId, organizationId, projectId: project.id },
                    select: { id: true, images: true, price: true }
                });
                if (!unit) throw new AppError('Unit not found', 404, 'NOT_FOUND');
                unitImages = Array.isArray(unit.images) ? unit.images : [];
                unitPrice = Number(unit.price) > 0 ? Number(unit.price) : null;
            }
            if (wantsBrochure) {
                // Brochure = the employee-uploaded PDF and nothing else.
                // It is delivered through the public documents route (the
                // bucket is private); when no brochure is on file the send
                // is refused with a message that says how to fix it.
                const brochure = findBrochureDocument(project.documents);
                if (!brochure) {
                    throw new AppError(
                        'No brochure PDF is uploaded for this project yet. Upload one in the composer (PDF, up to 15 MB) and resend.',
                        400,
                        'NO_BROCHURE'
                    );
                }
                // `v` versions the link per upload — WhatsApp caches media
                // BY URL, so without a changing token the client keeps
                // receiving the first bytes ever fetched from the unversioned
                // link even after the brochure was replaced (the "stale
                // blank preview PDF" complaint). The public documents route
                // reads only projectId, so the same route serves the
                // current file. Same token the composer link uses.
                const version = String(brochure.uploadedAt || brochure.size || brochure.key || '').trim();
                attachments.push({
                    kind: 'brochure',
                    url: buildPublicApiUrl(`/public/documents?projectId=${encodeURIComponent(project.id)}${version ? `&v=${encodeURIComponent(version)}` : ''}`),
                    name: `${slugify(project.name) || 'project'}-brochure.pdf`
                });
            }
            if (wantsQuotation) {
                // Display-only names printed on the quotation: the
                // sender's CRM name and the lead's name — sanitized
                // again by the URL builder, never trusted further.
                const sender = await prisma.user.findFirst({
                    where: { id: userId },
                    select: { name: true }
                });
                // Per-send values (legacy add-ons, or the full editable
                // sheet: rows / brokerage % / GST % / payout ratios) —
                // re-validated by sanitizeAddons / sanitizeQuote inside the
                // URL builder.
                const addons = sanitizeAddons(data.attachment.addons);
                const quote = sanitizeQuote(data.attachment.quote);
                attachments.push({
                    kind: 'quotation',
                    url: buildQuotationUrl(project.id, data.attachment.propertyId || null, {
                        by: sender ? sender.name : null,
                        customer: conversation.lead && conversation.lead.name
                            ? conversation.lead.name
                            : null,
                        addons,
                        quote
                    }),
                    name: `${slugify(project.name) || 'project'}-quotation.pdf`
                });
                // The Quotation record carries the net property value the
                // PDF prints: the edited rows when the employee supplied
                // them, else the unit's own price (or the project's
                // starting price) plus any legacy add-ons. Without a base
                // price the document still goes out ("On request") but no
                // record is filed.
                const baseAmount = unitPrice != null
                    ? unitPrice
                    : (Number(project.startingPrice) > 0 ? Number(project.startingPrice) : null);
                const editedTotal = quote && Array.isArray(quote.rows) && quote.rows.length > 0
                    ? quote.rows.reduce((sum, r) => sum + (Number(r.amount) || 0), 0)
                    : null;
                const totalAmount = editedTotal != null
                    ? editedTotal
                    : (baseAmount != null
                        ? baseAmount + addons.reduce((sum, a) => sum + a.amount, 0)
                        : null);
                if (totalAmount != null && conversation.leadId) {
                    quotationRecord = {
                        projectId: project.id,
                        propertyId: data.attachment.propertyId || null,
                        totalAmount,
                        validUntil: new Date(Date.now() + QUOTATION_VALIDITY_DAYS * 24 * 60 * 60 * 1000),
                        // Human-readable trace of the printed commercial terms.
                        addonsNote: [
                            addons.length > 0
                                ? `add-ons: ${addons.map((a) => `${a.name} Rs ${a.amount}`).join(', ')}`
                                : '',
                            quote
                                ? (quote.brokerageOn === false
                                    ? 'no brokerage (builder direct)'
                                    : `brokerage ${quote.brokerPct ?? 1}%${quote.gstPct != null ? ` + GST ${quote.gstPct}%` : ''}`)
                                : ''
                        ].filter(Boolean).join('; ')
                    };
                }
            }
            // Property photos: the unit's own gallery when a unit was picked
            // and has one, else the project gallery. Only absolute http(s)
            // links go out (Meta must be able to fetch them) and the run is
            // capped so one send can never turn into a flood.
            if (data.attachment.images) {
                const source = (unitImages && unitImages.length > 0) ? unitImages : (Array.isArray(project.images) ? project.images : []);
                imageUrls = source
                    .filter((url) => typeof url === 'string' && /^https?:\/\//i.test(url.trim()))
                    .map((url) => url.trim())
                    .slice(0, 6);
            }
        }

        const result = await provider.sendMessage({
            to,
            body,
            templateName,
            variables,
            // Used by transports that render provider templates natively
            // (meta); ignored by mock/generic/none.
            language: templateLanguage,
            // Organization credentials for DB-configured Meta mode; undefined
            // keeps exact legacy env behavior on every other provider.
            credentials: t.credentials
        });

        // Companion document sends for PDF attachments (brochure and/or
        // quotation). Cloud API cannot attach files to a template message, so
        // each PDF travels as its own message from the same number — one
        // click in the CRM still delivers both files back to back. A
        // document failure never rolls back the text that already went out —
        // it is recorded on the row instead.
        let attachmentError = null;
        const attachmentFailures = new Map(); // index -> reason for that file
        let attachmentHeldBack = null;
        if (attachments.length > 0 && typeof provider.sendDocument === 'function') {
            // Meta only accepts free-form documents inside the 24-hour
            // customer service window (opened by the customer's last inbound
            // message; a template send does NOT open it). Outside the window
            // the call is a guaranteed rejection, so skip it and record the
            // reason — _deliverPendingAttachment sends the PDF as soon as the
            // customer replies. Simulated transports ignore the window.
            const windowChecked = provider.name === 'meta' && provider.simulated !== true;
            const windowOpen = !windowChecked || await WhatsAppService._serviceWindowOpen(conversation.id);
            if (!windowOpen) {
                attachmentHeldBack = "PDF not delivered yet: WhatsApp accepts documents only inside the 24-hour chat window. The link is already in the message text — the PDF goes out automatically on the customer's first reply.";
                attachmentError = attachmentHeldBack;
            } else {
                let captioned = false;
                for (let i = 0; i < attachments.length; i += 1) {
                    try {
                        await provider.sendDocument({
                            to,
                            attachment: { url: attachments[i].url, name: attachments[i].name },
                            // Only the first file carries the message text as
                            // its caption; the rest go out bare so the text
                            // is not duplicated on the customer's phone.
                            caption: captioned ? null : (storedBody || body || '').slice(0, 1024),
                            credentials: t.credentials
                        });
                        captioned = true;
                    } catch (err) {
                        const reason = (err && err.message) || 'PDF attachment failed to send';
                        const full = provider.name === 'meta'
                            ? `${reason} The link is in the message text; the PDF is re-sent automatically on the customer's next reply.`
                            : reason;
                        attachmentFailures.set(i, full);
                        attachmentError = [attachmentError, full].filter(Boolean).join(' ');
                    }
                }
            }
        }

        // Companion image sends for property photos — same contract as the
        // PDF above: window gated, never rolls back the text that already
        // went out, failures recorded on the row. The first image carries
        // the message as its caption; the rest go out bare.
        if (imageUrls.length > 0 && typeof provider.sendImage === 'function') {
            const windowChecked = provider.name === 'meta' && provider.simulated !== true;
            const windowOpen = !windowChecked || await WhatsAppService._serviceWindowOpen(conversation.id);
            if (!windowOpen) {
                attachmentError = [attachmentError, `Property photos not delivered: WhatsApp accepts images only inside the 24-hour chat window (${imageUrls.length} held back).`].filter(Boolean).join(' ');
            } else {
                let captioned = false;
                for (const url of imageUrls) {
                    try {
                        await provider.sendImage({
                            to,
                            image: { url },
                            caption: captioned ? null : (storedBody || body || '').slice(0, 200),
                            credentials: t.credentials
                        });
                        captioned = true;
                    } catch (err) {
                        const reason = (err && err.message) || 'Property photo failed to send';
                        attachmentError = [attachmentError, reason].filter(Boolean).join(' ');
                    }
                }
            }
        }

        const message = await prisma.$transaction(async (tx) => {
            const primary = attachments[0] || null;
            const primaryError = primary
                ? (attachmentFailures.get(0) || attachmentHeldBack || null)
                : null;
            const created = await tx.whatsAppMessage.create({
                data: {
                    organizationId,
                    conversationId: conversation.id,
                    leadId: conversation.leadId,
                    direction: 'OUTBOUND',
                    status: result.status === 'QUEUED' ? 'QUEUED' : 'SENT',
                    body: storedBody || body,
                    templateName,
                    variables: variables || shareContext || null,
                    providerMessageId: result.providerMessageId || null,
                    attachmentUrl: primary ? primary.url : null,
                    attachmentName: primary ? primary.name : null,
                    ...(primaryError ? { error: primaryError } : {}),
                    sentById: userId
                }
            });
            // A second PDF (brochure + quotation in one send) gets its own
            // row: WhatsApp carries one document per message, so the thread
            // truthfully shows both files, and the pending-retry on the
            // customer's next reply picks each row up on its own.
            for (let i = 1; i < attachments.length; i += 1) {
                const rowError = attachmentFailures.get(i) || attachmentHeldBack || null;
                await tx.whatsAppMessage.create({
                    data: {
                        organizationId,
                        conversationId: conversation.id,
                        leadId: conversation.leadId,
                        direction: 'OUTBOUND',
                        status: result.status === 'QUEUED' ? 'QUEUED' : 'SENT',
                        body: '',
                        attachmentUrl: attachments[i].url,
                        attachmentName: attachments[i].name,
                        ...(rowError ? { error: rowError } : {}),
                        sentById: userId
                    }
                });
            }
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
                        ...(shareContext ? { share: shareContext } : {}),
                        ...(attachments.length
                            ? { attachment: { url: attachments[0].url, name: attachments[0].name }, attachments: attachments.length }
                            : {}),
                        ...(imageUrls.length ? { images: imageUrls.length } : {})
                    }
                }
            });
            // A quotation send also files the Quotation record (existing
            // pipeline entity — booking conversion reads it) so the lead's
            // quotation list reflects what actually went out on WhatsApp.
            if (quotationRecord) {
                const quotationAttachment = attachments.find((a) => a.kind === 'quotation');
                await tx.quotation.create({
                    data: {
                        organizationId,
                        leadId: conversation.leadId,
                        projectId: quotationRecord.projectId,
                        propertyId: quotationRecord.propertyId,
                        totalAmount: quotationRecord.totalAmount,
                        validUntil: quotationRecord.validUntil,
                        status: 'SENT',
                        notes: `WhatsApp quotation sent: ${quotationAttachment ? quotationAttachment.name : 'quotation.pdf'}${quotationRecord.addonsNote ? ` — ${quotationRecord.addonsNote}` : ''}`,
                        createdById: userId
                    }
                });
            }
            return created;
        });

        await audit(organizationId, userId, AUDIT_ACTIONS.WHATSAPP_SENT, 'WhatsAppMessage', message.id, {
            conversationId: conversation.id,
            leadId: conversation.leadId,
            channel: 'text',
            templateName,
            ...(shareContext ? { propertyId: shareContext.propertyId, publicUrl: shareContext.publicUrl } : {}),
            ...(attachments.length
                ? {
                    attachment: attachments.map((a) => a.name).join(', '),
                    attachmentUrls: attachments.map((a) => a.url)
                }
                : {}),
            ...(imageUrls.length ? { images: imageUrls.length } : {}),
            ...(attachmentError ? { attachmentError } : {})
        });

        // attachmentError also rides on the response (it is already persisted
        // on the affected row's `error` column) so the composer can toast the
        // partial failure immediately instead of failing silently.
        return attachmentError ? { ...message, attachmentError } : message;
    }

    // True while the customer's last inbound message is inside WhatsApp's
    // 24-hour service window — the only window where Meta's Cloud API
    // accepts free-form document messages such as the quotation PDF.
    static async _serviceWindowOpen(conversationId) {
        const lastInbound = await prisma.whatsAppMessage.findFirst({
            where: { conversationId, direction: 'INBOUND' },
            orderBy: { createdAt: 'desc' },
            select: { createdAt: true }
        });
        if (!lastInbound) return false;
        return Date.now() - new Date(lastInbound.createdAt).getTime() <= 24 * 60 * 60 * 1000;
    }

    // Best-effort delivery of a PDF attachment that was held back (window
    // closed) or rejected on the original send. The customer's reply re-opens
    // the 24-hour window, so the pending PDF goes out now. Silently swallows
    // failures — the reason stays on the row's `error` for the next reply.
    static async _deliverPendingAttachment(organizationId, conversation, lead) {
        try {
            const pending = await prisma.whatsAppMessage.findFirst({
                where: {
                    conversationId: conversation.id,
                    direction: 'OUTBOUND',
                    attachmentUrl: { not: null },
                    error: { not: null },
                    status: { not: 'FAILED' },
                    createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
                },
                orderBy: { createdAt: 'desc' }
            });
            if (!pending) return null;

            const t = await WhatsappSettingsService.resolveTransport(organizationId);
            if (!t.configured || typeof t.provider.sendDocument !== 'function') return null;
            const to = conversation.providerContactId || (lead && lead.phone);
            if (!to) return null;

            await t.provider.sendDocument({
                to,
                attachment: {
                    url: pending.attachmentUrl,
                    name: pending.attachmentName || 'document.pdf'
                },
                caption: String(pending.body || '').slice(0, 1024),
                credentials: t.credentials
            });
            return await prisma.whatsAppMessage.update({
                where: { id: pending.id },
                data: { error: null }
            });
        } catch (err) {
            return null;
        }
    }

    // --- Templates ---

    static listLibrary() {
        return listCatalog();
    }

    // Provision a predefined-library entry as a LOCAL database row on first
    // use, so sending flows through the existing validated contract. This
    // never touches Meta: providerTemplateId stays null until a verified
    // provider response supplies one. The unique constraint makes concurrent
    // provisioning safe — on a P2002 race only the matching organization's
    // row is re-fetched, and no other org's row is ever modified.
    static async provisionCatalogTemplate(name, organizationId, userId) {
        const entry = getCatalogEntry(name);
        if (!entry) return null;
        try {
            return await prisma.whatsAppTemplate.create({
                data: {
                    organizationId,
                    name: entry.name,
                    providerTemplateId: null,
                    language: 'en',
                    category: entry.metaCategory,
                    description: entry.description,
                    body: entry.body,
                    variables: [...entry.variables],
                    active: true,
                    createdById: userId || null
                }
            });
        } catch (err) {
            if (err.code === 'P2002') {
                return await prisma.whatsAppTemplate.findFirst({
                    where: { organizationId, name: entry.name }
                });
            }
            throw err;
        }
    }

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
                description: data.description || null,
                body: data.body || null,
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
        if (data.description !== undefined) updateData.description = data.description || null;
        if (data.body !== undefined) updateData.body = data.body || null;

        return await prisma.whatsAppTemplate.update({ where: { id }, data: updateData });
    }

    /**
     * Webhook organization resolution. Provider credentials are global
     * (single WhatsApp app/number for the deployment), so inbound traffic
     * belongs to the primary organization — same pattern as public-enquiry
     * attribution. Scoping every webhook lookup by it keeps phone-matched
     * leads and status events from leaking across organizations.
     */
    static async resolveWebhookOrganization() {
        const org = await prisma.organization.findFirst({ select: { id: true } });
        if (!org) {
            throw new AppError('System not configured correctly (No organization found)', 500, 'INTERNAL_ERROR');
        }
        return org.id;
    }

    // Sender identities for webhook routing: every phone_number_id and
    // entry (WABA) id found in a Meta envelope. Custom envelopes carry none
    // and route through legacy handling.
    static extractMetaSenderIds(payload) {
        if (!payload || payload.object !== 'whatsapp_business_account' || !Array.isArray(payload.entry)) {
            return { phoneNumberIds: [], wabaIds: [] };
        }
        const phoneNumberIds = [];
        const wabaIds = [];
        for (const entry of payload.entry) {
            if (entry && entry.id) wabaIds.push(entry.id);
            const changes = (entry && entry.changes) || [];
            for (const change of changes) {
                const metadata = (change && change.value && change.value.metadata) || {};
                if (metadata.phone_number_id) phoneNumberIds.push(metadata.phone_number_id);
            }
        }
        return { phoneNumberIds, wabaIds };
    }

    /**
     * Webhook: signature-verified, idempotent by providerMessageId.
     * Supports inbound messages and sent/delivered/read/failed status events.
     */
    static async processWebhook(providerName, rawBody, signature) {
        let payload;
        try {
            payload = JSON.parse(rawBody);
        } catch {
            throw new AppError('Invalid webhook payload', 400, 'VALIDATION_ERROR');
        }

        // Route Meta envelopes by sender number; custom envelopes (no sender
        // identity) keep legacy handling. Resolution happens before any
        // signature check so verification uses the owning org's secret.
        //
        // Security: resolution outcomes (unknown/ambiguous sender) must never
        // reach an unauthenticated caller — they would let anyone enumerate
        // which phone_number_id/WABA ids are configured. Any resolution failure
        // is reported as the same generic signature error a bad HMAC produces,
        // so unauthenticated probes cannot distinguish the cases.
        const senderIds = WhatsAppService.extractMetaSenderIds(payload);
        let routedOrg;
        try {
            routedOrg = await WhatsappSettingsService.resolveWebhookOrg(senderIds);
        } catch (err) {
            if (err && (err.code === 'UNKNOWN_SENDER' || err.code === 'AMBIGUOUS_SENDER')) {
                throw new AppError('Invalid webhook signature', 401, 'WEBHOOK_SIGNATURE_INVALID');
            }
            throw err;
        }
        const effective = await WhatsappSettingsService.getEffectiveConfig(routedOrg);
        const useDbMeta = effective.source === 'db' && effective.providerMode === 'meta';
        const provider = useDbMeta ? new MetaWhatsAppProvider() : getWhatsAppProvider();
        const configured = useDbMeta
            ? Boolean(effective.accessToken && effective.phoneNumberId)
            : provider.isConfigured();
        if (!configured || provider.name !== providerName) {
            throw new AppError('WhatsApp webhook is not configured', 503, 'WEBHOOK_NOT_CONFIGURED');
        }
        const credentials = useDbMeta
            ? {
                phoneNumberId: effective.phoneNumberId,
                accessToken: effective.accessToken,
                appSecret: effective.appSecret,
                graphVersion: effective.graphVersion,
            }
            : undefined;
        if (!provider.verifyWebhookSignature(rawBody, signature, credentials)) {
            throw new AppError('Invalid webhook signature', 401, 'WEBHOOK_SIGNATURE_INVALID');
        }

        const organizationId = routedOrg || await WhatsAppService.resolveWebhookOrganization();

        const type = payload.type;
        if (type === 'status') {
            return await WhatsAppService._processStatusEvent(payload, organizationId);
        }
        if (type === 'message') {
            return await WhatsAppService._processInboundEvent(payload, providerName, organizationId);
        }
        if (payload && payload.object === 'whatsapp_business_account' && Array.isArray(payload.entry)) {
            return await WhatsAppService._processMetaEnvelope(payload, organizationId, providerName);
        }
        throw new AppError('Unsupported webhook event type', 400, 'VALIDATION_ERROR');
    }

    // Meta's native envelope (object/entry/changes) normalized onto the
    // internal handlers above. Text messages ingest; statuses map onto the
    // existing rank progression; anything else (media, reactions, unknown
    // statuses) is counted as ignored, never thrown — one bad event must not
    // sink the batch. No leads are ever auto-created from contact profiles.
    static async _processMetaEnvelope(payload, organizationId, providerName) {
        let processed = 0;
        let ignored = 0;
        let duplicates = 0;
        const tally = (result) => {
            if (!result || result.ignored) ignored += 1;
            else if (result.duplicate) duplicates += 1;
            else processed += 1;
        };
        for (const entry of payload.entry || []) {
            const changes = (entry && entry.changes) || [];
            for (const change of changes) {
                const value = (change && change.value) || {};
                for (const msg of value.messages || []) {
                    if (!msg || msg.type !== 'text' || !msg.text || !msg.text.body) {
                        ignored += 1;
                        continue;
                    }
                    tally(await WhatsAppService._processInboundEvent({
                        providerMessageId: msg.id || null,
                        providerContactId: msg.from || null,
                        phone: msg.from || null,
                        body: msg.text.body
                    }, providerName, organizationId));
                }
                for (const st of value.statuses || []) {
                    const mapped = { sent: 'sent', delivered: 'delivered', read: 'read', failed: 'failed' }[String((st && st.status) || '').toLowerCase()];
                    if (!mapped || !(st && st.id)) {
                        ignored += 1;
                        continue;
                    }
                    tally(await WhatsAppService._processStatusEvent({
                        providerMessageId: st.id,
                        status: mapped,
                        error: st.errors && st.errors[0] ? (st.errors[0].title || st.errors[0].message || null) : null
                    }, organizationId));
                }
            }
        }
        return { ok: true, processed, ignored, duplicates };
    }

    static async _processStatusEvent(payload, organizationId) {
        const { providerMessageId, status, eventId } = payload;
        if (!providerMessageId || !status) {
            throw new AppError('providerMessageId and status are required', 400, 'VALIDATION_ERROR');
        }
        const statusMap = { sent: 'SENT', delivered: 'DELIVERED', read: 'READ', failed: 'FAILED' };
        const mapped = statusMap[String(status).toLowerCase()];
        if (!mapped) throw new AppError('Unknown message status', 400, 'VALIDATION_ERROR');

        const message = await prisma.whatsAppMessage.findFirst({
            where: { organizationId, providerMessageId }
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
        // Bridge delivery progress onto notification outbox rows sharing this
        // provider message id. Best-effort by design: never fails the webhook.
        if (mapped === 'DELIVERED' || mapped === 'READ') {
            await WhatsappNotifyService.handleStatusEvent(organizationId, providerMessageId, mapped).catch(() => {});
        }
        return { ok: true, eventId: eventId || null };
    }

    static async _processInboundEvent(payload, providerName, organizationId) {
        const { providerMessageId, providerContactId, leadId, body, phone } = payload;
        if (!body) throw new AppError('body is required for inbound messages', 400, 'VALIDATION_ERROR');

        // Idempotency: unique (organizationId, providerMessageId).
        if (providerMessageId) {
            const existing = await prisma.whatsAppMessage.findFirst({
                where: { organizationId, providerMessageId }
            });
            if (existing) return { ok: true, duplicate: true };
        }

        // Resolve lead: explicit leadId (must belong to the webhook
        // organization — the HMAC secret is global, so a crafted payload must
        // never steer attribution into another org) or exact phone match
        // within it.
        let lead = null;
        if (payload.organizationId && payload.organizationId !== organizationId) {
            throw new AppError('Webhook organization mismatch', 400, 'ORGANIZATION_MISMATCH');
        }
        if (payload.organizationId) {
            lead = await prisma.lead.findFirst({
                where: { id: leadId || '', organizationId }
            });
        }
        if (!lead && phone) {
            lead = await prisma.lead.findFirst({
                where: { organizationId, phone: String(phone).trim() },
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

        // The customer's reply re-opens WhatsApp's 24-hour window — deliver
        // any PDF attachment (quotation) that was held back or rejected on
        // the original send. Best-effort by design: never fails the save.
        await WhatsAppService._deliverPendingAttachment(lead.organizationId, conversation, lead);

        return { ok: true, messageId: message.id };
    }
}

module.exports = WhatsAppService;
