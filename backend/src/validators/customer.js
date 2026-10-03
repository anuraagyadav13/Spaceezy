const { z } = require('zod');

const getCustomersQuerySchema = {
    query: z.object({
        page: z.string().optional(),
        limit: z.string().optional(),
        status: z.string().optional(),
        assignedToId: z.string().optional(),
        search: z.string().optional(),
        sort: z.string().optional()
    })
};

const createCustomerSchema = {
    body: z.object({
        name: z.string().min(1, 'Name is required'),
        phone: z.string().min(1, 'Phone is required'),
        email: z.string().email().optional().or(z.literal('')),
        status: z.enum(['ACTIVE', 'CLOSED', 'INACTIVE']).optional(),
        notes: z.string().optional(),
        assignedToId: z.string().uuid().optional()
    })
};

const updateCustomerSchema = {
    body: z.object({
        name: z.string().optional(),
        phone: z.string().optional(),
        email: z.string().email().optional().or(z.literal('')),
        status: z.enum(['ACTIVE', 'CLOSED', 'INACTIVE']).optional(),
        notes: z.string().optional(),
        assignedToId: z.string().uuid().optional()
    })
};

module.exports = {
    getCustomersQuerySchema,
    createCustomerSchema,
    updateCustomerSchema
};
