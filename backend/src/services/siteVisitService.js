const prisma = require('../db/prisma');
const { AppError } = require('../utils/errors');

const EARLIER_THAN_SITE_VISIT = ['NEW', 'CONTACTED', 'FOLLOW_UP', 'INTERESTED', 'QUALIFIED'];
const FINAL_STATUSES = ['COMPLETED', 'CANCELLED', 'NO_SHOW'];
const ALLOWED_FROM_SCHEDULED = ['COMPLETED', 'CANCELLED', 'NO_SHOW'];

const BASE_INCLUDE = {
    lead: { select: { id: true, name: true, phone: true, email: true, status: true, projectId: true } },
    project: { select: { id: true, name: true } },
    property: { select: { id: true, title: true, unitNumber: true, projectId: true } },
    assignedTo: { select: { id: true, name: true } }
};

class SiteVisitService {
    // Resolves and validates lead/project/property references against the organization.
    // Returned ids may be undefined (= unchanged) or null (= clear), so update flows
    // can distinguish "not provided" from an explicit clear.
    static async resolveRefs(db, data, organizationId, lead) {
        let projectId = Object.prototype.hasOwnProperty.call(data, 'projectId') ? data.projectId : undefined;
        let propertyId = Object.prototype.hasOwnProperty.call(data, 'propertyId') ? data.propertyId : undefined;
        let project = null;
        let property = null;

        if (propertyId) {
            property = await db.property.findFirst({ where: { id: propertyId, organizationId } });
            if (!property) throw new AppError('Property not found', 404, 'NOT_FOUND');
            if (projectId === undefined || projectId === null) {
                projectId = property.projectId;
            } else if (projectId !== property.projectId) {
                throw new AppError('Property does not belong to the specified project', 400, 'CROSS_PROJECT_REFERENCE');
            }
        }

        if (projectId === null) {
            propertyId = null;
        } else if (projectId) {
            project = await db.project.findFirst({ where: { id: projectId, organizationId } });
            if (!project) throw new AppError('Project not found', 404, 'NOT_FOUND');
        }

        if (lead && lead.projectId && projectId && lead.projectId !== projectId) {
            throw new AppError('Site visit project does not match the lead project', 400, 'CROSS_PROJECT_REFERENCE');
        }

        let propertyName = data.propertyName !== undefined ? data.propertyName : undefined;
        if (property) {
            propertyName = property.title || property.unitNumber || null;
        } else if (project) {
            propertyName = project.name;
        }

        return { projectId, propertyId, project, property, propertyName };
    }

    static async assertAssignee(db, assignedToId, organizationId) {
        if (!assignedToId) return;
        const user = await db.user.findFirst({ where: { id: assignedToId, organizationId } });
        if (!user) throw new AppError('Assignee not found in your organization', 404, 'NOT_FOUND');
        if (user.status !== 'ACTIVE') throw new AppError('Cannot assign a site visit to an inactive user', 400, 'BAD_REQUEST');
    }

    static async assertNoConflict(db, { organizationId, date, time, leadId, assignedToId, excludeId }) {
        const dayStart = new Date(date);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
        const matchesTime = (v) => String(v.time).trim().toLowerCase() === String(time).trim().toLowerCase();

        if (leadId) {
            const candidates = await db.siteVisit.findMany({
                where: {
                    organizationId,
                    status: 'SCHEDULED',
                    leadId,
                    ...(excludeId ? { id: { not: excludeId } } : {}),
                    date: { gte: dayStart, lt: dayEnd }
                }
            });
            if (candidates.some(matchesTime)) {
                throw new AppError('A site visit is already scheduled for this lead at that date and time', 409, 'DUPLICATE_VISIT');
            }
        }

        if (assignedToId) {
            const candidates = await db.siteVisit.findMany({
                where: {
                    organizationId,
                    status: 'SCHEDULED',
                    assignedToId,
                    ...(excludeId ? { id: { not: excludeId } } : {}),
                    date: { gte: dayStart, lt: dayEnd }
                }
            });
            if (candidates.some(matchesTime)) {
                throw new AppError('The assignee already has a site visit in that time slot', 409, 'SLOT_CONFLICT');
            }
        }
    }

    static async advanceLeadToSiteVisit(db, lead, userId, organizationId, reason) {
        if (!lead || !EARLIER_THAN_SITE_VISIT.includes(lead.status)) return;

        await db.lead.update({ where: { id: lead.id }, data: { status: 'SITE_VISIT' } });
        await db.leadActivity.create({
            data: {
                organizationId,
                leadId: lead.id,
                type: 'STATUS_CHANGE',
                description: `Stage changed from ${lead.status} to SITE_VISIT`,
                performedById: userId,
                metadata: { from: lead.status, to: 'SITE_VISIT', reason }
            }
        });
    }

    static async logVisitActivity(db, lead, organizationId, userId, status, description) {
        if (!lead) return;
        await db.leadActivity.create({
            data: {
                organizationId,
                leadId: lead.id,
                type: 'SITE_VISIT',
                description,
                performedById: userId,
                metadata: { visitStatus: status }
            }
        });
    }

