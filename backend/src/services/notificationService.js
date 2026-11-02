const prisma = require('../db/prisma');
const { AppError } = require('../utils/errors');

// In-app notifications (recipient-scoped). Design notes:
// - Every write is fire-and-forget at the call site so a notification failure
//   can never break the business operation that triggered it (e.g. assigning
//   a lead must still succeed if notification insert fails).
// - A user deleting their account cascades their notifications away; a lead
//   being deleted does NOT (leadId is a plain string, no FK) so history
//   survives inventory cleanup.
class NotificationService {
    static TYPE = {
        LEAD_ASSIGNED: 'LEAD_ASSIGNED',
    };

    // Create one notification for a single user. Returns the row (or null if
    // nothing to create).
    static async notifyUser(organizationId, userId, { type, title, body = null, leadId = null, link = null }) {
        if (!userId || !type || !title) return null;

        return prisma.notification.create({
            data: {
                organizationId,
                userId,
                type,
                title,
                body,
                leadId,
                link,
            },
        });
    }

    // Notify the assignee that a lead was assigned to them. Never throws —
    // callers use this inline without wrapping in try/catch.
    static async notifyLeadAssigned(organizationId, lead, assigneeId, { performedById = null, previousAssignedToId = null } = {}) {
        try {
            if (!assigneeId) return null;
            // Self-assignment / self-claim is not something to alert about.
            if (performedById && performedById === assigneeId) return null;
            // Re-assigning to the same person is a no-op.
            if (previousAssignedToId && previousAssignedToId === assigneeId) return null;

            const assignee = await prisma.user.findFirst({
                where: { id: assigneeId, organizationId },
                select: { name: true },
            });
            if (!assignee) return null;

            const leadName = lead?.name || 'a lead';
            const projectName = lead?.project?.name || null;

            return await NotificationService.notifyUser(organizationId, assigneeId, {
                type: NotificationService.TYPE.LEAD_ASSIGNED,
                title: 'New lead assigned to you',
                body: projectName ? `${leadName} — ${projectName}` : `${leadName}`,
                leadId: lead?.id || null,
                link: lead?.id ? `/dashboard/leads/${lead.id}` : '/dashboard/leads',
            });
        } catch (err) {
            // Fire-and-forget: never let notification issues break assignment.
            console.error('notifyLeadAssigned failed:', err?.message || err);
            return null;
        }
    }

    static async getNotifications(organizationId, userId, { unreadOnly = false, page = 1, limit = 20 } = {}) {
        const where = { organizationId, userId };
        if (unreadOnly) where.read = false;

        const skip = (Math.max(1, Number(page)) - 1) * Number(limit);
        const take = Number(limit);

        const [total, unreadCount, items] = await Promise.all([
            prisma.notification.count({ where: { organizationId, userId } }),
            prisma.notification.count({ where: { organizationId, userId, read: false } }),
            prisma.notification.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip,
                take,
            }),
        ]);

        return {
            notifications: items,
            total,
            unreadCount,
            page: Number(page),
            limit: take,
        };
    }

    static async markRead(id, organizationId, userId) {
        const existing = await prisma.notification.findFirst({
            where: { id, organizationId, userId },
            select: { id: true },
        });
        if (!existing) throw new AppError('Notification not found', 404, 'NOT_FOUND');

        return prisma.notification.update({
            where: { id },
            data: { read: true },
        });
    }

    static async markAllRead(organizationId, userId) {
        const result = await prisma.notification.updateMany({
            where: { organizationId, userId, read: false },
            data: { read: true },
        });
        return { updated: result.count };
    }
}

module.exports = NotificationService;
