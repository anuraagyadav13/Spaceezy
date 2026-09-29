const { AppError, asyncHandler } = require('../utils/errors');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const requireAuth = () => {
    return asyncHandler(async (req, res, next) => {
        const sessionToken = req.cookies[process.env.SESSION_COOKIE_NAME];
        
        if (!sessionToken) {
            return next(new AppError('Not logged in', 401, 'UNAUTHORIZED'));
        }

        // Import crypto or argon2 logic to verify the token hash if needed
        // For our implementation, we'll hash the token from the cookie and find the session
        const crypto = require('crypto');
        const tokenHash = crypto.createHash('sha256').update(sessionToken).digest('hex');

        const session = await prisma.session.findUnique({
            where: { tokenHash },
            include: { user: true }
        });

        if (!session || session.expiresAt < new Date()) {
            return next(new AppError('Session expired or invalid', 401, 'UNAUTHORIZED'));
        }

        // Attach authenticated context to the request
        req.auth = {
            userId: session.user.id,
            organizationId: session.user.organizationId,
            role: session.user.role
        };
        
        // Update lastUsedAt optionally (might be expensive for every request, so we can skip or throttle)

        next();
    });
};

const requireRole = (roles) => {
    return (req, res, next) => {
        if (!roles.includes(req.auth.role)) {
            return next(new AppError('You do not have permission to perform this action', 403, 'FORBIDDEN'));
        }
        next();
    };
};

const requirePermission = (permission) => {
    return (req, res, next) => {
        // Here we map roles to permissions as defined in the requirements
        const rolePermissions = {
            SUPER_ADMIN: ['lead:view', 'lead:create', 'lead:update', 'lead:delete', 'employee:view', 'employee:create', 'employee:update', 'employee:delete', 'inventory:view', 'inventory:create', 'inventory:update', 'booking:view', 'booking:create', 'booking:update', 'booking:approve', 'payment:view', 'payment:create', 'commission:view', 'commission:approve'],
            ADMIN: ['lead:view', 'lead:create', 'lead:update', 'employee:view', 'inventory:view', 'booking:view', 'payment:view', 'commission:view'],
            SALES_MANAGER: ['lead:view', 'lead:create', 'lead:update', 'booking:view', 'booking:create', 'booking:update'],
            SALES_EXECUTIVE: ['lead:view', 'lead:create', 'lead:update', 'booking:view', 'booking:create'],
            CHANNEL_PARTNER: ['lead:view', 'lead:create'],
        };
        
        const userRole = req.auth.role;
        const permissions = rolePermissions[userRole] || [];
        
        if (!permissions.includes(permission)) {
            return next(new AppError(`You lack the required permission: ${permission}`, 403, 'FORBIDDEN'));
        }
        
        next();
    };
};

module.exports = {
    requireAuth,
    requireRole,
    requirePermission
};
