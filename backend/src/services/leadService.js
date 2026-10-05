const prisma = require('../db/prisma');
const { AppError } = require('../utils/errors');
const { PIPELINE_STAGES, groupToStatuses, groupToCanonicalStatus } = require('../constants/stageGroups');

function parseBudget(value) {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value === 'number') return value;
    const str = String(value).trim().replace(/[₹,\s]/g, '');
    const match = str.match(/^([\d.]+)\s*(cr|crore|l|lakh|k|thousand)?$/i);
    if (!match) return null;
    const num = parseFloat(match[1]);
    if (isNaN(num)) return null;
    const unit = (match[2] || '').toLowerCase();
    if (unit === 'cr' || unit === 'crore') return num * 10000000;
    if (unit === 'l' || unit === 'lakh') return num * 100000;
    if (unit === 'k' || unit === 'thousand') return num * 1000;
    return num;
}

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
            payload.status = groupToCanonicalStatus(payload.stage) || payload.stage;
        }

        delete payload.stage;
        delete payload.project;

        if (payload.budget !== undefined) {
            const parsed = parseBudget(payload.budget);
            if (parsed !== null) {
                payload.budget = parsed;
            } else {
                delete payload.budget;
            }
        }

        return payload;
    }

    static buildLeadScope(role, userId, filters = {}) {
        const where = {};
        const isExecutive = role === 'SALES_EXECUTIVE' || role === 'CHANNEL_PARTNER';

        if (isExecutive) {
            where.assignedToId = userId;
        } else if (filters.assignedTo) {
            where.assignedToId = filters.assignedTo;
        }

        if (filters.projectId) where.projectId = filters.projectId;
        if (filters.source) where.source = filters.source;

        if (filters.from || filters.to) {
            where.createdAt = {};
            if (filters.from) where.createdAt.gte = new Date(filters.from);
            if (filters.to) where.createdAt.lt = new Date(filters.to);
        }

        if (filters.stage) {
            const statuses = groupToStatuses(filters.stage);
            if (statuses.length) where.status = { in: statuses };
        }

        if (filters.search) {
            const term = String(filters.search).trim();
            if (term) {
                where.OR = [
                    { name: { contains: term, mode: 'insensitive' } },
                    { phone: { contains: term } },
                    { email: { contains: term, mode: 'insensitive' } }
                ];
            }
        }

        return where;
    }

    static async transitionStage(id, target, payload = {}, organizationId, role, userId) {
        const validTargets = [...PIPELINE_STAGES, 'BOOKED', 'LOST', 'CLOSED'];
        if (!validTargets.includes(target)) {
            throw new AppError(`Invalid target stage: ${target}`, 422, 'VALIDATION_ERROR');
        }

        return await prisma.$transaction(async (tx) => {
            const lead = await tx.lead.findFirst({ where: { id, organizationId } });
            if (!lead) throw new AppError('Lead not found', 404, 'NOT_FOUND');

            if ((role === 'SALES_EXECUTIVE' || role === 'CHANNEL_PARTNER') && lead.assignedToId !== userId) {
                throw new AppError('You do not have access to update this lead', 403, 'FORBIDDEN');
            }

            if (groupToStatuses(target).includes(lead.status) || lead.status === target) {
                throw new AppError(`Lead is already in stage ${target}`, 409, 'SAME_STAGE');
            }

            if (target === 'BOOKING' || target === 'BOOKED') {
                throw new AppError('Leads can only reach Booking via the booking conversion workflow', 409, 'TRANSITION_REQUIRES_BOOKING');
            }

            if (lead.status === 'BOOKED' && target !== 'LOST' && target !== 'CLOSED') {
                throw new AppError('A booked lead can only leave the Booking stage via booking cancellation', 409, 'INVALID_TRANSITION');
            }

            if (target === 'SITE_VISIT') {
                const hasVisit = await tx.siteVisit.findFirst({
                    where: { leadId: id, status: { in: ['SCHEDULED', 'COMPLETED', 'NO_SHOW'] } }
                });
                if (!hasVisit) {
                    if (!payload.siteVisit || !payload.siteVisit.date || !payload.siteVisit.time) {
                        throw new AppError('Moving to Site Visit requires a scheduled visit', 409, 'TRANSITION_REQUIRES_SITE_VISIT');
                    }
                    await tx.siteVisit.create({
                        data: {
                            organizationId,
                            leadId: id,
                            leadName: lead.name,
                            phone: lead.phone,
                            propertyName: payload.siteVisit.propertyName || null,
                            date: new Date(payload.siteVisit.date),
                            time: payload.siteVisit.time,
                            status: 'SCHEDULED',
                            assignedToId: payload.siteVisit.assignedToId || lead.assignedToId || userId,
                        }
                    });
                    await tx.leadActivity.create({
                        data: {
                            organizationId,
                            leadId: id,
                            type: 'SITE_VISIT',
                            description: `Site visit scheduled for ${payload.siteVisit.date} ${payload.siteVisit.time}`,
                            performedById: userId,
                            metadata: { date: payload.siteVisit.date, time: payload.siteVisit.time }
                        }
                    });
                }
            }

            if (target === 'QUOTATION') {
                const hasQuotation = await tx.quotation.findFirst({
                    where: { leadId: id, status: { in: ['DRAFT', 'SENT', 'ACCEPTED'] } }
                });
                if (!hasQuotation) {
                    if (!payload.quotation || !payload.quotation.projectId || !payload.quotation.totalAmount) {
                        throw new AppError('Moving to Quotation requires a quotation', 409, 'TRANSITION_REQUIRES_QUOTATION');
                    }
                    await tx.quotation.create({
                        data: {
                            organizationId,
                            leadId: id,
                            projectId: payload.quotation.projectId,
                            propertyId: payload.quotation.propertyId || null,
                            totalAmount: payload.quotation.totalAmount,
                            validUntil: payload.quotation.validUntil ? new Date(payload.quotation.validUntil) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
                            status: 'SENT',
                            notes: payload.quotation.notes || null,
                            createdById: userId,
                        }
                    });
                    await tx.leadActivity.create({
                        data: {
                            organizationId,
                            leadId: id,
                            type: 'NOTE',
                            description: `Quotation created for project ${payload.quotation.projectId}`,
                            performedById: userId,
                            metadata: { projectId: payload.quotation.projectId, totalAmount: payload.quotation.totalAmount }
                        }
                    });
                }
            }

            if (target === 'FOLLOW_UP') {
                const hasTask = await tx.task.findFirst({
                    where: { leadId: id, type: 'FOLLOW_UP', status: 'PENDING' }
                });
                if (!hasTask) {
                    if (!payload.followUp || !payload.followUp.dueDate) {
                        throw new AppError('Moving to Follow-up requires a follow-up date', 409, 'TRANSITION_REQUIRES_FOLLOW_UP');
                    }
                    const dueDate = new Date(payload.followUp.dueDate);
                    await tx.task.create({
                        data: {
                            organizationId,
                            leadId: id,
                            type: 'FOLLOW_UP',
                            status: 'PENDING',
                            dueDate,
                            title: payload.followUp.title || 'Follow-up',
                            description: payload.followUp.notes || null,
                            assignedToId: payload.followUp.assignedToId || lead.assignedToId || userId,
                        }
                    });
                    await tx.lead.update({ where: { id }, data: { nextFollowUpAt: dueDate } });
                    await tx.leadActivity.create({
                        data: {
                            organizationId,
                            leadId: id,
                            type: 'FOLLOW_UP',
                            description: `Follow-up scheduled for ${dueDate.toISOString()}`,
                            performedById: userId,
                            metadata: { dueDate: dueDate.toISOString() }
                        }
                    });
                }
            }

            const updated = await tx.lead.update({
                where: { id },
                data: { status: target }
            });

            await tx.leadActivity.create({
                data: {
                    organizationId,
                    leadId: id,
                    type: 'STATUS_CHANGE',
                    description: `Stage changed from ${lead.status} to ${target}`,
                    performedById: userId,
                    metadata: { from: lead.status, to: target, reason: payload.reason || null }
                }
            });

            return updated;
        });
    }

    static async logContact(id, data = {}, organizationId, role, userId) {
        const channel = data.channel || 'MANUAL';
        const typeMap = { CALL: 'CALL', EMAIL: 'EMAIL', WHATSAPP: 'NOTE', MANUAL: 'NOTE' };
        const type = typeMap[channel] || 'NOTE';

        return await prisma.$transaction(async (tx) => {
            const lead = await tx.lead.findFirst({ where: { id, organizationId } });
            if (!lead) throw new AppError('Lead not found', 404, 'NOT_FOUND');

            if ((role === 'SALES_EXECUTIVE' || role === 'CHANNEL_PARTNER') && lead.assignedToId !== userId) {
                throw new AppError('You do not have access to update this lead', 403, 'FORBIDDEN');
            }

            await tx.leadActivity.create({
                data: {
                    organizationId,
                    leadId: id,
                    type,
                    description: data.notes || `Contact logged via ${channel}`,
                    performedById: userId,
                    metadata: { channel, duration: data.duration || null, notes: data.notes || null }
                }
            });

            if (lead.status === 'NEW') {
                await tx.lead.update({ where: { id }, data: { status: 'CONTACTED' } });
                await tx.leadActivity.create({
                    data: {
                        organizationId,
                        leadId: id,
                        type: 'STATUS_CHANGE',
                        description: 'Stage changed from NEW to CONTACTED',
                        performedById: userId,
                        metadata: { from: 'NEW', to: 'CONTACTED', reason: 'contact logged' }
                    }
                });
            }

            return await tx.lead.findUnique({ where: { id } });
        });
    }

    static async scheduleFollowUp(id, data = {}, organizationId, role, userId) {
        if (!data.dueDate) throw new AppError('dueDate is required', 422, 'VALIDATION_ERROR');

        return await prisma.$transaction(async (tx) => {
            const lead = await tx.lead.findFirst({ where: { id, organizationId } });
            if (!lead) throw new AppError('Lead not found', 404, 'NOT_FOUND');

            if ((role === 'SALES_EXECUTIVE' || role === 'CHANNEL_PARTNER') && lead.assignedToId !== userId) {
                throw new AppError('You do not have access to update this lead', 403, 'FORBIDDEN');
            }

            const dueDate = new Date(data.dueDate);
            const task = await tx.task.create({
                data: {
                    organizationId,
                    leadId: id,
                    type: 'FOLLOW_UP',
                    status: 'PENDING',
                    dueDate,
                    title: data.title || 'Follow-up',
                    description: data.notes || null,
                    assignedToId: data.assignedToId || lead.assignedToId || userId,
                }
            });

            await tx.lead.update({ where: { id }, data: { nextFollowUpAt: dueDate } });

            await tx.leadActivity.create({
                data: {
                    organizationId,
                    leadId: id,
                    type: 'FOLLOW_UP',
                    description: `Follow-up scheduled for ${dueDate.toISOString()}`,
                    performedById: userId,
                    metadata: { taskId: task.id, dueDate: dueDate.toISOString() }
                }
            });

            if (lead.status === 'NEW' || lead.status === 'CONTACTED') {
                await tx.lead.update({ where: { id }, data: { status: 'FOLLOW_UP' } });
                await tx.leadActivity.create({
                    data: {
                        organizationId,
                        leadId: id,
                        type: 'STATUS_CHANGE',
                        description: `Stage changed from ${lead.status} to FOLLOW_UP`,
                        performedById: userId,
                        metadata: { from: lead.status, to: 'FOLLOW_UP', reason: 'follow-up scheduled' }
                    }
                });
            }

            return task;
        });
    }

    static async createLead(data = {}, organizationId, createdById = null) {
        const payload = LeadService.normalizeLeadPayload(data);

        if (payload.status === 'BOOKED') {
            throw new AppError('Leads can only reach Booking via the booking conversion workflow', 409, 'TRANSITION_REQUIRES_BOOKING');
        }

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
        const { page = 1, limit = 10, search, status, source, assignedTo, sort = 'desc', projectId, from, to, stage } = query;
        const skip = (page - 1) * limit;

        const where = { organizationId, ...LeadService.buildLeadScope(userRole, userId, { assignedTo, projectId, from, to, stage }) };

        if (status) where.status = status;
        if (source) where.source = source;
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

        const existing = await prisma.lead.findFirst({ where: { id, organizationId } });
        if (!existing) {
            throw new AppError('Lead not found', 404, 'NOT_FOUND');
        }

        if ((userRole === 'SALES_EXECUTIVE' || userRole === 'CHANNEL_PARTNER') && existing.assignedToId !== userId) {
            throw new AppError('You do not have access to update this lead', 403, 'FORBIDDEN');
        }

        if (data.status && data.status !== existing.status) {
            return await LeadService.transitionStage(id, data.status, data, organizationId, userRole, userId);
        }

        const updated = await prisma.lead.update({
            where: { id },
            data: payload
        });

        return updated;
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

    static async getFollowups(organizationId, query, userRole, userId) {
        const { status, limit = 50 } = query;
        const where = {
            organizationId,
            type: 'FOLLOW_UP',
            ...LeadService.buildLeadScope(userRole, userId, {}),
        };
        if (status) where.status = status;

        const tasks = await prisma.task.findMany({
            where,
            take: parseInt(limit),
            orderBy: { dueDate: 'asc' },
            include: {
                lead: { select: { name: true } },
                assignedTo: { select: { name: true } }
            }
        });

        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        const todayEnd = todayStart + 24 * 60 * 60 * 1000;

        return tasks.map(t => {
            let dueBucket = 'UPCOMING';
            if (t.status === 'COMPLETED') {
                dueBucket = 'COMPLETED';
            } else if (t.status === 'CANCELLED') {
                dueBucket = 'CANCELLED';
            } else {
                const due = new Date(t.dueDate).getTime();
                if (due < todayStart) dueBucket = 'OVERDUE';
                else if (due < todayEnd) dueBucket = 'DUE_TODAY';
            }

            return {
                id: t.id,
                refName: t.lead?.name || 'Unknown',
                type: t.type,
                dueDate: t.dueDate.toISOString().slice(0, 10),
                notes: t.description || t.title,
                status: t.status,
                dueBucket,
                assignedTo: t.assignedTo?.name || null,
            };
        });
    }

    static async toggleFollowupStatus(taskId, organizationId) {
        const task = await prisma.task.findFirst({
            where: { id: taskId, organizationId }
        });

        if (!task) throw new AppError('Follow-up not found', 404, 'NOT_FOUND');

        const newStatus = task.status === 'COMPLETED' ? 'PENDING' : 'COMPLETED';

        const updated = await prisma.task.update({
            where: { id: taskId },
            data: { status: newStatus }
        });

        return updated;
    }

    // --- Activities feed ---

    static async getActivities(organizationId, query, userRole, userId) {
        const { limit = 50, from, to } = query;

        const where = { organizationId };

        if (userRole === 'SALES_EXECUTIVE' || userRole === 'CHANNEL_PARTNER') {
            where.lead = { assignedToId: userId };
        }

        if (from || to) {
            where.createdAt = {};
            if (from) where.createdAt.gte = new Date(from);
            if (to) where.createdAt.lt = new Date(to);
        }

        const activities = await prisma.leadActivity.findMany({
            where,
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

    static async bulkAssignLeads(leadIds, assignedToId, organizationId, userId, userRole = 'ADMIN') {
        if (!Array.isArray(leadIds) || leadIds.length === 0) {
            throw new AppError('No leads selected', 400, 'BAD_REQUEST');
        }

        const user = await prisma.user.findFirst({
            where: { id: assignedToId, organizationId }
        });

        if (!user) throw new AppError('Assignee not found', 404, 'NOT_FOUND');
        if (user.status !== 'ACTIVE') throw new AppError('Cannot assign leads to an inactive user', 400, 'BAD_REQUEST');

        const isRestrictedRole = ['SALES_EXECUTIVE', 'CHANNEL_PARTNER'].includes(userRole);

        return await prisma.$transaction(async (tx) => {
            const leads = await tx.lead.findMany({
                where: {
                    id: { in: leadIds },
                    organizationId
                },
                select: { id: true, assignedToId: true }
            });

            const foundIds = new Set(leads.map(l => l.id));
            const missing = leadIds.filter(id => !foundIds.has(id));
            if (missing.length > 0) {
                throw new AppError(`Lead(s) not found or out of scope: ${missing.join(', ')}`, 404, 'NOT_FOUND');
            }

            if (isRestrictedRole && leads.some(l => l.assignedToId !== userId)) {
                throw new AppError('You do not have access to one or more selected leads', 403, 'FORBIDDEN');
            }

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

    static async mergeLeads(survivingLeadId, duplicateLeadId, organizationId, userId, userRole = 'ADMIN') {
        if (survivingLeadId === duplicateLeadId) throw new AppError('Cannot merge a lead into itself', 400, 'BAD_REQUEST');

        return await prisma.$transaction(async (tx) => {
            const survivor = await tx.lead.findFirst({ where: { id: survivingLeadId, organizationId } });
            const duplicate = await tx.lead.findFirst({ where: { id: duplicateLeadId, organizationId } });

            if (!survivor || !duplicate) throw new AppError('Lead(s) not found', 404, 'NOT_FOUND');

            if (['SALES_EXECUTIVE', 'CHANNEL_PARTNER'].includes(userRole) &&
                (survivor.assignedToId !== userId || duplicate.assignedToId !== userId)) {
                throw new AppError('You do not have access to one or more selected leads', 403, 'FORBIDDEN');
            }

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
