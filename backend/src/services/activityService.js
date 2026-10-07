const prisma = require('../db/prisma');
const { AppError } = require('../utils/errors');

const isExecRole = (role) => role === 'SALES_EXECUTIVE' || role === 'CHANNEL_PARTNER';

const ACTIVE_LEAD_STATUSES = ['NEW', 'CONTACTED', 'INTERESTED', 'QUALIFIED', 'SITE_VISIT', 'NEGOTIATION', 'FOLLOW_UP', 'QUOTATION'];

const dayRange = () => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    return { start, end };
};

class ActivityService {
    /**
     * Backend-driven agenda: today / upcoming / overdue / completed views
     * with employee, type, status, lead, project and date-range filters.
     */
    static async getAgenda(organizationId, query, role, userId) {
        const { view, type, assignedToId, leadId, projectId, status, from, to, page = 1, limit = 50 } = query;

        const base = { organizationId };
        if (isExecRole(role)) {
            base.assignedToId = userId;
        } else if (assignedToId) {
            base.assignedToId = assignedToId;
        }
        if (type) base.type = type;
        if (leadId) base.leadId = leadId;
        if (projectId) base.lead = { ...(base.lead || {}), projectId };

        const { start: todayStart, end: todayEnd } = dayRange();
        const now = new Date();

        const countsWhere = { ...base, status: 'PENDING' };
        const [overdueCount, todayCount, upcomingCount, completedCount] = await Promise.all([
            prisma.task.count({ where: { ...countsWhere, dueDate: { lt: todayStart } } }),
            prisma.task.count({ where: { ...countsWhere, dueDate: { gte: todayStart, lt: todayEnd } } }),
            prisma.task.count({ where: { ...countsWhere, dueDate: { gte: todayEnd } } }),
            prisma.task.count({ where: { ...base, status: 'COMPLETED' } })
        ]);

        const where = { ...base };
        if (view === 'overdue') {
            where.status = status || 'PENDING';
            where.dueDate = { lt: todayStart };
        } else if (view === 'today') {
            where.status = status || 'PENDING';
            where.dueDate = { gte: todayStart, lt: todayEnd };
        } else if (view === 'upcoming') {
            where.status = status || 'PENDING';
            where.dueDate = { gte: todayEnd };
        } else if (view === 'completed') {
            where.status = status || 'COMPLETED';
        } else if (status) {
            where.status = status;
        }
        if (from || to) {
            where.dueDate = { ...(where.dueDate || {}) };
            if (from) where.dueDate.gte = new Date(from);
            if (to) where.dueDate.lte = new Date(to);
        }

        const [tasks, total] = await Promise.all([
            prisma.task.findMany({
                where,
                skip: (parseInt(page) - 1) * parseInt(limit),
                take: parseInt(limit),
                orderBy: { dueDate: 'asc' },
                include: {
                    lead: { select: { id: true, name: true, status: true, projectId: true, assignedToId: true, project: { select: { id: true, name: true } } } },
                    assignedTo: { select: { id: true, name: true } }
                }
            }),
            prisma.task.count({ where })
        ]);

        const items = tasks.map((t) => {
            const due = new Date(t.dueDate).getTime();
            let bucket = 'UPCOMING';
            if (t.status === 'COMPLETED') bucket = 'COMPLETED';
            else if (t.status === 'CANCELLED') bucket = 'CANCELLED';
            else if (due < todayStart.getTime()) bucket = 'OVERDUE';
            else if (due < todayEnd.getTime()) bucket = 'TODAY';
            // DUE_NOW: pending and already past its scheduled time today
            const isDueNow = t.status === 'PENDING' && due <= now.getTime() && due >= todayStart.getTime();
            return {
                ...t,
                dueDate: t.dueDate.toISOString(),
                bucket,
                isDueNow,
                overdueByMinutes: bucket === 'OVERDUE' ? Math.round((todayStart.getTime() - due) / 60000) : null
            };
        });

        return {
            items,
            total,
            pages: Math.ceil(total / parseInt(limit)),
            counts: {
                overdue: overdueCount,
                today: todayCount,
                upcoming: upcomingCount,
                completed: completedCount,
                dueNow: await prisma.task.count({ where: { ...countsWhere, dueDate: { lte: now } } })
            }
        };
    }

    /**
     * Real productivity aggregates (no fake analytics).
     */
    static async getProductivity(organizationId, query, role, userId) {
        const { employeeId, from, to } = query;
        const now = new Date();
        const fromDate = from ? new Date(from) : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        const toDate = to ? new Date(to) : now;

        let scopeUserId = null;
        if (isExecRole(role)) {
            scopeUserId = userId;
        } else if (employeeId) {
            scopeUserId = employeeId;
        }

        const stats = await ActivityService._statsFor(organizationId, scopeUserId, fromDate, toDate);
        stats.range = { from: fromDate.toISOString(), to: toDate.toISOString() };
        stats.needsAttention = (await ActivityService.getNeedsAttention(organizationId, role, userId, { employeeId: scopeUserId })).length;

        if (scopeUserId) {
            stats.employeeId = scopeUserId;
            return stats;
        }

        // Owner/manager view: per-employee breakdown.
        const employees = await prisma.user.findMany({
            where: { organizationId, status: 'ACTIVE' },
            select: { id: true, name: true, role: true }
        });
        const perUser = {};
        await Promise.all(employees.map(async (emp) => {
            perUser[emp.id] = await ActivityService._statsFor(organizationId, emp.id, fromDate, toDate);
        }));

        return {
            ...stats,
            employees: employees.map((e) => ({ id: e.id, name: e.name, role: e.role, ...perUser[e.id] }))
        };
    }

