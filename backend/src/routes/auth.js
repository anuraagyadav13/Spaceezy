const express = require('express');
const rateLimit = require('express-rate-limit');
const { login, logout, getMe } = require('../controllers/auth');
const { requireAuth } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { loginSchema } = require('../validators/auth');

const router = express.Router();

// Brute-force protection. Failed and successful attempts share one per-IP
// budget so credential stuffing gets through at most a handful of guesses
// per window. TRUST_PROXY (set in production) keeps req.ip correct behind
// the nginx/CDN chain.
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 15,
    message: { success: false, message: 'Too many login attempts. Please try again later.', code: 'TOO_MANY_REQUESTS' },
    standardHeaders: true,
    legacyHeaders: false,
});

router.post('/login', loginLimiter, validate(loginSchema), login);
router.post('/logout', requireAuth(), logout);
router.get('/me', requireAuth(), getMe);

module.exports = router;
