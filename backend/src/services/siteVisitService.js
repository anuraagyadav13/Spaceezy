const prisma = require('../db/prisma');
const { AppError } = require('../utils/errors');

class SiteVisitService {
    static async getSiteVisits(organizationId, query, role, userId) {
        const { page = 1, limit = 20, status, assignedToId, search, sort = 'desc' } = query;
        const skip = (page - 1) * limit;

        const where = { organizationId };

        // Role-based scoping
        if (role === 'SALES_EXECUTIVE' || role === 'CHANNEL_PARTNER') {
            where.assignedToId = userId;
        } else if (assignedToId) {
            where.assignedToId = assignedToId;
        }

        if (status) where.status = status;

        if (search) {
            where.OR = [
                { leadName: { contains: search, mode: 'insensitive' } },
                { phone: { contains: search, mode: 'insensitive' } },
                { propertyName: { contains: search, mode: 'insensitive' } }
            ];
        }

        const [siteVisits, total] = await Promise.all([
            prisma.siteVisit.findMany({
                where,
                skip: parseInt(skip),
                take: parseInt(limit),
                orderBy: { date: sort === 'asc' ? 'asc' : 'desc' },
                include: {
                    lead: { select: { id: true, name: true, phone: true, email: true } },
                    assignedTo: { select: { id: true, name: true } }
                }
            }),
            prisma.siteVisit.count({ where })
        ]);

        return { siteVisits, total, pages: Math.ceil(total / limit) };
    }

    static async getSiteVisitById(id, organizationId) {
        const siteVisit = await prisma.siteVisit.findFirst({
            where: { id, organizationId },
            include: {
                lead: { select: { id: true, name: true, phone: true, email: true } },
                assignedTo: { select: { id: true, name: true } }
            }
        });
        if (!siteVisit) throw new AppError('Site visit not found', 404, 'NOT_FOUND');
        return siteVisit;
    }

    static async createSiteVisit(data, organizationId, userId) {
        // Validate lead if provided
        if (data.leadId) {
            const lead = await prisma.lead.findFirst({ where: { id: data.leadId, organizationId } });
            if (!lead) throw new AppError('Lead not found', 404, 'NOT_FOUND');
        }

        const siteVisit = await prisma.siteVisit.create({
            data: {
                organizationId,
                leadId: data.leadId || null,
                leadName: data.leadName || null,
                phone: data.phone || null,
                propertyName: data.propertyName || null,
                date: new Date(data.date),
                time: data.time,
                status: data.status || 'SCHEDULED',
                assignedToId: data.assignedToId || userId
            },
            include: {
                lead: { select: { id: true, name: true, phone: true } },
                assignedTo: { select: { id: true, name: true } }
            }
        });

        return siteVisit;
    }

    static async updateSiteVisitStatus(id, status, organizationId, role, userId) {
        const siteVisit = await prisma.siteVisit.findFirst({ where: { id, organizationId } });
        if (!siteVisit) throw new AppError('Site visit not found', 404, 'NOT_FOUND');

        // Access control
        if ((role === 'SALES_EXECUTIVE' || role === 'CHANNEL_PARTNER') && siteVisit.assignedToId !== userId) {
            throw new AppError('Not authorized to update this site visit', 403, 'FORBIDDEN');
        }

        return prisma.siteVisit.update({
            where: { id },
            data: { status }
        });
    }

    static async updateSiteVisit(id, data, organizationId, role, userId) {
        const siteVisit = await prisma.siteVisit.findFirst({ where: { id, organizationId } });
        if (!siteVisit) throw new AppError('Site visit not found', 404, 'NOT_FOUND');

        if ((role === 'SALES_EXECUTIVE' || role === 'CHANNEL_PARTNER') && siteVisit.assignedToId !== userId) {
            throw new AppError('Not authorized to update this site visit', 403, 'FORBIDDEN');
        }

        const updateData = {};
        if (data.leadName !== undefined) updateData.leadName = data.leadName;
        if (data.phone !== undefined) updateData.phone = data.phone;
        if (data.propertyName !== undefined) updateData.propertyName = data.propertyName;
        if (data.date !== undefined) updateData.date = new Date(data.date);
        if (data.time !== undefined) updateData.time = data.time;
        if (data.status !== undefined) updateData.status = data.status;
        if (data.assignedToId !== undefined) updateData.assignedToId = data.assignedToId;

        return prisma.siteVisit.update({
            where: { id },
            data: updateData,
            include: {
                lead: { select: { id: true, name: true, phone: true } },
                assignedTo: { select: { id: true, name: true } }
            }
        });
    }

    static async deleteSiteVisit(id, organizationId, role, userId) {
        const siteVisit = await prisma.siteVisit.findFirst({ where: { id, organizationId } });
        if (!siteVisit) throw new AppError('Site visit not found', 404, 'NOT_FOUND');

        if ((role === 'SALES_EXECUTIVE' || role === 'CHANNEL_PARTNER') && siteVisit.assignedToId !== userId) {
            throw new AppError('Not authorized to delete this site visit', 403, 'FORBIDDEN');
        }

        await prisma.siteVisit.delete({ where: { id } });
        return true;
    }

    static async getSiteVisitsByEmployee(employeeId, organizationId) {
        return prisma.siteVisit.findMany({
            where: { assignedToId: employeeId, organizationId },
            orderBy: { date: 'desc' },
            include: {
                lead: { select: { id: true, name: true, phone: true } }
            }
        });
    }
}

module.exports = SiteVisitService;
