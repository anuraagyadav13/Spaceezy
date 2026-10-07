const { z } = require('zod');

const siteVisitStatusEnum = z.enum(['SCHEDULED', 'COMPLETED', 'CANCELLED', 'NO_SHOW']);

const validDateRefine = (value) => !isNaN(Date.parse(value));

const getSiteVisitsQuerySchema = {
    query: z.object({
        page: z.string().regex(/^\d+$/).transform(Number).optional().default("1"),
        limit: z.string().regex(/^\d+$/).transform(Number).optional().default("20"),
        status: siteVisitStatusEnum.optional(),
        assignedToId: z.string().uuid().optional(),
        projectId: z.string().uuid().optional(),
        leadId: z.string().uuid().optional(),
        search: z.string().optional(),
        sort: z.enum(['asc', 'desc']).optional().default('desc')
    })
};

const siteVisitRefFields = {
    leadId: z.string().uuid('leadId must be a valid UUID').optional().nullable(),
    projectId: z.string().uuid('projectId must be a valid UUID').optional().nullable(),
    propertyId: z.string().uuid('propertyId must be a valid UUID').optional().nullable()
};

const createSiteVisitSchema = {
    body: z.object({
        ...siteVisitRefFields,
        leadName: z.string().optional().nullable(),
        phone: z.string().optional().nullable(),
        propertyName: z.string().optional().nullable(),
        date: z.string().min(1, 'Date is required').refine(validDateRefine, 'Date is not a valid date'),
        time: z.string().min(1, 'Time is required'),
        status: siteVisitStatusEnum.optional(),
        assignedToId: z.string().uuid('assignedToId must be a valid UUID').optional().nullable()
    })
};

const updateSiteVisitSchema = {
    body: z.object({
        ...siteVisitRefFields,
        leadName: z.string().optional().nullable(),
        phone: z.string().optional().nullable(),
        propertyName: z.string().optional().nullable(),
        date: z.string().refine(validDateRefine, 'Date is not a valid date').optional(),
        time: z.string().min(1).optional(),
        status: siteVisitStatusEnum.optional(),
        assignedToId: z.string().uuid('assignedToId must be a valid UUID').optional().nullable()
    })
};

const updateSiteVisitStatusSchema = {
    params: z.object({
        id: z.string().uuid('id must be a valid UUID')
    }),
    body: z.object({
        status: siteVisitStatusEnum
    })
};

const siteVisitIdParamsSchema = {
    params: z.object({
        id: z.string().uuid('id must be a valid UUID')
    })
};

module.exports = {
    getSiteVisitsQuerySchema,
    createSiteVisitSchema,
    updateSiteVisitSchema,
    updateSiteVisitStatusSchema,
    siteVisitIdParamsSchema,
    siteVisitStatusEnum
};
