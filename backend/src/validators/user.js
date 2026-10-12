const { z } = require('zod');

// Two-role model: owner (ADMIN) and employees (SALES_EXECUTIVE). Other enum
// values stay valid in the database but can no longer be assigned through
// the API; SUPER_ADMIN elevation is additionally guarded in userService.
const assignableRoles = z.enum(['ADMIN', 'SALES_EXECUTIVE']);

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
        password: z.string().min(10, 'Password must be at least 10 characters'),
        role: assignableRoles.optional(),
        status: z.enum(['ACTIVE', 'INACTIVE']).optional()
    })
};

const updateUserSchema = {
    body: z.object({
        name: z.string().optional(),
        email: z.string().email('Invalid email address').optional(),
        phone: z.string().optional(),
        role: assignableRoles.optional(),
        status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
        selfClaimLimit: z.number().int().min(0, 'selfClaimLimit must be 0 or greater').max(1000, 'selfClaimLimit cannot exceed 1000').nullable().optional()
    })
};

module.exports = {
    getUsersQuerySchema,
    createUserSchema,
    updateUserSchema
};
