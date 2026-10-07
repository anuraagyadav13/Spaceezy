const { z } = require('zod');

const agendaQuerySchema = {
    query: z.object({
        view: z.enum(['today', 'upcoming', 'overdue', 'completed']).optional(),
        type: z.enum(['FOLLOW_UP', 'MEETING', 'CALL', 'SITE_VISIT', 'OTHER']).optional(),
        assignedToId: z.string().uuid().optional(),
        leadId: z.string().uuid().optional(),
        projectId: z.string().uuid().optional(),
        status: z.enum(['PENDING', 'COMPLETED', 'CANCELLED']).optional(),
        from: z.string().optional(),
        to: z.string().optional(),
        page: z.string().regex(/^\d+$/).optional(),
        limit: z.string().regex(/^\d+$/).optional()
    })
};

const productivityQuerySchema = {
    query: z.object({
        employeeId: z.string().uuid().optional(),
        from: z.string().optional(),
        to: z.string().optional()
    })
};

const needsAttentionQuerySchema = {
    query: z.object({
        employeeId: z.string().uuid().optional(),
        leadId: z.string().uuid().optional()
    })
};

const idParamsSchema = {
    params: z.object({
        id: z.string().uuid('id must be a valid UUID')
    })
};

module.exports = {
    agendaQuerySchema,
    productivityQuerySchema,
    needsAttentionQuerySchema,
    idParamsSchema
};
