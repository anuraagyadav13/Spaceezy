const prisma = require('../db/prisma');
const { AppError } = require('../utils/errors');

class LeadService {
    static normalizeLeadPayload(data = {}) {
        const payload = { ...data };

        const assignedToValue = typeof payload.assignedTo === 'string'
            ? payload.assignedTo.trim()
            : payload.assignedTo;
        const assignedToIdValue = typeof payload.assignedToId === 'string'
            ? payload.assignedToId.trim()
            : payload.assignedToId;

        const finalAssignedToId = (assignedToIdValue || assignedToValue || '').trim();

        if (finalAssignedToId) {
            payload.assignedToId = finalAssignedToId;
        } else {
            delete payload.assignedToId;
        }

        delete payload.assignedTo;

        if (payload.stage && !payload.status) {
            payload.status = payload.stage;
        }

        delete payload.stage;
        delete payload.project;
        delete payload.budget;

        return payload;
    }

    static async createLead(data = {}, organizationId, createdById = null) {
        const payload = LeadService.normalizeLeadPayload(data);

        return await prisma.$transaction(async (tx) => {
            const lead = await tx.lead.create({
                data: {
                    ...payload,
                    organizationId,
                    createdById
                }
            });

            await tx.leadActivity.create({
                data: {
                    organizationId,
                    leadId: lead.id,
                    type: 'NOTE',
                    description: 'Lead created',
                    performedById: createdById,
                    metadata: { source: data.source || 'Manual' }
                }
            });

            return lead;
        });
    }

    static async getLeads(organizationId, query, userRole, userId) {
        const { page = 1, limit = 10, search, status, source, assignedTo, sort = 'desc' } = query;
        const skip = (page - 1) * limit;

        const where = { organizationId };

        // Role-based data scoping
        if (userRole === 'SALES_EXECUTIVE' || userRole === 'CHANNEL_PARTNER') {
            where.assignedToId = userId;
        } else if (userRole === 'SALES_MANAGER') {
            // Simplified for now: in reality would check team hierarchy
            // For now, manager sees everything in organization, or you could implement team scope
        }

        if (status) where.status = status;
        if (source) where.source = source;
        if (assignedTo) where.assignedToId = assignedTo;
        if (search) {
            where.OR = [
                { name: { contains: search, mode: 'insensitive' } },
                { email: { contains: search, mode: 'insensitive' } },
                { phone: { contains: search } }
            ];
        }

        const [leads, total] = await Promise.all([
            prisma.lead.findMany({
                where,
                skip: parseInt(skip),
                take: parseInt(limit),
                orderBy: { createdAt: sort === 'asc' ? 'asc' : 'desc' },
                include: { assignedTo: { select: { name: true } } }
            }),
            prisma.lead.count({ where })
        ]);

        return { leads, total, pages: Math.ceil(total / limit) };
    }

    static async getLeadById(id, organizationId, userRole, userId) {
        const lead = await prisma.lead.findFirst({
            where: { id, organizationId },
            include: { 
                activities: { orderBy: { createdAt: 'desc' } },
                assignedTo: { select: { id: true, name: true } }
            }
        });

        if (!lead) return null;

        // Scope check
        if ((userRole === 'SALES_EXECUTIVE' || userRole === 'CHANNEL_PARTNER') && lead.assignedToId !== userId) {
            throw new AppError('You do not have access to this lead', 403, 'FORBIDDEN');
        }

        return lead;
    }

    static async updateLead(id, data, organizationId, userRole, userId) {
        const payload = LeadService.normalizeLeadPayload(data);

        return await prisma.$transaction(async (tx) => {
            const existing = await tx.lead.findFirst({ where: { id, organizationId } });
            
            if (!existing) {
                throw new AppError('Lead not found', 404, 'NOT_FOUND');
            }

            if ((userRole === 'SALES_EXECUTIVE' || userRole === 'CHANNEL_PARTNER') && existing.assignedToId !== userId) {
                throw new AppError('You do not have access to update this lead', 403, 'FORBIDDEN');
            }

            const updated = await tx.lead.update({
                where: { id },
                data: payload
            });

            // If status changed, log activity
            if (data.status && data.status !== existing.status) {
                await tx.leadActivity.create({
                    data: {
                        organizationId,
                        leadId: id,
                        type: 'STATUS_CHANGE',
                        description: `Status changed from ${existing.status} to ${data.status}`,
                        performedById: userId
                    }
                });
            }

            return updated;
        });
    }

