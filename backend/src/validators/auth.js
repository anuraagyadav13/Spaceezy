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
// on their own record: display name, phone, avatar, and - for employee roles
// only - the employee profile details. Role, status, email and permissions
// stay admin-controlled.
const employeeDateOnly = z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
    .nullable()
    .optional();

const updateProfileSchema = {
    body: z.object({
        name: z.string().trim().min(1, 'Name is required').max(120, 'Name is too long').optional(),
        phone: z.string().trim().max(32, 'Phone number is too long').nullable().optional(),
        avatar: z.string().trim().max(2048, 'Avatar URL is too long').nullable().optional(),
        dateOfBirth: employeeDateOnly,
        dateOfJoining: employeeDateOnly,
        designation: z.string().trim().max(120, 'Designation is too long').nullable().optional(),
        address: z.string().trim().max(500, 'Address is too long').nullable().optional(),
        emergencyContactPhone: z.string().trim().max(32, 'Contact phone is too long').nullable().optional()
    }).refine(
        (data) => Object.values(data).some((value) => value !== undefined),
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
