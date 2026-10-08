class AppError extends Error {
    constructor(message, statusCode, code = 'ERROR') {
        super(message);
        this.statusCode = statusCode;
        this.code = code;
        this.isOperational = true;

        Error.captureStackTrace(this, this.constructor);
    }
}

const asyncHandler = (fn) => {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
};

const errorHandler = (err, req, res, next) => {
    // Always log the full error for debugging
    console.error('ERROR 💥:', err.message);
    if (err.stack) console.error(err.stack);

    // Handle Prisma-specific errors (operational AppErrors may also have
    // codes starting with "P", e.g. PAYMENT_COMPLETED, and must not be
    // mistaken for Prisma error codes like P2002)
    if (err.code && err.code.startsWith('P') && !err.isOperational) {
        let message = err.message;
        let statusCode = 400;

        switch (err.code) {
            case 'P2002':
                message = `Duplicate value: ${err.meta?.target?.join(', ') || 'unique constraint'}`;
                statusCode = 409;
                break;
            case 'P2003':
                message = `Invalid reference: foreign key constraint failed on ${err.meta?.field_name || 'field'}`;
                break;
            case 'P2025':
                message = 'Record not found';
                statusCode = 404;
                break;
            default:
                message = `Database error [${err.code}]: ${err.meta?.message || err.message}`;
        }

        return res.status(statusCode).json({
            success: false,
            message,
            code: err.code,
        });
    }

    // Handle AppError (operational errors)
    if (err.isOperational) {
        return res.status(err.statusCode || 400).json({
            success: false,
            message: err.message,
            code: err.code,
        });
    }

    // Unhandled errors — never leak internals (stack traces, connection
    // strings, provider payloads) to clients in production.
    const statusCode = err.statusCode || 500;
    const isProd = process.env.NODE_ENV === 'production';
    res.status(statusCode).json({
        success: false,
        message: isProd ? 'Something went wrong' : (err.message || 'Something went wrong'),
        code: err.code || 'INTERNAL_ERROR',
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
    });
};

const notFoundHandler = (req, res, next) => {
    next(new AppError(`Can't find ${req.originalUrl} on this server!`, 404, 'NOT_FOUND'));
};

module.exports = {
    AppError,
    asyncHandler,
    errorHandler,
    notFoundHandler,
};
