const { AppError, asyncHandler } = require('../utils/errors');
const { extractSessionToken, getEffectivePermissions } = require('../middleware/auth');
const { toMediaPath } = require('../services/storageService');
const { resetMediaCache } = require('../utils/publicMedia');
const prisma = require("../db/prisma");
const crypto = require('crypto');
const argon2 = require('argon2');



const login = asyncHandler(async (req, res, next) => {
    const { email, password } = req.body || {};

    if (!email || !password) {
        return next(new AppError('Please provide email and password', 400, 'VALIDATION_ERROR'));
    }

    const user = await prisma.user.findFirst({
        where: { email },
        include: { organization: true }
    });

    if (!user || user.status !== 'ACTIVE') {
        return next(new AppError('Incorrect email or password', 401, 'UNAUTHORIZED'));
    }

    const isPasswordValid = await argon2.verify(user.passwordHash, password);

    if (!isPasswordValid) {
        return next(new AppError('Incorrect email or password', 401, 'UNAUTHORIZED'));
    }

    // Generate opaque token
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    // Create session in database
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + parseInt(process.env.SESSION_TTL_DAYS || '7'));

    await prisma.session.create({
        data: {
            userId: user.id,
            tokenHash,
            expiresAt,
            lastUsedAt: new Date()
        }
    });

    const cookieName = process.env.SESSION_COOKIE_NAME || 'spaceezy_session';

    // Set cookie
    res.cookie(cookieName, token, {
        httpOnly: true,
        // COOKIE_SECURE=false exists only for HTTP local smoke tests of the
        // production image; never set it in a real deployment.
        secure: process.env.NODE_ENV === 'production' && process.env.COOKIE_SECURE !== 'false',
        sameSite: 'lax',
        expires: expiresAt
    });

    res.status(200).json({
        success: true,
        data: {
            id: user.id,
            name: user.name,
            email: user.email,
            phone: user.phone || null,
            avatar: user.avatar || null,
            role: user.role,
            // Owner-granted permission overrides + the effective matrix so
            // clients render navigation without re-deriving it.
            extraPermissions: user.extraPermissions || [],
            permissions: getEffectivePermissions(user.role, user.extraPermissions),
            // Opaque session token for non-browser clients (mobile). The web
            // CRM ignores this field and keeps using the httpOnly cookie.
            // Only the raw token is returned — never its hash.
            token,
            tokenExpiresAt: expiresAt.toISOString(),
            organization: {
                id: user.organization.id,
                name: user.organization.name
            }
        },
        message: 'Logged in successfully'
    });
});

const logout = asyncHandler(async (req, res, next) => {
    const cookieName = process.env.SESSION_COOKIE_NAME || 'spaceezy_session';
    // Revoke whichever session authenticated this request (cookie or Bearer).
    const sessionToken = extractSessionToken(req);

    if (sessionToken) {
        const tokenHash = crypto.createHash('sha256').update(sessionToken).digest('hex');
        await prisma.session.deleteMany({
            where: { tokenHash }
        });
    }

    res.clearCookie(cookieName);

    res.status(200).json({
        success: true,
        data: {},
        message: 'Logged out successfully'
    });
});

const getMe = asyncHandler(async (req, res, next) => {
    const user = await prisma.user.findUnique({
        where: { id: req.auth.userId },
        include: { organization: true }
    });

    if (!user) {
        return next(new AppError('User not found', 404, 'NOT_FOUND'));
    }

    res.status(200).json({
        success: true,
        data: {
            id: user.id,
            name: user.name,
            email: user.email,
            phone: user.phone || null,
            avatar: user.avatar || null,
            role: user.role,
            extraPermissions: user.extraPermissions || [],
            permissions: getEffectivePermissions(user.role, user.extraPermissions),
            organization: {
                id: user.organization.id,
                name: user.organization.name
            }
        },
        message: 'Success'
    });
});

// Self-service profile update. A signed-in user may change only their own
// name, phone and avatar — never role, status, email or permissions. The
// avatar must be an uploaded media path or an absolute http(s) URL, so a
// stray string cannot become an arbitrary javascript:/data: src.
const updateMe = asyncHandler(async (req, res, next) => {
    const payload = req.body || {};

    const data = {};
    if (payload.name !== undefined) data.name = payload.name;
    if (payload.phone !== undefined) data.phone = payload.phone === '' ? null : payload.phone;
    if (payload.avatar !== undefined) {
        const avatar = payload.avatar === '' ? null : payload.avatar;
        if (avatar !== null && !/^\/[^/]/.test(avatar) && !/^https?:\/\//i.test(avatar)) {
            return next(new AppError('Avatar must be an uploaded image URL', 400, 'VALIDATION_ERROR'));
        }
        // Store the private-bucket proxy path (/media/...) rather than a raw
        // S3 URL, so the photo loads through the server on every deployment.
        data.avatar = avatar === null ? null : toMediaPath(avatar);
    }

    if (Object.keys(data).length === 0) {
        return next(new AppError('Nothing to update', 400, 'VALIDATION_ERROR'));
    }

    const user = await prisma.user.update({
        where: { id: req.auth.userId },
        data,
        include: { organization: true }
    });

    // The avatar allow-list is cached; refresh it so the new photo is readable
    // through /media immediately (and the old one stops being allow-listed).
    resetMediaCache();

    res.status(200).json({
        success: true,
        data: {
            id: user.id,
            name: user.name,
            email: user.email,
            phone: user.phone || null,
            avatar: user.avatar || null,
            role: user.role,
            extraPermissions: user.extraPermissions || [],
            permissions: getEffectivePermissions(user.role, user.extraPermissions),
            organization: {
                id: user.organization.id,
                name: user.organization.name
            }
        },
        message: 'Profile updated'
    });
});

const getPermissions = asyncHandler(async (req, res, next) => {
    // Role comes from the authenticated session (resolved from DB on every
    // request by requireAuth) — never from client input. Serves the SAME
    // ROLE_PERMISSIONS matrix that requirePermission() enforces, so mobile
    // navigation cannot drift from the server's authorization decisions.
    const permissions = getEffectivePermissions(req.auth.role, req.auth.extraPermissions);

    res.status(200).json({
        success: true,
        data: {
            role: req.auth.role,
            permissions
        },
        message: 'Success'
    });
});

module.exports = {
    login,
    logout,
    getMe,
    updateMe,
    getPermissions
};
