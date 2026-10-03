const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const dotenv = require('dotenv');
const { AppError, errorHandler, notFoundHandler } = require('./utils/errors');

dotenv.config();

const app = express();

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
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
}));

app.use(tolerantJsonParser);
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Health check endpoint
app.get('/api/v1/health', (req, res) => {
    // Until PostgreSQL is configured, do not falsely report connected
    const dbStatus = process.env.DATABASE_URL ? 'configured' : 'not_configured';
    
    res.json({
        success: true,
        data: {
            status: 'ok',
            database: dbStatus
        }
    });
});

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

// Error handling
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