    static async deleteLead(id, organizationId, userRole, userId) {
        // Find first to check scope
        const existing = await prisma.lead.findFirst({ where: { id, organizationId } });
        if (!existing) {
            throw new AppError('Lead not found', 404, 'NOT_FOUND');
        }

        if ((userRole === 'SALES_EXECUTIVE' || userRole === 'CHANNEL_PARTNER') && existing.assignedToId !== userId) {
            throw new AppError('You do not have access to delete this lead', 403, 'FORBIDDEN');
        }

        await prisma.lead.delete({ where: { id } });
        return true;
    }

    static async handlePublicEnquiry(data, spaceezyOrgId) {
        // Normalize phone to help with duplicates
        const phone = data.phone.trim();
        
        return await prisma.$transaction(async (tx) => {
            // Find existing lead by phone
            const existingLead = await tx.lead.findFirst({
                where: {
                    organizationId: spaceezyOrgId,
                    phone: phone
                }
            });

            let lead;
            
            if (existingLead) {
                // Update relevant context but keep status unless it was LOST
                lead = await tx.lead.update({
                    where: { id: existingLead.id },
                    data: {
                        message: data.message ? `${existingLead.message || ''}\n\nNew Enquiry: ${data.message}` : existingLead.message,
                        projectId: data.projectId || existingLead.projectId,
                        propertyId: data.propertyId || existingLead.propertyId,
                        status: existingLead.status === 'LOST' ? 'NEW' : existingLead.status
                    }
                });

                await tx.leadActivity.create({
                    data: {
                        organizationId: spaceezyOrgId,
                        leadId: lead.id,
                        type: 'NOTE',
                        description: `Duplicate enquiry received from website. Project: ${data.projectId || 'N/A'}, Property: ${data.propertyId || 'N/A'}`
                    }
                });
            } else {
                // Create new lead
                lead = await tx.lead.create({
                    data: {
                        organizationId: spaceezyOrgId,
                        name: data.name,
                        email: data.email,
                        phone: phone,
                        source: data.source || 'Website',
                        campaign: data.campaign,
                        landingPage: data.landingPage,
                        projectId: data.projectId,
                        propertyId: data.propertyId,
                        message: data.message,
                        status: 'NEW',
                        preferredVisitDate: data.preferredVisitDate ? new Date(data.preferredVisitDate) : null,
                        preferredVisitTime: data.preferredVisitTime,
                        interestedUnitType: data.interestedUnitType
                    }
                });

                await tx.leadActivity.create({
                    data: {
                        organizationId: spaceezyOrgId,
                        leadId: lead.id,
                        type: 'NOTE',
                        description: 'New enquiry received from website'
                    }
                });
            }

            return lead;
        });
    }
    static async getMatchingProperties(leadId, organizationId) {
        const lead = await prisma.lead.findFirst({
            where: { id: leadId, organizationId }
        });
        if (!lead) throw new AppError('Lead not found', 404, 'NOT_FOUND');

        const where = { organizationId, status: 'AVAILABLE' };
        
        if (lead.projectId) {
            where.projectId = lead.projectId;
        }

        const properties = await prisma.property.findMany({
            where,
            include: { project: { select: { name: true } } },
            take: 20
        });

        const interests = await prisma.leadInterest.findMany({
            where: { leadId },
            select: { propertyId: true }
        });
        const interestedIds = interests.map(i => i.propertyId);

        return properties.map(p => ({
            ...p,
            isInterested: interestedIds.includes(p.id)
        }));
    }

