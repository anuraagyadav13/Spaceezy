const prisma = require('../db/prisma');
const { STAGE_GROUPS, PIPELINE_STAGES, STAGE_LABELS } = require('../constants/stageGroups');
const LeadService = require('./leadService');

function defaultDateRange(filters) {
    const to = filters.to ? new Date(filters.to) : new Date();
    let from;
    if (filters.from) {
        from = new Date(filters.from);
    } else {
        from = new Date(to.getFullYear(), to.getMonth(), 1);
    }
    return { from, to };
}

function previousRange(from, to) {
    const length = to.getTime() - from.getTime();
    return { prevFrom: new Date(from.getTime() - length), prevTo: from };
}

function utcDay(date) {
    return date.toISOString().slice(0, 10);
}

class PipelineService {
    static async getPipelineDashboard(organizationId, filters, role, userId) {
        const { from, to } = defaultDateRange(filters);
        const { prevFrom, prevTo } = previousRange(from, to);

        const effective = { ...filters, from, to };
        const scope = { organizationId, ...LeadService.buildLeadScope(role, userId, effective) };
        const prevScope = { organizationId, ...LeadService.buildLeadScope(role, userId, { ...filters, from: prevFrom, to: prevTo }) };

        const [
            statusCounts,
            prevStatusCounts,
            sourceCounts,
            leadCreatedRows,
            statusChangeRows,
            recentActivities,
            recentLeads,
            columnData
        ] = await Promise.all([
            prisma.lead.groupBy({ by: ['status'], where: scope, _count: { _all: true } }),
            prisma.lead.groupBy({ by: ['status'], where: prevScope, _count: { _all: true } }),
            prisma.lead.groupBy({ by: ['source'], where: scope, _count: { _all: true } }),
            prisma.lead.findMany({ where: scope, select: { createdAt: true } }),
            prisma.leadActivity.findMany({
                where: {
                    organizationId,
                    type: 'STATUS_CHANGE',
                    createdAt: { gte: from, lt: to },
                    lead: { is: scope }
                },
                select: { createdAt: true, metadata: true }
            }),
            prisma.leadActivity.findMany({
                where: { organizationId, createdAt: { gte: from, lt: to }, lead: { is: scope } },
                take: 10,
                orderBy: { createdAt: 'desc' },
                include: {
                    lead: { select: { id: true, name: true } },
                    performedBy: { select: { name: true } }
                }
            }),
            prisma.lead.findMany({
                where: scope,
                take: 10,
                orderBy: { createdAt: 'desc' },
                include: {
                    assignedTo: { select: { name: true } },
                    project: { select: { name: true } }
                }
            }),
            PipelineService.getColumnData(organizationId, scope)
        ]);

        const counts = PipelineService.groupCounts(statusCounts);
        const prevCounts = PipelineService.groupCounts(prevStatusCounts);

        return {
            summary: PipelineService.buildSummary(counts, prevCounts),
            pipeline: PipelineService.buildPipeline(columnData, counts),
            trends: PipelineService.buildTrends(leadCreatedRows, statusChangeRows, from, to),
            sources: PipelineService.buildSources(sourceCounts),
            recentActivities,
            recentLeads
        };
    }

    static groupCounts(statusCounts) {
        const counts = {};
        for (const [group, statuses] of Object.entries(STAGE_GROUPS)) {
            counts[group] = 0;
        }
        for (const row of statusCounts) {
            const group = PipelineService.statusToGroup(row.status);
            if (group) counts[group] += row._count._all;
        }
        return counts;
    }

    static buildSummary(counts, prevCounts) {
        const build = (group) => {
            const count = counts[group] || 0;
            const prev = prevCounts[group] || 0;
            const deltaPct = prev === 0 ? (count > 0 ? 100 : 0) : Math.round(((count - prev) / prev) * 100);
            return { count, prevCount: prev, deltaPct };
        };

        const total = Object.values(counts).reduce((a, b) => a + b, 0);
        const prevTotal = Object.values(prevCounts).reduce((a, b) => a + b, 0);

        return {
            total: { count: total, prevCount: prevTotal, deltaPct: prevTotal === 0 ? (total > 0 ? 100 : 0) : Math.round(((total - prevTotal) / prevTotal) * 100) },
            new: build('NEW'),
            contacted: build('CONTACTED'),
            followUp: build('FOLLOW_UP'),
            siteVisit: build('SITE_VISIT'),
            quotation: build('QUOTATION'),
            booking: build('BOOKING'),
        };
    }

