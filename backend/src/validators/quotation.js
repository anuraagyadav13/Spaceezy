const { z } = require('zod');

const quotationStatusEnum = z.enum(['DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED']);

const idParamsSchema = {
    params: z.object({
        id: z.string().uuid('id must be a valid UUID')
    })
};

const createQuotationSchema = {
    body: z.object({
        leadId: z.string().uuid('leadId must be a valid uuid'),
        projectId: z.string().uuid('projectId must be a valid uuid'),
        propertyId: z.string().uuid().optional().nullable(),
        totalAmount: z.number().positive('totalAmount must be positive').max(999999999999, 'totalAmount exceeds the supported maximum'),
        validUntil: z.string().datetime('validUntil must be an ISO datetime')
            .refine((v) => new Date(v).getTime() > Date.now(), 'validUntil must be in the future')
            .optional().nullable(),
        status: quotationStatusEnum.optional().default('DRAFT'),
        notes: z.string().optional().nullable(),
    })
};

const updateQuotationSchema = {
    params: z.object({
        id: z.string().uuid('id must be a valid UUID')
    }),
    body: z.object({
        status: quotationStatusEnum.optional(),
        notes: z.string().optional().nullable(),
    }).superRefine((body, ctx) => {
        if (body.status === undefined && body.notes === undefined) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: 'Provide a status or notes to update',
                path: ['status']
            });
        }
    })
};

const getQuotationsQuerySchema = {
    query: z.object({
        page: z.string().regex(/^\d+$/).transform(Number).optional().default("1"),
        limit: z.string().regex(/^\d+$/).transform(Number).optional().default("20"),
        leadId: z.string().uuid().optional(),
        projectId: z.string().uuid().optional(),
        status: quotationStatusEnum.optional(),
        sort: z.enum(['asc', 'desc']).optional().default('desc')
    })
};

module.exports = {
    createQuotationSchema,
    updateQuotationSchema,
    getQuotationsQuerySchema,
    idParamsSchema,
    quotationStatusEnum
};
