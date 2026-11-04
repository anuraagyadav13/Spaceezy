const { asyncHandler } = require('../utils/errors');
const passwordResetService = require('../services/passwordResetService');

// The single answer to POST /auth/forgot-password — same status, same body,
// for every outcome: account exists, account unknown, still in the 60s
// cooldown, user inactive, or SES unreachable. Any variation here is an
// account-enumeration oracle, so the handler deliberately cannot express one.
const FORGOT_PASSWORD_RESPONSE = Object.freeze({
    success: true,
    data: {},
    message: 'If an account exists for that email, a password reset code has been sent.',
});

const forgotPassword = asyncHandler(async (req, res) => {
    const email = String(req.body?.email || '').trim();

    try {
        await passwordResetService.requestReset(email);
    } catch (err) {
        // A delivery or configuration failure is swallowed ON PURPOSE.
        // Returning 5xx here would give a different answer for existing
        // accounts than for unknown ones — the exact leak we are preventing.
        // The service has already logged the attempt (masked recipient, AWS
        // error class, no code) and this line marks it for alerting; the
        // error CODE only — err objects can carry request payloads.
        console.error('[auth] password reset request failed:', err?.code || 'UNKNOWN');
    }

    res.status(200).json(FORGOT_PASSWORD_RESPONSE);
});

const verifyResetOtp = asyncHandler(async (req, res) => {
    const { email, otp } = req.body;

    // Failures throw a single generic 400 (INVALID_RESET_CODE) that does not
    // distinguish wrong / expired / locked / unknown-account.
    const { resetToken, expiresInSeconds } = await passwordResetService.verifyOtp(email, otp);

    res.status(200).json({
        success: true,
        data: { resetToken, expiresInSeconds },
        message: 'Verification code accepted.',
    });
});

const resetPassword = asyncHandler(async (req, res) => {
    const { email, resetToken, newPassword } = req.body;

    const { sessionsRevoked, confirmationEmailSent } = await passwordResetService.resetPassword({
        email,
        resetToken,
        newPassword,
    });

    // The password just changed, so every session for this user — including
    // one that may be sitting on this browser — was revoked. Drop the cookie
    // too rather than leave a token that now points at nothing.
    const cookieName = process.env.SESSION_COOKIE_NAME || 'spaceezy_session';
    res.clearCookie(cookieName, {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production' && process.env.COOKIE_SECURE !== 'false',
    });

    res.status(200).json({
        success: true,
        data: { sessionsRevoked, confirmationEmailSent },
        message: 'Password updated successfully.',
    });
});

module.exports = {
    forgotPassword,
    verifyResetOtp,
    resetPassword,
};
