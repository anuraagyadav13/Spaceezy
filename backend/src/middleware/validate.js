const { AppError } = require('../utils/errors');

const validate = (schema) => (req, res, next) => {
    try {
        if (schema.body) {
            req.body = schema.body.parse(req.body);
        }
        if (schema.query) {
            req.query = schema.query.parse(req.query);
        }
        if (schema.params) {
            req.params = schema.params.parse(req.params);
        }
        next();
    } catch (error) {
        if (error.name === 'ZodError') {
            const issues = Array.isArray(error.issues)
                ? error.issues
                : (Array.isArray(error.errors) ? error.errors : []);
            const formattedErrors = issues.map(err => ({
                field: err.path.join('.'),
                message: err.message
            }));
            return res.status(400).json({
                success: false,
                message: 'Validation failed',
                code: 'VALIDATION_ERROR',
                errors: formattedErrors
            });
        }
        next(error);
    }
};

module.exports = validate;
