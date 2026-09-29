const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const dotenv = require('dotenv');
const { errorHandler, notFoundHandler } = require('./utils/errors');

dotenv.config();

const app = express();

app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
}));

app.use(express.json());
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
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/leads', leadRoutes);
app.use('/api/v1/public', publicRoutes);

// Error handling
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
