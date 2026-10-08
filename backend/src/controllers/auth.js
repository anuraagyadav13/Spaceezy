const { AppError, asyncHandler } = require('../utils/errors');
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
            role: user.role,
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
    const sessionToken = req.cookies?.[cookieName];

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
            role: user.role,
            organization: {
                id: user.organization.id,
                name: user.organization.name
            }
        },
        message: 'Success'
    });
});

module.exports = {
    login,
    logout,
    getMe
};
