const { z } = require('zod');

const idParamsSchema = {
    params: z.object({
        id: z.string().uuid('id must be a valid UUID')
    })
};

const getCustomersQuerySchema = {
    query: z.object({
        page: z.string().optional(),
        limit: z.string().optional(),
        status: z.enum(['ACTIVE', 'CLOSED', 'INACTIVE']).optional(),
        assignedToId: z.string().uuid().optional(),
        search: z.string().optional(),
        sort: z.enum(['asc', 'desc']).optional()
    })
};

const createCustomerSchema = {
    body: z.object({
        name: z.string().trim().min(1, 'Name is required').max(200),
        phone: z.string().trim().min(7, 'Phone must be at least 7 characters').max(20, 'Phone must be at most 20 characters'),
        email: z.string().email().optional().or(z.literal('')),
        status: z.enum(['ACTIVE', 'CLOSED', 'INACTIVE']).optional(),
        notes: z.string().max(2000).optional(),
        assignedToId: z.string().uuid().optional()
    })
};

const updateCustomerSchema = {
    body: z.object({
        name: z.string().trim().min(1, 'Name is required').optional(),
        phone: z.string().trim().min(7, 'Phone must be at least 7 characters').max(20, 'Phone must be at most 20 characters').optional(),
        email: z.string().email().optional().or(z.literal('')),
        status: z.enum(['ACTIVE', 'CLOSED', 'INACTIVE']).optional(),
        notes: z.string().max(2000).optional(),
        assignedToId: z.string().uuid().optional()
    })
};

module.exports = {
    idParamsSchema,
    getCustomersQuerySchema,
    createCustomerSchema,
    updateCustomerSchema
};
