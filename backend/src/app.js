const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const dotenv = require('dotenv');
const { AppError, errorHandler, notFoundHandler } = require('./utils/errors');

dotenv.config();

const app = express();

// Production hardening -------------------------------------------------------
// Never advertise the framework.
app.disable('x-powered-by');

// Behind Nginx, trust exactly one proxy hop so req.ip (rate limiting) and
// req.protocol reflect the real client, not Nginx's loopback address.
// Override with TRUST_PROXY=<hop count|subnet|'false'> only if topology changes.
const trustProxy = process.env.TRUST_PROXY;
app.set('trust proxy', trustProxy === undefined || trustProxy === '' || trustProxy === 'true'
    ? 'loopback'
    : (trustProxy === 'false' ? false : trustProxy));

// Explicit CORS allow-list (comma-separated). Never '*' for credentialed APIs.
const corsOrigins = (process.env.CORS_ORIGINS || process.env.FRONTEND_URL || 'http://localhost:3000')
    .split(',')
    .map((o) => o.trim().replace(/\/+$/, ''))
    .filter(Boolean);

const normalizeLegacyJsonBody = (rawBody) => {
    if (!rawBody || !rawBody.trim()) return {};

    const trimmed = rawBody.trim();

    try {
        const parsed = JSON.parse(trimmed);
        if (parsed !== null) {
            return parsed;
        }
    } catch {
        // Fall through to legacy parsing.
    }

    const normalized = trimmed
        .replace(/\\:/g, ':')
        .replace(/\\,/g, ',')
        .replace(/\\"/g, '"')
        .replace(/\\'/g, "'");

    const emailMatch = normalized.match(/(?:^|[\s,{])\s*email\s*:\s*["']?([^"',}\s]+)["']?/i);
    const passwordMatch = normalized.match(/(?:^|[\s,{])\s*password\s*:\s*["']?([^"',}\s]+)["']?/i);

    if (!emailMatch || !passwordMatch) {
        return null;
    }

    return {
        email: emailMatch[1].trim(),
        password: passwordMatch[1].trim(),
    };
};

const tolerantJsonParser = (req, res, next) => {
    if (!req.is('application/json')) {
        return next();
    }

    const chunks = [];

    req.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    req.on('end', () => {
        const rawBody = Buffer.concat(chunks).toString('utf8');

        // Keep the exact raw bytes for webhook signature verification.
        req.rawBody = rawBody;

        if (!rawBody.trim()) {
            req.body = {};
            return next();
        }

        const parsedBody = normalizeLegacyJsonBody(rawBody);

        if (parsedBody === null || (typeof parsedBody !== 'object' && !Array.isArray(parsedBody))) {
            return next(new AppError('Invalid JSON payload.', 400, 'VALIDATION_ERROR'));
        }

        req.body = parsedBody;
        next();
    });
    req.on('error', next);
};

app.use(cors({
    origin(origin, callback) {
        // Non-browser callers (server-to-server, curl, health checks) send no Origin.
        if (!origin) return callback(null, true);
        const normalized = origin.replace(/\/+$/, '');
        callback(null, corsOrigins.includes(normalized));
    },
    credentials: true,
}));

app.use(tolerantJsonParser);
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(cookieParser());

// Health check (safe: status booleans only, never connection strings/secrets).
// /health is an alias for infrastructure probes (Docker, uptime monitors).
const healthHandler = async (req, res) => {
    let database = 'not_configured';
    if (process.env.DATABASE_URL) {
        database = 'down';
        try {
            const prisma = require('./db/prisma');
            await Promise.race([
                prisma.$queryRaw`SELECT 1`,
                new Promise((_, reject) => setTimeout(() => reject(new Error('health timeout')), 2500)),
            ]);
            database = 'up';
        } catch {
            database = 'down';
        }
    }

    res.json({
        success: true,
        data: {
            status: 'ok',
            database,
        },
    });
};

app.get('/api/v1/health', healthHandler);
app.get('/health', healthHandler);

// Setup routes
const authRoutes = require('./routes/auth');
const leadRoutes = require('./routes/leads');
const publicRoutes = require('./routes/public');
const userRoutes = require('./routes/users');
const projectRoutes = require('./routes/projects');
const propertyRoutes = require('./routes/properties');
const siteVisitRoutes = require('./routes/siteVisits');
const customerRoutes = require('./routes/customers');
const taskRoutes = require('./routes/tasks');
const bookingRoutes = require('./routes/bookings');
const quotationRoutes = require('./routes/quotations');
const callRoutes = require('./routes/calls');
const whatsappRoutes = require('./routes/whatsapp');
const activityRoutes = require('./routes/activities');
const locationRoutes = require('./routes/locations');
const uploadRoutes = require('./routes/uploads');
const mediaRoutes = require('./routes/media');
const webhookRoutes = require('./controllers/webhooks');

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/leads', leadRoutes);
app.use('/api/v1/public', publicRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/projects', projectRoutes);
app.use('/api/v1/properties', propertyRoutes);
app.use('/api/v1/site-visits', siteVisitRoutes);
app.use('/api/v1/customers', customerRoutes);
app.use('/api/v1/tasks', taskRoutes);
app.use('/api/v1/bookings', bookingRoutes);
app.use('/api/v1/quotations', quotationRoutes);
app.use('/api/v1/calls', callRoutes);
app.use('/api/v1/whatsapp', whatsappRoutes);
app.use('/api/v1/activities', activityRoutes);
app.use('/api/v1/locations', locationRoutes);
app.use('/api/v1/uploads', uploadRoutes);
// Public image delivery from the private media bucket (no auth, images only).
app.use('/media', mediaRoutes);

// Provider webhooks (authenticated by HMAC signature, not by session)
app.get('/api/v1/webhooks/whatsapp', webhookRoutes.whatsappWebhookVerify);
app.post('/api/v1/webhooks/telephony/:provider', webhookRoutes.telephonyWebhook);
app.post('/api/v1/webhooks/whatsapp/:provider', webhookRoutes.whatsappWebhook);

// Error handling
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
