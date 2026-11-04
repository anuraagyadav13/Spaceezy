const express = require('express');
const rateLimit = require('express-rate-limit');
const { login, logout, getMe } = require('../controllers/auth');
const { forgotPassword, verifyResetOtp, resetPassword } = require('../controllers/passwordReset');
const { requireAuth } = require('../middleware/auth');
const validate = require('../middleware/validate');
const {
    loginSchema,
    forgotPasswordSchema,
    verifyResetOtpSchema,
    resetPasswordSchema
} = require('../validators/auth');

const router = express.Router();

const tooMany = (message) => ({
    success: false,
    message,
    code: 'TOO_MANY_REQUESTS'
});

// Limits read from the environment on every request rather than at require
// time, so they can be retuned without a restart (and varied inside a single
// test file). Anything unparsable falls back to a safe default.
const limitFromEnv = (name, fallback) => {
    const parsed = parseInt(process.env[name], 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const WINDOW_MS = 15 * 60 * 1000;

// Brute-force protection. Failed and successful attempts share one per-IP
// budget so credential stuffing gets through at most a handful of guesses
// per window. TRUST_PROXY (set in production) keeps req.ip correct behind
// the nginx/CDN chain.
const loginLimiter = rateLimit({
    windowMs: WINDOW_MS,
    max: 15,
    message: tooMany('Too many login attempts. Please try again later.'),
    standardHeaders: true,
    legacyHeaders: false,
});

// --- Password-reset rate limiting -----------------------------------------
// Two independent budgets, because they defend against different attacks:
//   * per-IP   — one host spraying many accounts (or guessing codes).
//   * per-account — one account being hammered from many hosts, or an
//     attacker who owns one inbox spamming the resend.
// The account bucket counts requests for an address whether or not it
// exists, so a 429 is not evidence that the account is real.

const ipLimiter = (maxEnv, fallback, message) => rateLimit({
    windowMs: WINDOW_MS,
    max: () => limitFromEnv(maxEnv, fallback),
    message: tooMany(message),
    standardHeaders: true,
    legacyHeaders: false,
});

const forgotIpLimiter = ipLimiter('RESET_RATE_LIMIT_IP_MAX', 10,
    'Too many reset requests. Please try again later.');
const verifyIpLimiter = ipLimiter('RESET_RATE_LIMIT_VERIFY_IP_MAX', 20,
    'Too many verification attempts. Please try again later.');
const resetIpLimiter = ipLimiter('RESET_RATE_LIMIT_RESET_IP_MAX', 10,
    'Too many reset requests. Please try again later.');

const accountLimiter = rateLimit({
    windowMs: WINDOW_MS,
    max: () => limitFromEnv('RESET_RATE_LIMIT_ACCOUNT_MAX', 5),
    // Keyed on the submitted address (falling back to the IP when there is
    // none, so malformed requests cannot pool into one shared bucket).
    keyGenerator: (req) => {
        const email = String(req.body?.email || '').trim().toLowerCase();
        return email ? `reset-account:${email}` : `reset-ip:${req.ip}`;
    },
    message: tooMany('Too many reset requests. Please try again later.'),
    standardHeaders: true,
    legacyHeaders: false,
    // The key is an email, not an IP — express-rate-limit's IPv6/key checks
    // would otherwise warn on every request.
    validate: false,
});

router.post('/login', loginLimiter, validate(loginSchema), login);
router.post('/logout', requireAuth(), logout);
router.get('/me', requireAuth(), getMe);

// Password reset. Order matters: rate limit BEFORE validation, so junk
// payloads still consume budget; validation before the handler, so the
// service only ever sees well-formed input.
router.post('/forgot-password', forgotIpLimiter, accountLimiter, validate(forgotPasswordSchema), forgotPassword);
router.post('/verify-reset-otp', verifyIpLimiter, validate(verifyResetOtpSchema), verifyResetOtp);
router.post('/reset-password', resetIpLimiter, validate(resetPasswordSchema), resetPassword);

module.exports = router;
