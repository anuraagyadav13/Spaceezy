const { z } = require('zod');

const getUsersQuerySchema = {
    query: z.object({
        page: z.string().optional(),
        limit: z.string().optional(),
        search: z.string().optional(),
        role: z.string().optional(),
        status: z.string().optional(),
        sort: z.string().optional()
    })
};

const createUserSchema = {
    body: z.object({
        name: z.string().min(1, 'Name is required'),
        email: z.string().email('Invalid email address'),
        phone: z.string().optional(),
        password: z.string().min(6, 'Password must be at least 6 characters'),
        role: z.enum(['SUPER_ADMIN', 'ADMIN', 'SALES_MANAGER', 'SALES_EXECUTIVE', 'CHANNEL_PARTNER']).optional(),
        status: z.enum(['ACTIVE', 'INACTIVE']).optional()
    })
};

const updateUserSchema = {
    body: z.object({
        name: z.string().optional(),
        email: z.string().email('Invalid email address').optional(),
        phone: z.string().optional(),
        role: z.enum(['SUPER_ADMIN', 'ADMIN', 'SALES_MANAGER', 'SALES_EXECUTIVE', 'CHANNEL_PARTNER']).optional(),
        status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
        selfClaimLimit: z.number().int().min(0, 'selfClaimLimit must be 0 or greater').max(1000, 'selfClaimLimit cannot exceed 1000').nullable().optional()
    })
};

module.exports = {
    getUsersQuerySchema,
    createUserSchema,
    updateUserSchema
};