    static statusToGroup(status) {
        for (const [group, statuses] of Object.entries(STAGE_GROUPS)) {
            if (statuses.includes(status)) return group;
        }
        return null;
    }

    static async getColumnData(organizationId, scope) {
        const entries = await Promise.all(PIPELINE_STAGES.map(async (group) => {
            const where = { ...scope, status: { in: STAGE_GROUPS[group] } };

            const [leads, value] = await Promise.all([
                prisma.lead.findMany({
                    where,
                    take: 5,
                    orderBy: { updatedAt: 'desc' },
                    include: {
                        assignedTo: { select: { name: true } },
                        project: { select: { name: true } },
                        property: { select: { configuration: true, price: true } }
                    }
                }),
                PipelineService.getStageValue(organizationId, group, where)
            ]);

            return [group, { leads, value }];
        }));

        return Object.fromEntries(entries);
    }

    static async getStageValue(organizationId, group, leadWhere) {
        if (group === 'QUOTATION') {
            const rows = await prisma.quotation.findMany({
                where: { organizationId, status: { in: ['DRAFT', 'SENT', 'ACCEPTED'] }, lead: { is: leadWhere } },
                select: { leadId: true, totalAmount: true, createdAt: true },
                orderBy: { createdAt: 'desc' }
            });
            rows.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            const seen = new Set();
            let sum = 0;
            for (const row of rows) {
                if (!seen.has(row.leadId)) {
                    seen.add(row.leadId);
                    sum += Number(row.totalAmount);
                }
            }
            return sum;
        }

        if (group === 'BOOKING') {
            const agg = await prisma.booking.aggregate({
                _sum: { amount: true },
                where: { organizationId, paymentStatus: { not: 'CANCELLED' }, lead: { is: leadWhere } }
            });
            return Number(agg._sum.amount || 0);
        }

        const agg = await prisma.lead.aggregate({ where: leadWhere, _sum: { budget: true } });
        return Number(agg._sum.budget || 0);
    }

    static buildPipeline(columnData, counts) {
        return PIPELINE_STAGES.map(group => {
            const data = columnData[group] || { leads: [], value: 0 };
            return {
                stage: group,
                label: STAGE_LABELS[group],
                count: counts[group] || 0,
                value: data.value,
                leads: data.leads.map(l => ({
                    id: l.id,
                    name: l.name,
                    project: l.project?.name || null,
                    configuration: l.property?.configuration || l.interestedUnitType || null,
                    budget: l.budget,
                    assignedTo: l.assignedTo?.name || null,
                    status: l.status,
                    nextFollowUpAt: l.nextFollowUpAt,
                    updatedAt: l.updatedAt
                }))
            };
        });
    }

    static buildTrends(leadCreatedRows, statusChangeRows, from, to) {
        const buckets = {};
        const d = new Date(from.getTime());
        d.setUTCHours(0, 0, 0, 0);
        const end = new Date(to.getTime());

        while (d < end) {
            const key = d.toISOString().slice(0, 10);
            buckets[key] = { date: key, new: 0, contacted: 0, siteVisit: 0, quotation: 0, booking: 0 };
            d.setUTCDate(d.getUTCDate() + 1);
        }

        for (const row of leadCreatedRows) {
            const key = utcDay(row.createdAt);
            if (buckets[key]) buckets[key].new += 1;
        }

        const stageMap = { CONTACTED: 'contacted', SITE_VISIT: 'siteVisit', QUOTATION: 'quotation', BOOKED: 'booking' };
        for (const row of statusChangeRows) {
            const stage = row.metadata && row.metadata.to;
            const series = stageMap[stage];
            if (!series) continue;
            const key = utcDay(row.createdAt);
            if (buckets[key]) buckets[key][series] += 1;
        }

        return Object.values(buckets);
    }

    static buildSources(sourceCounts) {
        const total = sourceCounts.reduce((a, b) => a + b._count._all, 0);
        return sourceCounts
            .filter(s => s.source)
            .map(s => ({
                source: s.source,
                count: s._count._all,
                pct: total === 0 ? 0 : Math.round((s._count._all / total) * 100)
            }))
            .sort((a, b) => b.count - a.count);
    }
}

module.exports = PipelineService;