    static async addInterestedProperty(leadId, propertyId, organizationId) {
        const lead = await prisma.lead.findFirst({ where: { id: leadId, organizationId } });
        if (!lead) throw new AppError('Lead not found', 404, 'NOT_FOUND');

        const property = await prisma.property.findFirst({ where: { id: propertyId, organizationId } });
        if (!property) throw new AppError('Property not found', 404, 'NOT_FOUND');

        try {
            const interest = await prisma.leadInterest.create({
                data: {
                    leadId,
                    propertyId
                }
            });
            return interest;
        } catch (error) {
            if (error.code === 'P2002') return true;
            throw error;
        }
    }

    static async removeInterestedProperty(leadId, propertyId, organizationId) {
        const lead = await prisma.lead.findFirst({ where: { id: leadId, organizationId } });
        if (!lead) throw new AppError('Lead not found', 404, 'NOT_FOUND');

        await prisma.leadInterest.deleteMany({
            where: {
                leadId,
                propertyId
            }
        });

        return true;
    }

    // --- Follow-ups ---

    static async getFollowups(organizationId, query) {
        const { status, limit = 50 } = query;
        const where = {
            organizationId,
            type: { in: ['FOLLOW_UP', 'CALL', 'SITE_VISIT'] }
        };
        if (status) where.status = status;

        const activities = await prisma.leadActivity.findMany({
            where,
            take: parseInt(limit),
            orderBy: { createdAt: 'desc' },
            include: {
                lead: { select: { name: true } },
                performedBy: { select: { name: true } }
            }
        });

        return activities.map(a => ({
            id: a.id,
            refName: a.lead?.name || 'Unknown',
            type: a.type,
            dueDate: a.metadata?.dueDate || a.createdAt.toISOString().slice(0, 10),
            notes: a.description,
            status: a.metadata?.followupStatus || 'Pending'
        }));
    }

    static async toggleFollowupStatus(activityId, organizationId) {
        const activity = await prisma.leadActivity.findFirst({
            where: { id: activityId, organizationId }
        });

        if (!activity) throw new AppError('Follow-up not found', 404, 'NOT_FOUND');

        const metadata = activity.metadata && typeof activity.metadata === 'object' ? activity.metadata : {};
        const currentStatus = metadata.followupStatus || 'Pending';
        const newStatus = currentStatus === 'Done' ? 'Pending' : 'Done';

        const updated = await prisma.leadActivity.update({
            where: { id: activityId },
            data: {
                metadata: { ...metadata, followupStatus: newStatus }
            }
        });

        return updated;
    }

    // --- Activities feed ---

    static async getActivities(organizationId, query) {
        const { limit = 50 } = query;

        const activities = await prisma.leadActivity.findMany({
            where: { organizationId },
            take: parseInt(limit),
            orderBy: { createdAt: 'desc' },
            include: {
                lead: { select: { id: true, name: true, source: true, status: true, assignedTo: { select: { name: true } } } },
                performedBy: { select: { name: true } }
            }
        });

        return activities;
    }

    // --- Bulk assign ---

    static async bulkAssignLeads(leadIds, assignedToId, organizationId, userId) {
        if (!leadIds || leadIds.length === 0) {
            throw new AppError('No leads selected', 400, 'BAD_REQUEST');
        }

        const user = await prisma.user.findFirst({
            where: { id: assignedToId, organizationId }
        });

        if (!user) throw new AppError('Assignee not found', 404, 'NOT_FOUND');

        return await prisma.$transaction(async (tx) => {
            await tx.lead.updateMany({
                where: {
                    id: { in: leadIds },
                    organizationId
                },
                data: {
                    assignedToId
                }
            });

            // Log activities for each lead
            for (const leadId of leadIds) {
                await tx.leadActivity.create({
                    data: {
                        organizationId,
                        leadId,
                        type: 'ASSIGNMENT',
                        description: `Lead reassigned to ${user.name}`,
                        performedById: userId
                    }
                });
            }

            return { count: leadIds.length };
        });
    }

    // --- Duplicates ---