    static async _statsFor(organizationId, targetUserId, fromDate, toDate) {
        const callScope = targetUserId ? { userId: targetUserId } : {};
        const taskScope = targetUserId ? { assignedToId: targetUserId } : {};

        const [
            callsTotal,
            callsConnected,
            callsMissed,
            durationAgg,
            whatsappSent,
            followupsCompleted,
            overdueFollowups,
            tasksCompleted,
            siteVisits,
            quotations,
            bookings
        ] = await Promise.all([
            prisma.call.count({ where: { organizationId, ...callScope, createdAt: { gte: fromDate, lte: toDate } } }),
            prisma.call.count({ where: { organizationId, ...callScope, status: 'COMPLETED', createdAt: { gte: fromDate, lte: toDate } } }),
            prisma.call.count({ where: { organizationId, ...callScope, status: 'MISSED', createdAt: { gte: fromDate, lte: toDate } } }),
            prisma.call.aggregate({ where: { organizationId, ...callScope, duration: { not: null }, createdAt: { gte: fromDate, lte: toDate } }, _sum: { duration: true } }),
            prisma.whatsAppMessage.count({ where: { organizationId, direction: 'OUTBOUND', ...(targetUserId ? { sentById: targetUserId } : {}), createdAt: { gte: fromDate, lte: toDate } } }),
            prisma.task.count({ where: { organizationId, ...taskScope, type: 'FOLLOW_UP', status: 'COMPLETED', completedAt: { gte: fromDate, lte: toDate } } }),
            prisma.task.count({ where: { organizationId, ...taskScope, type: 'FOLLOW_UP', status: 'PENDING', dueDate: { lt: new Date() } } }),
            prisma.task.count({ where: { organizationId, ...taskScope, status: 'COMPLETED', completedAt: { gte: fromDate, lte: toDate } } }),
            prisma.siteVisit.count({ where: { organizationId, ...(targetUserId ? { assignedToId: targetUserId } : {}), createdAt: { gte: fromDate, lte: toDate } } }),
            prisma.quotation.count({ where: { organizationId, ...(targetUserId ? { createdById: targetUserId } : {}), createdAt: { gte: fromDate, lte: toDate } } }),
            prisma.booking.count({ where: { organizationId, ...(targetUserId ? { assignedToId: targetUserId } : {}), createdAt: { gte: fromDate, lte: toDate } } })
        ]);

        return {
            calls: callsTotal,
            connectedCalls: callsConnected,
            missedCalls: callsMissed,
            callDurationSeconds: durationAgg._sum.duration || 0,
            whatsappMessages: whatsappSent,
            followupsCompleted,
            overdueFollowups,
            tasksCompleted,
            siteVisits,
            quotations,
            bookings
        };
    }

    /**
     * "Needs attention": active leads with no future follow-up, no pending
     * task and no upcoming site visit. Nobody should go silent by accident.
     */
    static async getNeedsAttention(organizationId, role, userId, options = {}) {
        const where = { organizationId, status: { in: ACTIVE_LEAD_STATUSES } };
        if (isExecRole(role)) where.assignedToId = userId;
        else if (options.employeeId) where.assignedToId = options.employeeId;
        if (options.leadId) where.id = options.leadId;

        const leads = await prisma.lead.findMany({
            where,
            take: 500,
            orderBy: { updatedAt: 'asc' },
            select: {
                id: true,
                name: true,
                status: true,
                updatedAt: true,
                assignedToId: true,
                project: { select: { id: true, name: true } },
                assignedTo: { select: { id: true, name: true } }
            }
        });
        if (leads.length === 0) return [];

        const leadIds = leads.map((l) => l.id);
        const now = new Date();

        const [futureFollowups, pendingTasks, upcomingVisits] = await Promise.all([
            prisma.task.groupBy({
                by: ['leadId'],
                where: { leadId: { in: leadIds }, type: 'FOLLOW_UP', status: 'PENDING', dueDate: { gte: now } }
            }),
            prisma.task.groupBy({
                by: ['leadId'],
                where: { leadId: { in: leadIds }, status: 'PENDING' }
            }),
            prisma.siteVisit.groupBy({
                by: ['leadId'],
                where: { leadId: { in: leadIds }, date: { gte: new Date(now.getFullYear(), now.getMonth(), now.getDate()) }, status: { in: ['SCHEDULED'] } }
            })
        ]);

        const futureSet = new Set(futureFollowups.map((r) => r.leadId));
        const pendingSet = new Set(pendingTasks.map((r) => r.leadId));
        const visitSet = new Set(upcomingVisits.map((r) => r.leadId));

        return leads
            .filter((l) => !futureSet.has(l.id) && !pendingSet.has(l.id) && !visitSet.has(l.id))
            .map((l) => ({
                ...l,
                reasons: ['No future follow-up', 'No pending task', 'No upcoming site visit']
            }));
    }
}

module.exports = ActivityService;
