const { z } = require('zod');

const listAuditLogsSchema = {
    query: z.object({
        action: z.string().max(100).optional(),
        entityType: z.string().max(100).optional(),
        entityId: z.string().uuid().optional(),
        from: z.string().optional(),
        to: z.string().optional(),
        page: z.string().regex(/^\d+$/).optional(),
        limit: z.string().regex(/^\d+$/).optional()
    })
};

module.exports = { listAuditLogsSchema };