    static async getDuplicates(organizationId, query) {
        // Simple heuristic: Find leads with matching phone or email
        // A more advanced approach would use grouping in Prisma, but for this CRM phase:
        const rawDuplicates = await prisma.$queryRaw`
            SELECT "phone", COUNT(*) as count 
            FROM "Lead" 
            WHERE "organizationId" = ${organizationId} AND "phone" IS NOT NULL AND "phone" != ''
            GROUP BY "phone" 
            HAVING COUNT(*) > 1
        `;

        const duplicatePhones = rawDuplicates.map(r => r.phone);

        if (duplicatePhones.length === 0) return [];

        const leads = await prisma.lead.findMany({
            where: {
                organizationId,
                phone: { in: duplicatePhones }
            },
            include: { assignedTo: { select: { name: true } } },
            orderBy: { phone: 'asc' }
        });

        // Group by phone for the frontend
        const groups = {};
        for (const lead of leads) {
            if (!groups[lead.phone]) groups[lead.phone] = [];
            groups[lead.phone].push(lead);
        }

        return Object.entries(groups).map(([phone, duplicates]) => ({
            type: 'Phone Match',
            value: phone,
            leads: duplicates
        }));
    }

    static async mergeLeads(survivingLeadId, duplicateLeadId, organizationId, userId) {
        if (survivingLeadId === duplicateLeadId) throw new AppError('Cannot merge a lead into itself', 400, 'BAD_REQUEST');

        return await prisma.$transaction(async (tx) => {
            const survivor = await tx.lead.findFirst({ where: { id: survivingLeadId, organizationId } });
            const duplicate = await tx.lead.findFirst({ where: { id: duplicateLeadId, organizationId } });

            if (!survivor || !duplicate) throw new AppError('Lead(s) not found', 404, 'NOT_FOUND');

            // Merge fields: survivor takes precedence, but nulls are filled by duplicate
            const updates = {};
            if (!survivor.email && duplicate.email) updates.email = duplicate.email;
            if (!survivor.source && duplicate.source) updates.source = duplicate.source;
            if (!survivor.projectId && duplicate.projectId) updates.projectId = duplicate.projectId;
            if (!survivor.propertyId && duplicate.propertyId) updates.propertyId = duplicate.propertyId;
            if (!survivor.assignedToId && duplicate.assignedToId) updates.assignedToId = duplicate.assignedToId;
            
            let message = survivor.message || '';
            if (duplicate.message) {
                message = message ? `${message}\n\n[Merged from duplicate]: ${duplicate.message}` : duplicate.message;
                updates.message = message;
            }

            if (Object.keys(updates).length > 0) {
                await tx.lead.update({
                    where: { id: survivingLeadId },
                    data: updates
                });
            }

            // Move Activities
            await tx.leadActivity.updateMany({
                where: { leadId: duplicateLeadId },
                data: { leadId: survivingLeadId }
            });

            // Move Interests
            // Need to handle unique constraints - safely using ignore/delete would be best,
            // but for simplicity we'll just transfer and catch
            const duplicateInterests = await tx.leadInterest.findMany({ where: { leadId: duplicateLeadId } });
            for (const interest of duplicateInterests) {
                const exists = await tx.leadInterest.findFirst({
                    where: { leadId: survivingLeadId, propertyId: interest.propertyId }
                });
                if (!exists) {
                    await tx.leadInterest.create({
                        data: { leadId: survivingLeadId, propertyId: interest.propertyId }
                    });
                }
            }
            await tx.leadInterest.deleteMany({ where: { leadId: duplicateLeadId } });

            // Finally, delete the duplicate
            await tx.lead.delete({ where: { id: duplicateLeadId } });

            // Log activity
            await tx.leadActivity.create({
                data: {
                    organizationId,
                    leadId: survivingLeadId,
                    type: 'NOTE',
                    description: `Merged with duplicate lead ${duplicate.name} (${duplicateLeadId})`,
                    performedById: userId
                }
            });

            return { success: true, survivingLeadId };
        });
    }
}

module.exports = LeadService;
