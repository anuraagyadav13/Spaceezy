const { z } = require('zod');
const { MIN_PASSWORD_LENGTH, MAX_PASSWORD_LENGTH } = require('../constants/passwordReset');

const loginSchema = {
    body: z.object({
        email: z.string().email(),
        password: z.string().min(1, 'Password is required')
    })
};

// --- Password reset -------------------------------------------------------
// Email is trimmed once here so every step (lookup, cooldown key, rate-limit
// key) normalizes identically.

const forgotPasswordSchema = {
    body: z.object({
        email: z.string().trim().min(1, 'Email is required').email('Invalid email address')
    })
};

const verifyResetOtpSchema = {
    body: z.object({
        email: z.string().trim().min(1, 'Email is required').email('Invalid email address'),
        otp: z.string().regex(/^\d{6}$/, 'Verification code must be 6 digits')
    })
};

const resetPasswordSchema = {
    body: z.object({
        email: z.string().trim().min(1, 'Email is required').email('Invalid email address'),
        // 32 random bytes hex, as minted by verify-reset-otp.
        resetToken: z.string().regex(/^[a-f0-9]{64}$/, 'Invalid reset token'),
        newPassword: z
            .string()
            .min(MIN_PASSWORD_LENGTH, `Password must be at least ${MIN_PASSWORD_LENGTH} characters`)
            .max(MAX_PASSWORD_LENGTH, `Password must be at most ${MAX_PASSWORD_LENGTH} characters`)
    })
};

// Self-service profile update (/auth/me). Only the fields a user may change
// on their own record: display name, phone and avatar. Role, status, email
// and permissions stay admin-controlled.
const updateProfileSchema = {
    body: z.object({
        name: z.string().trim().min(1, 'Name is required').max(120, 'Name is too long').optional(),
        phone: z.string().trim().max(32, 'Phone number is too long').nullable().optional(),
        avatar: z.string().trim().max(2048, 'Avatar URL is too long').nullable().optional()
    }).refine(
        (data) => data.name !== undefined || data.phone !== undefined || data.avatar !== undefined,
        { message: 'Nothing to update' }
    )
};

module.exports = {
    loginSchema,
    forgotPasswordSchema,
    verifyResetOtpSchema,
    resetPasswordSchema,
    updateProfileSchema
};
