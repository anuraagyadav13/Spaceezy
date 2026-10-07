const { z } = require('zod');

const idParamsSchema = {
    params: z.object({
        id: z.string().uuid('id must be a valid UUID')
    })
};

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
        priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
        dueDate: z.string().min(1, 'Due date is required'),
        leadId: z.string().uuid().optional(),
        assignedToId: z.string().uuid().optional(),
        sourceCallId: z.string().uuid().optional()
    })
};

const updateTaskSchema = {
    body: z.object({
        title: z.string().optional(),
        description: z.string().optional(),
        type: z.enum(['FOLLOW_UP', 'MEETING', 'CALL', 'SITE_VISIT', 'OTHER']).optional(),
        status: z.enum(['PENDING', 'COMPLETED', 'CANCELLED']).optional(),
        priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
        dueDate: z.string().optional(),
        leadId: z.string().uuid().optional().nullable(),
        assignedToId: z.string().uuid().optional()
    })
};

const taskStatusSchema = {
    body: z.object({
        status: z.enum(['PENDING', 'COMPLETED', 'CANCELLED'])
    })
};

const rescheduleTaskSchema = {
    body: z.object({
        dueDate: z.string().min(1, 'dueDate is required'),
        reason: z.string().max(500).optional()
    })
};

module.exports = {
    idParamsSchema,
    getTasksQuerySchema,
    createTaskSchema,
    updateTaskSchema,
    taskStatusSchema,
    rescheduleTaskSchema
};
