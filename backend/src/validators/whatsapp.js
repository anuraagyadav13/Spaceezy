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
        variables: templateVariablesSchema.optional(),
        active: z.boolean().optional()
    })
};

const updateTemplateSchema = {
    body: z.object({
        active: z.boolean().optional(),
        language: z.string().max(20).optional(),
        variables: templateVariablesSchema.optional(),
        providerTemplateId: z.string().max(200).optional()
    })
};

const listTemplatesQuerySchema = {
    query: z.object({
        active: z.enum(['true', 'false']).optional()
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
    listTemplatesQuerySchema
};
