const { z } = require('zod');

const getTasksQuerySchema = {
    query: z.object({
        page: z.string().optional(),
        limit: z.string().optional(),
        status: z.string().optional(),
        type: z.string().optional(),
        assignedToId: z.string().optional(),
        search: z.string().optional(),
        sort: z.string().optional()
    })
};

const createTaskSchema = {
    body: z.object({
        title: z.string().min(1, 'Title is required'),
        description: z.string().optional(),
        type: z.enum(['FOLLOW_UP', 'MEETING', 'CALL', 'SITE_VISIT', 'OTHER']).optional(),
        status: z.enum(['PENDING', 'COMPLETED', 'CANCELLED']).optional(),
        dueDate: z.string().min(1, 'Due date is required'),
        leadId: z.string().uuid().optional(),
        assignedToId: z.string().uuid().optional()
    })
};

const updateTaskSchema = {
    body: z.object({
        title: z.string().optional(),
        description: z.string().optional(),
        type: z.enum(['FOLLOW_UP', 'MEETING', 'CALL', 'SITE_VISIT', 'OTHER']).optional(),
        status: z.enum(['PENDING', 'COMPLETED', 'CANCELLED']).optional(),
        dueDate: z.string().optional(),
        leadId: z.string().uuid().optional().nullable(),
        assignedToId: z.string().uuid().optional()
    })
};

module.exports = {
    getTasksQuerySchema,
    createTaskSchema,
    updateTaskSchema
};
