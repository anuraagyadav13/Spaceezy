const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { AppError } = require('../utils/errors');

class LeadService {
    static async createLead(data, organizationId, createdById = null) {
        return await prisma.$transaction(async (tx) => {
            const lead = await tx.lead.create({
                data: {
                    ...data,
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
                data
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
}

module.exports = LeadService;
