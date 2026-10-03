const { z } = require('zod');

const getSiteVisitsQuerySchema = {
    query: z.object({
        page: z.string().optional(),
        limit: z.string().optional(),
        status: z.string().optional(),
        assignedToId: z.string().optional(),
        search: z.string().optional(),
        sort: z.string().optional()
    })
};

const createSiteVisitSchema = {
    body: z.object({
        leadId: z.string().uuid().optional(),
        leadName: z.string().optional(),
        phone: z.string().optional(),
        propertyName: z.string().optional(),
        date: z.string().min(1, 'Date is required'),
        time: z.string().min(1, 'Time is required'),
        status: z.enum(['SCHEDULED', 'COMPLETED', 'CANCELLED', 'NO_SHOW']).optional(),
        assignedToId: z.string().uuid().optional()
    })
};

const updateSiteVisitSchema = {
    body: z.object({
        leadName: z.string().optional(),
        phone: z.string().optional(),
        propertyName: z.string().optional(),
        date: z.string().optional(),
        time: z.string().optional(),
        status: z.enum(['SCHEDULED', 'COMPLETED', 'CANCELLED', 'NO_SHOW']).optional(),
        assignedToId: z.string().uuid().optional()
    })
};

module.exports = {
    getSiteVisitsQuerySchema,
    createSiteVisitSchema,
    updateSiteVisitSchema
};