    static async applyStatusChange(db, siteVisit, status, organizationId, userId) {
        if (status === siteVisit.status) return siteVisit;

        if (FINAL_STATUSES.includes(siteVisit.status)) {
            throw new AppError(`A ${siteVisit.status.toLowerCase()} site visit cannot change status`, 409, 'VISIT_ALREADY_FINAL');
        }

        if (!ALLOWED_FROM_SCHEDULED.includes(status)) {
            throw new AppError(`Cannot change site visit status to ${status}`, 422, 'VALIDATION_ERROR');
        }

        const lead = siteVisit.leadId
            ? await db.lead.findFirst({ where: { id: siteVisit.leadId, organizationId } })
            : null;

        const updated = await db.siteVisit.update({ where: { id: siteVisit.id }, data: { status } });

        if (status === 'COMPLETED') {
            await SiteVisitService.logVisitActivity(db, lead, organizationId, userId, status, 'Site visit completed');
            await SiteVisitService.advanceLeadToSiteVisit(db, lead, userId, organizationId, 'site visit completed');
        } else if (status === 'CANCELLED') {
            await SiteVisitService.logVisitActivity(db, lead, organizationId, userId, status, 'Site visit cancelled');
        } else if (status === 'NO_SHOW') {
            await SiteVisitService.logVisitActivity(db, lead, organizationId, userId, status, 'Site visit marked as no-show');
        }

        return updated;
    }

    static async getSiteVisits(organizationId, query, role, userId) {
        const { page = 1, limit = 20, status, assignedToId, projectId, leadId, search, sort = 'desc' } = query;
        const skip = (page - 1) * limit;

        const where = { organizationId };

        if (role === 'SALES_EXECUTIVE' || role === 'CHANNEL_PARTNER') {
            where.assignedToId = userId;
        } else if (assignedToId) {
            where.assignedToId = assignedToId;
        }

        if (status) where.status = status;
        if (projectId) where.projectId = projectId;
        if (leadId) where.leadId = leadId;

        if (search) {
            where.OR = [
                { leadName: { contains: search, mode: 'insensitive' } },
                { phone: { contains: search } },
                { propertyName: { contains: search, mode: 'insensitive' } },
                { lead: { name: { contains: search, mode: 'insensitive' } } }
            ];
        }

        const [siteVisits, total] = await Promise.all([
            prisma.siteVisit.findMany({
                where,
                skip: parseInt(skip),
                take: parseInt(limit),
                orderBy: { date: sort === 'asc' ? 'asc' : 'desc' },
                include: BASE_INCLUDE
            }),
            prisma.siteVisit.count({ where })
        ]);

        return { siteVisits, total, pages: Math.ceil(total / limit) };
    }

    static async getSiteVisitById(id, organizationId) {
        const siteVisit = await prisma.siteVisit.findFirst({
            where: { id, organizationId },
            include: BASE_INCLUDE
        });
        if (!siteVisit) throw new AppError('Site visit not found', 404, 'NOT_FOUND');
        return siteVisit;
    }

    static async createSiteVisit(data, organizationId, userId) {
        let lead = null;
        if (data.leadId) {
            lead = await prisma.lead.findFirst({ where: { id: data.leadId, organizationId } });
            if (!lead) throw new AppError('Lead not found', 404, 'NOT_FOUND');
        }

        const refs = await SiteVisitService.resolveRefs(prisma, data, organizationId, lead);

        const assignedToId = data.assignedToId || userId;
        if (data.assignedToId) {
            await SiteVisitService.assertAssignee(prisma, data.assignedToId, organizationId);
        }

        const status = data.status || 'SCHEDULED';
        const date = new Date(data.date);
        const time = String(data.time).trim();
        const projectId = refs.projectId || null;
        const propertyId = refs.propertyId || null;

        if (status === 'SCHEDULED') {
            await SiteVisitService.assertNoConflict(prisma, {
                organizationId,
                date,
                time,
                leadId: lead ? lead.id : null,
                assignedToId
            });
        }

        return await prisma.$transaction(async (tx) => {
            const siteVisit = await tx.siteVisit.create({
                data: {
                    organizationId,
                    leadId: lead ? lead.id : null,
                    leadName: data.leadName || (lead ? lead.name : null),
                    phone: data.phone || (lead ? lead.phone : null),
                    propertyName: refs.propertyName || null,
                    projectId,
                    propertyId,
                    date,
                    time,
                    status,
                    assignedToId
                },
                include: BASE_INCLUDE
            });

            if (lead) {
                const leadUpdates = {};
                if (!lead.projectId && projectId) leadUpdates.projectId = projectId;
                if (!lead.propertyId && propertyId) leadUpdates.propertyId = propertyId;
                if (Object.keys(leadUpdates).length > 0) {
                    await tx.lead.update({ where: { id: lead.id }, data: leadUpdates });
                }

                if (status === 'SCHEDULED' || status === 'COMPLETED') {
                    await SiteVisitService.advanceLeadToSiteVisit(tx, lead, userId, organizationId, 'site visit scheduled');
                }
                await SiteVisitService.logVisitActivity(
                    tx, lead, organizationId, userId, status,
                    `Site visit scheduled for ${date.toISOString().slice(0, 10)} ${time}`
                );
            }

            return siteVisit;
        });
    }

