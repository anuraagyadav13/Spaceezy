const prisma = require('../db/prisma');
const { AppError } = require('../utils/errors');

const isExecRole = (role) => role === 'SALES_EXECUTIVE' || role === 'CHANNEL_PARTNER';

// Unified, chronological Lead Timeline. Aggregates domain entities and
// activities into one list; every event links to its underlying record.
class TimelineService {
    static async getLeadTimeline(leadId, organizationId, query, role, userId) {
        const { limit = 100 } = query;

        const lead = await prisma.lead.findFirst({ where: { id: leadId, organizationId } });
        if (!lead) throw new AppError('Lead not found', 404, 'NOT_FOUND');
        if (isExecRole(role) && lead.assignedToId !== userId) {
            throw new AppError('You do not have access to this lead', 403, 'FORBIDDEN');
        }

        const take = Math.min(parseInt(limit) || 100, 300);

        const [activities, calls, tasks, siteVisits, quotations, bookings, messages] = await Promise.all([
            prisma.leadActivity.findMany({
                where: { leadId, organizationId },
                orderBy: { createdAt: 'desc' },
                take: take * 2,
                include: { performedBy: { select: { id: true, name: true } } }
            }),
            prisma.call.findMany({
                where: { leadId, organizationId },
                orderBy: { createdAt: 'desc' },
                take,
                include: { user: { select: { id: true, name: true } } }
            }),
            prisma.task.findMany({
                where: { leadId, organizationId },
                orderBy: { createdAt: 'desc' },
                take: take,
                include: { assignedTo: { select: { id: true, name: true } } }
            }),
            prisma.siteVisit.findMany({
                where: { leadId, organizationId },
                orderBy: { createdAt: 'desc' },
                take,
                include: { assignedTo: { select: { id: true, name: true } }, project: { select: { id: true, name: true } } }
            }),
            prisma.quotation.findMany({
                where: { leadId, organizationId },
                orderBy: { createdAt: 'desc' },
                take,
                include: { createdBy: { select: { id: true, name: true } }, project: { select: { id: true, name: true } } }
            }),
            prisma.booking.findMany({
                where: { leadId, organizationId },
                orderBy: { createdAt: 'desc' },
                take,
                include: { assignedTo: { select: { id: true, name: true } }, property: { select: { id: true, title: true, unitNumber: true } } }
            }),
            prisma.whatsAppMessage.findMany({
                where: { leadId, organizationId },
                orderBy: { createdAt: 'desc' },
                take: take,
                include: { sentBy: { select: { id: true, name: true } } }
            })
        ]);

        const taskIds = new Set(tasks.map((t) => t.id));
        const quotationIds = new Set(quotations.map((q) => q.id));
        const messageIds = new Set(messages.map((m) => m.id));

        const items = [];

        for (const a of activities) {
            // Deduplicate: activities that merely mirror a task/quotation/message
            // entity are represented by the entity entry itself.
            const md = a.metadata || {};
            if (md.taskId && taskIds.has(md.taskId)) continue;
            if (md.quotationId && quotationIds.has(md.quotationId)) continue;
            if (md.messageId && messageIds.has(md.messageId)) continue;

            items.push({
                kind: a.type,
                id: a.id,
                title: activityTitle(a),
                description: a.description,
                at: a.createdAt,
                actor: a.performedBy || null,
                link: null,
                meta: md
            });
        }

        for (const c of calls) {
            items.push({
                kind: 'CALL',
                id: c.id,
                title: `${c.direction === 'OUTBOUND' ? 'Outbound' : 'Inbound'} call${c.disposition ? ` — ${c.disposition.replace(/_/g, ' ')}` : ''}`,
                description: c.notes || `Call ${c.status.toLowerCase()}${c.duration ? ` • ${c.duration}s` : ''}`,
                at: c.endedAt || c.createdAt,
                actor: c.user || null,
                link: { type: 'call', id: c.id },
                meta: {
                    callId: c.id,
                    status: c.status,
                    disposition: c.disposition,
                    duration: c.duration,
                    direction: c.direction
                }
            });
        }

        for (const t of tasks) {
            items.push({
                kind: t.type === 'FOLLOW_UP' ? 'FOLLOW_UP' : 'TASK',
                id: t.id,
                title: t.title,
                description: t.description || null,
                at: t.completedAt || t.rescheduledAt || t.createdAt,
                actor: t.assignedTo || null,
                link: { type: 'task', id: t.id },
                meta: {
                    taskId: t.id,
                    taskType: t.type,
                    status: t.status,
                    dueDate: t.dueDate.toISOString(),
                    sourceCallId: t.sourceCallId
                }
            });
        }

        for (const s of siteVisits) {
            items.push({
                kind: 'SITE_VISIT',
                id: s.id,
                title: `Site visit ${s.status.toLowerCase()}${s.project ? ` — ${s.project.name}` : ''}`,
                description: [s.date, s.time].filter(Boolean).join(' '),
                at: s.updatedAt || s.createdAt,
                actor: s.assignedTo || null,
                link: { type: 'site-visit', id: s.id },
                meta: { visitId: s.id, status: s.status }
            });
        }

        for (const q of quotations) {
            items.push({
                kind: 'QUOTATION',
                id: q.id,
                title: `Quotation ${q.status.toLowerCase()}${q.project ? ` — ${q.project.name}` : ''}`,
                description: `Amount: ${q.totalAmount}`,
                at: q.updatedAt || q.createdAt,
                actor: q.createdBy || null,
                link: { type: 'quotation', id: q.id },
                meta: { quotationId: q.id, status: q.status, totalAmount: String(q.totalAmount) }
            });
        }

        for (const b of bookings) {
            items.push({
                kind: 'BOOKING',
                id: b.id,
                title: `Booking confirmed${b.property ? ` — ${b.property.title}` : ''}`,
                description: `Amount: ${b.amount} • Payment: ${b.paymentStatus}`,
                at: b.createdAt,
                actor: b.assignedTo || null,
                link: { type: 'booking', id: b.id },
                meta: { bookingId: b.id, paymentStatus: b.paymentStatus }
            });
        }

        for (const m of messages) {
            // Outbound shares carry their public-link context on the message
            // (variables holds the share payload when shareContext was set).
            const share = m.variables && typeof m.variables === 'object' && !Array.isArray(m.variables) && m.variables.publicUrl
                ? m.variables
                : null;
            items.push({
                kind: 'WHATSAPP',
                id: m.id,
                title: m.direction === 'OUTBOUND'
                    ? (share ? 'WhatsApp property share sent' : 'WhatsApp sent')
                    : 'WhatsApp received',
                description: m.body,
                at: m.createdAt,
                actor: m.sentBy || null,
                link: { type: 'conversation', id: m.conversationId },
                meta: {
                    messageId: m.id,
                    conversationId: m.conversationId,
                    direction: m.direction,
                    status: m.status,
                    ...(share ? { share } : {})
                }
            });
        }

        items.sort((x, y) => new Date(y.at).getTime() - new Date(x.at).getTime());
        return { items: items.slice(0, take), total: items.length };
    }
}

const activityTitle = (a) => {
    switch (a.type) {
        case 'STATUS_CHANGE': {
            const md = a.metadata || {};
            return md.from && md.to ? `Stage: ${md.from} → ${md.to}` : 'Stage changed';
        }
        case 'ASSIGNMENT': return 'Lead assigned';
        case 'FOLLOW_UP': return 'Follow-up scheduled';
        case 'CALL': return 'Call logged';
        case 'SITE_VISIT': return 'Site visit updated';
        case 'NOTE': return a.metadata && a.metadata.quotationId ? 'Quotation updated' : 'Note';
        case 'WHATSAPP': return (a.metadata && a.metadata.direction === 'INBOUND') ? 'WhatsApp received' : 'WhatsApp sent';
        case 'TASK': return 'Task created';
        case 'QUOTATION': return 'Quotation updated';
        case 'BOOKING': return 'Booking confirmed';
        case 'EMAIL': return 'Email logged';
        default: return a.type;
    }
};

module.exports = TimelineService;
