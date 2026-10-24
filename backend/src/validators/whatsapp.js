const { z } = require('zod');

const idParamsSchema = {
    params: z.object({
        id: z.string().uuid('id must be a valid UUID')
    })
};

const createConversationSchema = {
    body: z.object({
        leadId: z.string().uuid('leadId must be a valid UUID')
    })
};

const listConversationsQuerySchema = {
    query: z.object({
        leadId: z.string().uuid().optional(),
        status: z.enum(['ACTIVE', 'CLOSED']).optional(),
        limit: z.string().regex(/^\d+$/).optional()
    })
};

const listMessagesQuerySchema = {
    query: z.object({
        page: z.string().regex(/^\d+$/).optional(),
        limit: z.string().regex(/^\d+$/).optional()
    })
};

const sendMessageSchema = {
    body: z.object({
        body: z.string().max(4000).optional(),
        templateName: z.string().max(200).optional(),
        variables: z.array(z.union([z.string(), z.number()])).max(20).optional(),
        // Optional share context: links the message to the public property
        // page it promotes (tracked on the lead timeline).
        share: z.object({
            propertyId: z.string().uuid('propertyId must be a valid UUID')
        }).optional(),
        // Optional companion media, opt-in per send: the server resolves the
        // employee-uploaded brochure PDF, the two-page itemised quotation,
        // and/or the property's gallery images — each delivered as its own
        // message alongside the text. Nothing is ever generated: the
        // brochure is exactly the file an employee uploaded.
        attachment: z.object({
            projectId: z.string().uuid('projectId must be a valid UUID'),
            propertyId: z.string().uuid('propertyId must be a valid UUID').optional(),
            // Include the PDF (default true — older clients that never send
            // the flag keep the old behaviour).
            pdf: z.boolean().optional(),
            // Which document(s) `pdf` carries — 'brochure' and 'quotation'
            // are independent options (tick either, or both in one send).
            kind: z.enum(['brochure', 'quotation']).optional(),
            // Full ordered list when more than one document rides the send.
            // WhatsApp carries one document per message, so the service
            // delivers each as its own message and files one thread row per
            // file. Falls back to `kind` for older single-PDF clients.
            kinds: z.array(z.enum(['brochure', 'quotation'])).max(2).optional(),
            // Per-send add-on values printed on the quotation (floor rise,
            // upgrades …) and summed into its total. Re-validated again by
            // sanitizeAddons before anything renders or persists.
            addons: z.array(z.object({
                name: z.string().trim().min(1).max(60),
                amount: z.number().positive().max(999999999)
            })).max(8).optional(),
            // The full editable quotation sheet: cost rows (name / basis /
            // amount), the brokerage % of the net base value, the GST % on
            // that brokerage and the payout-schedule ratios. The renderer
            // re-validates every field (sanitizeQuote) — raising the
            // brokerage % reprices the fee, its GST and each instalment.
            quote: z.object({
                rows: z.array(z.object({
                    name: z.string().trim().min(1).max(60),
                    basis: z.string().trim().max(90).optional(),
                    amount: z.number().min(0).max(999999999)
                })).max(12).optional(),
                brokerPct: z.number().min(0).max(100).optional(),
                gstPct: z.number().min(0).max(100).optional(),
                payouts: z.array(z.object({
                    label: z.string().trim().min(1).max(90),
                    ratio: z.number().min(0).max(100)
                })).max(6).optional(),
                // Builder-direct flats carry no commission: false pulls the
                // fee, its GST and the payout schedule off the printed sheet.
                brokerageOn: z.boolean().optional()
            }).optional(),
            // Also send the unit's (or project's) gallery images.
            images: z.boolean().optional()
        }).optional()
    }).refine(
        (b) => (b.templateName && b.templateName.trim()) || (b.body && b.body.trim()),
        { message: 'body or templateName is required', path: ['body'] }
    )
};

const templateVariablesSchema = z.array(z.string().max(100)).max(20);

const createTemplateSchema = {
    body: z.object({
        name: z.string().trim().min(1).max(100),
        providerTemplateId: z.string().max(200).optional(),
        language: z.string().max(20).optional(),
        category: z.enum(['MARKETING', 'UTILITY', 'AUTHENTICATION']).optional(),
        description: z.string().trim().max(200).optional(),
        body: z.string().trim().min(1).max(4000).optional(),
        variables: templateVariablesSchema.optional(),
        active: z.boolean().optional()
    })
};

const updateTemplateSchema = {
    body: z.object({
        active: z.boolean().optional(),
        language: z.string().max(20).optional(),
        variables: templateVariablesSchema.optional(),
        providerTemplateId: z.string().max(200).optional(),
        description: z.string().trim().max(200).nullable().optional(),
        body: z.string().trim().min(1).max(4000).nullable().optional()
    })
};

const listTemplatesQuerySchema = {
    query: z.object({
        active: z.enum(['true', 'false']).optional()
    })
};

const idParam = z.string().uuid('id must be a valid UUID');
const digitId = z.string().regex(/^\d{1,32}$/, 'must be a numeric identifier').nullish();
const secretInput = z.string().trim().max(500).nullish();

const recipientInput = z.object({
    phone: z.string().min(1, 'Recipient phone is required').max(20),
    label: z.string().max(100).optional().nullable(),
    enabled: z.boolean().optional(),
});

const saveSettingsSchema = {
    body: z.object({
        appId: digitId,
        wabaId: digitId,
        phoneNumberId: digitId,
        graphVersion: z.string().regex(/^v\d+\.\d+$/, 'must look like v21.0').nullish(),
        providerMode: z.enum(['mock', 'meta']).optional(),
        accessToken: secretInput,
        appSecret: secretInput,
        verifyToken: secretInput,
        notifyEnabled: z.boolean().optional(),
        notifyRecipients: z.array(recipientInput).max(10).nullish(),
        notifyTemplateName: z.string().trim().min(1).max(100).nullish(),
    }).superRefine((body, ctx) => {
        if (body.graphVersion) {
            const match = /^v(\d+)\.(\d+)$/.exec(body.graphVersion);
            if (!match || Number(match[1]) < 21) {
                ctx.addIssue({ code: 'custom', path: ['graphVersion'], message: 'graphVersion must be v21.0 or newer' });
            }
        }
        for (const [index, recipient] of (body.notifyRecipients || []).entries()) {
            const digits = String(recipient.phone || '').replace(/\D/g, '');
            if (!/^[1-9]\d{7,14}$/.test(digits)) {
                ctx.addIssue({ code: 'custom', path: ['notifyRecipients', index, 'phone'], message: 'Recipient phone must be a valid E.164 number' });
            }
        }
    })
};

const rotateSecretSchema = {
    body: z.object({
        field: z.enum(['accessToken', 'appSecret', 'verifyToken']),
        value: z.string().trim().min(1, 'A non-empty value is required').max(500),
    })
};

const secretFieldParamsSchema = {
    params: z.object({
        field: z.enum(['accessToken', 'appSecret', 'verifyToken']),
    })
};

const testNotifySchema = {
    body: z.object({
        recipient: z.string().max(20).optional(),
    })
};

module.exports = {
    idParamsSchema,
    createConversationSchema,
    listConversationsQuerySchema,
    listMessagesQuerySchema,
    sendMessageSchema,
    createTemplateSchema,
    updateTemplateSchema,
    listTemplatesQuerySchema,
    saveSettingsSchema,
    rotateSecretSchema,
    secretFieldParamsSchema,
    testNotifySchema,
};
