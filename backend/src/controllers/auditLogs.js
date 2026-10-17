const prisma = require('../db/prisma');
const { asyncHandler } = require('../utils/errors');

// Read-only audit trail listing (admin). Metadata is already sanitized at
// write time (utils/audit.js never logs secrets or message bodies).
const getAuditLogs = asyncHandler(async (req, res) => {
    const { organizationId } = req.auth;
    const { action, entityType, entityId, from, to, page = '1', limit = '50' } = req.query;

    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const limitNum = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);

    const where = { organizationId };
    if (action) where.action = { contains: action, mode: 'insensitive' };
    if (entityType) where.entityType = { contains: entityType, mode: 'insensitive' };
    if (entityId) where.entityId = entityId;
    if (from || to) {
        where.createdAt = {
            ...(from ? { gte: new Date(from) } : {}),
            ...(to ? { lte: new Date(to) } : {})
        };
    }

    const [total, rows] = await Promise.all([
        prisma.auditLog.count({ where }),
        prisma.auditLog.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            skip: (pageNum - 1) * limitNum,
            take: limitNum
        })
    ]);

    // AuditLog has no actor relation (actorId is a bare column), so resolve
    // display names in a second query — no schema change needed.
    const actorIds = [...new Set(rows.map((r) => r.actorId).filter(Boolean))];
    let actors = [];
    if (actorIds.length > 0) {
        actors = await prisma.user.findMany({
            where: { id: { in: actorIds } },
            select: { id: true, name: true, email: true }
        });
    }
    const actorById = new Map(actors.map((a) => [a.id, a]));
    const items = rows.map((row) => ({
        ...row,
        actor: row.actorId ? (actorById.get(row.actorId) || null) : null
    }));

    res.status(200).json({
        success: true,
        data: {
            items,
            total,
            page: pageNum,
            limit: limitNum,
            totalPages: Math.ceil(total / limitNum)
        },
        message: 'Audit logs fetched successfully'
    });
});

module.exports = { getAuditLogs };
