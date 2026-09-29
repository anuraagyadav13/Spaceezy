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
    err.statusCode = err.statusCode || 500;
    err.code = err.code || 'INTERNAL_ERROR';
    err.message = err.message || 'Something went wrong';

    if (process.env.NODE_ENV === 'development') {
        res.status(err.statusCode).json({
            success: false,
            message: err.message,
            code: err.code,
            error: err,
            stack: err.stack,
        });
    } else {
        // Production mode, don't leak error details
        if (err.isOperational) {
            res.status(err.statusCode).json({
                success: false,
                message: err.message,
                code: err.code,
            });
        } else {
            console.error('ERROR 💥', err);
            res.status(500).json({
                success: false,
                message: 'Something went wrong',
                code: 'INTERNAL_ERROR',
            });
        }
    }
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
