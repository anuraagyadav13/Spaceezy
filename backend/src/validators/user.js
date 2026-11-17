const { z } = require('zod');

// All five roles shown on the Roles & Permissions page are assignable through
// the API. SUPER_ADMIN creation/elevation stays guarded in userService
// (only a SUPER_ADMIN requester may do it) so an owner cannot escalate.
const assignableRoles = z.enum([
    'SUPER_ADMIN',
    'ADMIN',
    'SALES_MANAGER',
    'SALES_EXECUTIVE',
    'CHANNEL_PARTNER'
]);

// Per-user permission grants on top of the role matrix. Whitelisted so a
// request can never smuggle in employee:create, lead:delete, etc.
const GRANTABLE_PERMISSIONS = ['marketing:view', 'marketing:manage'];

const grantablePermissions = z
    .array(z.enum(GRANTABLE_PERMISSIONS))
    .superRefine((perms, ctx) => {
        // marketing:manage without marketing:view would be incoherent.
        if (perms.includes('marketing:manage') && !perms.includes('marketing:view')) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: 'marketing:manage requires marketing:view'
            });
        }
    });

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
        selfClaimLimit: z.number().int().min(0, 'selfClaimLimit must be 0 or greater').max(1000, 'selfClaimLimit cannot exceed 1000').nullable().optional(),
        extraPermissions: grantablePermissions.optional()
    })
};

module.exports = {
    getUsersQuerySchema,
    createUserSchema,
    updateUserSchema,
    assignableRoles,
    GRANTABLE_PERMISSIONS
};
