const prisma = require('../db/prisma');

// Active (non-terminal) task statuses that should keep a lead from being purged.
const ACTIVE_TASK_STATUSES = ['PENDING', 'IN_PROGRESS', 'OPEN', 'TODO'];

class RetentionService {
    static async runPurge() {
        const now = new Date();

        // First, re-evaluate previously blocked leads: if their protected records
        // have since been removed, clear the block so they become eligible again.
        const blocked = await prisma.lead.findMany({
            where: {
                junkedAt: { not: null },
                restoredAt: null,
                purgeBlockedReason: { not: null },
                purgeAfter: { lt: now }
            },
            include: {
                _count: { select: { quotations: true, bookings: true, whatsappConversations: true, tasks: true } }
            }
        });

        for (const lead of blocked) {
            const protectedCount =
                (lead._count.quotations || 0) +
                (lead._count.bookings || 0) +
                (lead._count.whatsappConversations || 0);
            // Only active tasks keep blocking; completed/cancelled tasks do not.
            const activeTasks = await prisma.task.count({
                where: { leadId: lead.id, status: { in: ACTIVE_TASK_STATUSES } }
            });
            if (protectedCount === 0 && activeTasks === 0) {
                await prisma.lead.updateMany({
                    where: { id: lead.id, purgeBlockedReason: { not: null } },
                    data: { purgeBlockedReason: null }
                });
            }
        }

        const candidates = await prisma.lead.findMany({
            where: {
                junkedAt: { not: null },
                restoredAt: null,
                purgeAfter: { lt: now },
                purgeBlockedReason: null
            },
            include: {
                _count: { select: { quotations: true, bookings: true, whatsappConversations: true, tasks: true } }
            }
        });

        let purged = 0;
        let blockedCount = 0;
        let failed = 0;

        for (const lead of candidates) {
            const protectedCount =
                (lead._count.quotations || 0) +
                (lead._count.bookings || 0) +
                (lead._count.whatsappConversations || 0);
            const activeTasks = await prisma.task.count({
                where: { leadId: lead.id, status: { in: ACTIVE_TASK_STATUSES } }
            });

            if (protectedCount > 0 || activeTasks > 0) {
                // Conditional update so a concurrent run doesn't double-write.
                await prisma.lead.updateMany({
                    where: { id: lead.id, purgeBlockedReason: null },
                    data: { purgeBlockedReason: 'protected dependent records (quotations/bookings/whatsapp/active-tasks)' }
                });
                blockedCount += 1;
                continue;
            }

            try {
                await prisma.lead.delete({ where: { id: lead.id } });
                purged += 1;
            } catch (error) {
                // Only set the block if it wasn't already set (concurrent safety).
                await prisma.lead.updateMany({
                    where: { id: lead.id, purgeBlockedReason: null },
                    data: { purgeBlockedReason: `purge failed: ${String(error && error.message ? error.message : error).slice(0, 480)}` }
                });
                failed += 1;
            }
        }

        console.log(`[retention] purged=${purged} blocked=${blockedCount} failed=${failed} total=${candidates.length}`);
        return { purged, blocked: blockedCount, failed, total: candidates.length };
    }
}

module.exports = RetentionService;
