const { z } = require('zod');

const quotationStatusEnum = z.enum(['DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED']);

const createQuotationSchema = {
    body: z.object({
        leadId: z.string().uuid('leadId must be a valid uuid'),
        projectId: z.string().uuid('projectId must be a valid uuid'),
        propertyId: z.string().uuid().optional().nullable(),
        totalAmount: z.number().positive('totalAmount must be positive'),
        validUntil: z.string().datetime().optional().nullable(),
        status: quotationStatusEnum.optional().default('DRAFT'),
        notes: z.string().optional().nullable(),
    })
};

const updateQuotationSchema = {
    body: z.object({
        status: quotationStatusEnum,
        notes: z.string().optional().nullable(),
    })
};

const getQuotationsQuerySchema = {
    query: z.object({
        page: z.string().regex(/^\d+$/).transform(Number).optional().default("1"),
        limit: z.string().regex(/^\d+$/).transform(Number).optional().default("20"),
        leadId: z.string().uuid().optional(),
        status: quotationStatusEnum.optional(),
        sort: z.enum(['asc', 'desc']).optional().default('desc')
    })
};

module.exports = {
    createQuotationSchema,
    updateQuotationSchema,
    getQuotationsQuerySchema
};
