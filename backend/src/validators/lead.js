const { z } = require('zod');

const leadStatusEnum = z.enum(['NEW', 'CONTACTED', 'INTERESTED', 'QUALIFIED', 'SITE_VISIT', 'NEGOTIATION', 'BOOKED', 'CLOSED', 'LOST']);

const createLeadSchema = {
    body: z.object({
        name: z.string().min(1, 'Name is required'),
        phone: z.string().min(1, 'Phone is required'),
        email: z.string().email().optional().nullable(),
        source: z.string().optional().nullable(),
        campaign: z.string().optional().nullable(),
        landingPage: z.string().optional().nullable(),
        status: leadStatusEnum.optional().default('NEW'),
        assignedToId: z.string().uuid().optional().nullable(),
        assignedTo: z.string().uuid().optional().nullable(),
        stage: leadStatusEnum.optional(),
        interestedUnitType: z.string().optional().nullable(),
        preferredVisitDate: z.string().datetime().optional().nullable(),
        preferredVisitTime: z.string().optional().nullable(),
        message: z.string().optional().nullable(),
        nextFollowUpAt: z.string().datetime().optional().nullable(),
        projectId: z.string().optional().nullable(),
        propertyId: z.string().optional().nullable(),
        project: z.string().optional().nullable(), // For frontend compatibility
        budget: z.string().optional().nullable() // For frontend compatibility
    })
};

const updateLeadSchema = {
    body: z.object({
        name: z.string().optional(),
        phone: z.string().optional(),
        email: z.string().email().optional().nullable(),
        source: z.string().optional().nullable(),
        campaign: z.string().optional().nullable(),
        landingPage: z.string().optional().nullable(),
        status: leadStatusEnum.optional(),
        assignedToId: z.string().uuid().optional().nullable(),
        assignedTo: z.string().uuid().optional().nullable(),
        stage: leadStatusEnum.optional(),
        interestedUnitType: z.string().optional().nullable(),
        preferredVisitDate: z.string().datetime().optional().nullable(),
        preferredVisitTime: z.string().optional().nullable(),
        message: z.string().optional().nullable(),
        nextFollowUpAt: z.string().datetime().optional().nullable(),
        projectId: z.string().optional().nullable(),
        propertyId: z.string().optional().nullable(),
        project: z.string().optional().nullable(),
        budget: z.string().optional().nullable()
    })
};

const getLeadsQuerySchema = {
    query: z.object({
        page: z.string().regex(/^\d+$/).transform(Number).optional().default("1"),
        limit: z.string().regex(/^\d+$/).transform(Number).optional().default("10"),
        search: z.string().optional(),
        status: leadStatusEnum.optional(),
        source: z.string().optional(),
        assignedTo: z.string().uuid().optional(),
        sort: z.enum(['asc', 'desc']).optional().default('desc')
    })
};

module.exports = {
    createLeadSchema,
    updateLeadSchema,
    getLeadsQuerySchema
};
