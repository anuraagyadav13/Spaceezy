const { AppError } = require('./errors');

const RESTRICTED_ROLES = ['SALES_EXECUTIVE', 'CHANNEL_PARTNER'];

const isExecRole = (role) => RESTRICTED_ROLES.includes(role);

const assertOwnership = (entity, role, userId, field = 'assignedToId', message = 'You do not have permission to modify this resource') => {
    if (isExecRole(role) && entity[field] !== userId) {
        throw new AppError(message, 403, 'FORBIDDEN');
    }
};

const scopeByRole = (where, role, userId, filters = {}) => {
    if (isExecRole(role)) {
        where.assignedToId = userId;
    } else if (filters.assignedTo) {
        where.assignedToId = filters.assignedTo;
    }
    return where;
};

module.exports = {
    RESTRICTED_ROLES,
    isExecRole,
    assertOwnership,
    scopeByRole,
};