    static async updateSiteVisitStatus(id, status, organizationId, role, userId) {
        const siteVisit = await prisma.siteVisit.findFirst({ where: { id, organizationId } });
        if (!siteVisit) throw new AppError('Site visit not found', 404, 'NOT_FOUND');

        if ((role === 'SALES_EXECUTIVE' || role === 'CHANNEL_PARTNER') && siteVisit.assignedToId !== userId) {
            throw new AppError('Not authorized to update this site visit', 403, 'FORBIDDEN');
        }

        return await prisma.$transaction(async (tx) => {
            await SiteVisitService.applyStatusChange(tx, siteVisit, status, organizationId, userId);
            return tx.siteVisit.findFirst({ where: { id }, include: BASE_INCLUDE });
        });
    }

    static async updateSiteVisit(id, data, organizationId, role, userId) {
        const existing = await prisma.siteVisit.findFirst({ where: { id, organizationId } });
        if (!existing) throw new AppError('Site visit not found', 404, 'NOT_FOUND');

        if ((role === 'SALES_EXECUTIVE' || role === 'CHANNEL_PARTNER') && existing.assignedToId !== userId) {
            throw new AppError('Not authorized to update this site visit', 403, 'FORBIDDEN');
        }

        let lead = existing.leadId
            ? await prisma.lead.findFirst({ where: { id: existing.leadId, organizationId } })
            : null;
        if (data.leadId !== undefined && data.leadId) {
            lead = await prisma.lead.findFirst({ where: { id: data.leadId, organizationId } });
            if (!lead) throw new AppError('Lead not found', 404, 'NOT_FOUND');
        }

        const refs = await SiteVisitService.resolveRefs(
            prisma,
            {
                projectId: data.projectId !== undefined ? data.projectId : (data.propertyId !== undefined ? undefined : existing.projectId),
                propertyId: data.propertyId !== undefined ? data.propertyId : existing.propertyId,
                propertyName: data.propertyName !== undefined ? data.propertyName : existing.propertyName
            },
            organizationId,
            lead
        );

        if (data.assignedToId) {
            await SiteVisitService.assertAssignee(prisma, data.assignedToId, organizationId);
        }

        const nextDate = data.date !== undefined ? new Date(data.date) : existing.date;
        const nextTime = data.time !== undefined ? String(data.time).trim() : existing.time;
        const nextStatus = data.status !== undefined ? data.status : existing.status;
        const nextAssigned = data.assignedToId !== undefined ? (data.assignedToId || null) : existing.assignedToId;

        const slotChanged = nextDate.getTime() !== new Date(existing.date).getTime()
            || nextTime !== String(existing.time).trim()
            || nextAssigned !== existing.assignedToId;
        if (slotChanged && nextStatus === 'SCHEDULED') {
            await SiteVisitService.assertNoConflict(prisma, {
                organizationId,
                date: nextDate,
                time: nextTime,
                leadId: lead ? lead.id : null,
                assignedToId: nextAssigned,
                excludeId: id
            });
        }

        const updateData = {};
        if (data.leadName !== undefined) updateData.leadName = data.leadName;
        if (data.phone !== undefined) updateData.phone = data.phone;
        if (data.leadId !== undefined) updateData.leadId = data.leadId || null;
        if (data.projectId !== undefined) updateData.projectId = refs.projectId ?? null;
        if (data.propertyId !== undefined) updateData.propertyId = refs.propertyId ?? null;
        if (data.projectId !== undefined && data.projectId === null && data.propertyId === undefined) {
            updateData.propertyId = null;
        }
        if (data.propertyId !== undefined && data.propertyId && data.projectId === undefined) {
            updateData.projectId = refs.projectId ?? null;
        }
        if (data.date !== undefined) updateData.date = nextDate;
        if (data.time !== undefined) updateData.time = nextTime;
        if (data.assignedToId !== undefined) updateData.assignedToId = nextAssigned;
        if (data.projectId !== undefined || data.propertyId !== undefined || data.propertyName !== undefined) {
            updateData.propertyName = refs.propertyName ?? null;
        }

        return await prisma.$transaction(async (tx) => {
            let siteVisit = await tx.siteVisit.update({ where: { id }, data: updateData, include: BASE_INCLUDE });

            if (data.status !== undefined && data.status !== existing.status) {
                await SiteVisitService.applyStatusChange(tx, siteVisit, data.status, organizationId, userId);
                siteVisit = await tx.siteVisit.findFirst({ where: { id }, include: BASE_INCLUDE });
            }

            return siteVisit;
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
            include: BASE_INCLUDE
        });
    }
}

module.exports = SiteVisitService;
