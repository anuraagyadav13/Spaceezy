const rateLimit = require('express-rate-limit');

// Meta-facing rate limits (Step 0 hardening).
//
// Limits are read from the environment on EVERY request rather than at
// require time (same convention as routes/auth.js), so they can be retuned
// without a restart and varied inside a single test file. Anything
// unparsable falls back to a safe default.

const limitFromEnv = (name, fallback) => {
    const parsed = parseInt(process.env[name], 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const tooMany = (message) => ({
    success: false,
    message,
    code: 'TOO_MANY_REQUESTS',
});

// Deterministic, retry-friendly 429: express-rate-limit's standardHeaders
// already set the RateLimit-* budget headers before the handler runs; this
// handler adds an explicit Retry-After so both dashboard clients and Meta
// itself (which retries leadgen deliveries on 429 after the interval) get a
// usable signal.
const retryFriendlyHandler = (req, res, next, options) => {
    const windowSeconds = Math.ceil((options.windowMs || 15 * 60 * 1000) / 1000);
    res.setHeader('Retry-After', String(windowSeconds));
    res.status(429).json(options.message);
};

const WINDOW_MS = 15 * 60 * 1000;

// Authenticated /meta-ads/* dashboard reads. One dashboard page load issues
// status + campaigns + insights + up to 7 trend requests, so the budget is
// deliberately generous (default 600 / 15 min per IP): it caps scripted
// scraping without ever shaping legitimate reviewer traffic. Keyed per IP;
// placed BEFORE requireAuth so unauthenticated floods also consume budget.
const metaReadLimiter = rateLimit({
    windowMs: WINDOW_MS,
    max: () => limitFromEnv('META_RATE_LIMIT_READ_MAX', 600),
    message: tooMany('Too many Meta requests. Please slow down and try again shortly.'),
    standardHeaders: true,
    legacyHeaders: false,
    handler: retryFriendlyHandler,
});

// Public Meta Lead Ads webhook POST. Meta delivers in bursts and treats a
// 429 as retryable (it redelivers with backoff), so this limit is high on
// purpose: it exists to stop a flood, never to discard legitimate deliveries.
// Signature verification still runs for every accepted request.
const metaWebhookLimiter = rateLimit({
    windowMs: WINDOW_MS,
    max: () => limitFromEnv('META_RATE_LIMIT_WEBHOOK_MAX', 600),
    message: tooMany('Meta webhook rate limit exceeded. Please retry after the Retry-After interval.'),
    standardHeaders: true,
    legacyHeaders: false,
    handler: retryFriendlyHandler,
});

// OAuth connect surface: the callback performs a server-side token exchange
// against Meta, so this route gets a tighter (still generous) budget than
// plain dashboard reads.
const metaConnectLimiter = rateLimit({
    windowMs: WINDOW_MS,
    max: () => limitFromEnv('META_RATE_LIMIT_CONNECT_MAX', 120),
    message: tooMany('Too many connection requests. Please wait a moment and try again.'),
    standardHeaders: true,
    legacyHeaders: false,
    handler: retryFriendlyHandler,
});

module.exports = { metaReadLimiter, metaWebhookLimiter, metaConnectLimiter, limitFromEnv };
