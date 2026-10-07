const { AppError, asyncHandler } = require('../utils/errors');
const prisma = require('../db/prisma');

const requireAuth = () => {
    return asyncHandler(async (req, res, next) => {
        const cookieName = process.env.SESSION_COOKIE_NAME || 'spaceezy_session';
        const sessionToken = req.cookies?.[cookieName];

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

        if (session.user.status !== 'ACTIVE') {
            return next(new AppError('Account is deactivated', 401, 'UNAUTHORIZED'));
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

const ROLE_PERMISSIONS = {
    SUPER_ADMIN: [
        'lead:view', 'lead:create', 'lead:update', 'lead:delete',
        'lead:assign', 'lead:merge',
        'employee:view', 'employee:create', 'employee:update', 'employee:delete',
        'inventory:view', 'inventory:create', 'inventory:update',
        'booking:view', 'booking:create', 'booking:update', 'booking:approve',
        'payment:view', 'payment:create',
        'commission:view', 'commission:approve',
        'site_visit:view', 'site_visit:create', 'site_visit:update', 'site_visit:delete',
        'customer:view', 'customer:create', 'customer:update', 'customer:delete',
        'task:view', 'task:create', 'task:update', 'task:delete',
        'project:view', 'project:create', 'project:update', 'project:delete',
        'quotation:view', 'quotation:create', 'quotation:update',
        'call:view', 'call:create', 'call:update',
        'whatsapp:view', 'whatsapp:create', 'whatsapp:manage',
        'recording:view', 'pii:view',
    ],
    ADMIN: [
        'lead:view', 'lead:create', 'lead:update',
        'lead:assign', 'lead:merge',
        'employee:view', 'employee:update',
        'inventory:view', 'inventory:create', 'inventory:update',
        'booking:view', 'booking:create', 'booking:update',
        'payment:view',
        'commission:view',
        'site_visit:view', 'site_visit:create', 'site_visit:update', 'site_visit:delete',
        'customer:view', 'customer:create', 'customer:update',
        'task:view', 'task:create', 'task:update', 'task:delete',
        'project:view', 'project:create', 'project:update',
        'quotation:view', 'quotation:create', 'quotation:update',
        'call:view', 'call:create', 'call:update',
        'whatsapp:view', 'whatsapp:create', 'whatsapp:manage',
        'recording:view', 'pii:view',
    ],
    SALES_MANAGER: [
        'lead:view', 'lead:create', 'lead:update',
        'lead:assign', 'lead:merge',
        'booking:view', 'booking:create', 'booking:update',
        'inventory:view',
        'site_visit:view', 'site_visit:create', 'site_visit:update',
        'customer:view', 'customer:create', 'customer:update',
        'task:view', 'task:create', 'task:update', 'task:delete',
        'project:view',
        'employee:view',
        'quotation:view', 'quotation:create', 'quotation:update',
        'call:view', 'call:create', 'call:update',
        'whatsapp:view', 'whatsapp:create', 'whatsapp:manage',
        'recording:view',
    ],
    SALES_EXECUTIVE: [
        'lead:view', 'lead:create', 'lead:update',
        'booking:view', 'booking:create',
        'inventory:view',
        'site_visit:view', 'site_visit:create', 'site_visit:update',
        'customer:view', 'customer:create', 'customer:update',
        'task:view', 'task:create', 'task:update',
        'project:view',
        'quotation:view', 'quotation:create', 'quotation:update',
        'call:view', 'call:create', 'call:update',
        'whatsapp:view', 'whatsapp:create',
    ],
    CHANNEL_PARTNER: [
        'lead:view', 'lead:create',
        'site_visit:view',
        'task:view',
        'project:view',
        'inventory:view',
        'quotation:view',
    ],
};

const requirePermission = (permission) => {
    return (req, res, next) => {
        const userRole = req.auth.role;
        const permissions = ROLE_PERMISSIONS[userRole] || [];

        if (!permissions.includes(permission)) {
            return next(new AppError(`You lack the required permission: ${permission}`, 403, 'FORBIDDEN'));
        }

        next();
    };
};

const hasPermission = (role, permission) => {
    return (ROLE_PERMISSIONS[role] || []).includes(permission);
};

module.exports = {
    requireAuth,
    requireRole,
    requirePermission,
    hasPermission,
    ROLE_PERMISSIONS
};
