const prisma = require('../db/prisma');
const { AppError } = require('../utils/errors');
const { PIPELINE_STAGES, groupToStatuses, groupToCanonicalStatus } = require('../constants/stageGroups');
const SiteVisitService = require('./siteVisitService');
const QuotationService = require('./quotationService');
const LocationService = require('./locationService');
const { normalizeConfig, extractBhk } = require('../utils/propertyRequirement');
const { canSeePII, maskContact } = require('../utils/pii');
const { audit, AUDIT_ACTIONS } = require('../utils/audit');
const { generatePublicToken, buildPublicPropertyUrl, publicAvailability } = require('../utils/publicLink');

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

const INELIGIBLE_CLAIM_STATUSES = ['BOOKED', 'LOST', 'CLOSED'];

function assignmentSourceForRole(role) {
    if (role === 'SALES_EXECUTIVE' || role === 'CHANNEL_PARTNER') return 'EMPLOYEE_ASSIGNED';
    if (role === 'SALES_MANAGER') return 'MANAGER_ASSIGNED';
    return 'ADMIN_ASSIGNED';
}

class LeadService {
    // Validates lead project/property references against the organization and keeps
    // the pair internally consistent (property must belong to the lead's project).
    // Returns ids where `undefined` means "leave unchanged".
    static async resolveInventoryRefs(db, payload, organizationId, existingLead = null) {
        const hasProject = Object.prototype.hasOwnProperty.call(payload, 'projectId');
        const hasProperty = Object.prototype.hasOwnProperty.call(payload, 'propertyId');
        let projectId = hasProject ? payload.projectId : undefined;
        let propertyId = hasProperty ? payload.propertyId : undefined;

        if (hasProject && projectId !== existingLead?.projectId && !hasProperty && existingLead?.propertyId) {
            const existingProperty = await db.property.findFirst({
                where: { id: existingLead.propertyId, organizationId },
                select: { id: true, projectId: true }
            });
            if (!existingProperty || existingProperty.projectId !== projectId) {
                propertyId = null;
            }
        }

        if (propertyId) {
            const property = await db.property.findFirst({
                where: { id: propertyId, organizationId },
                select: { id: true, projectId: true }
            });
            if (!property) throw new AppError('Property not found', 404, 'NOT_FOUND');
            if (projectId === undefined || projectId === null) {
                projectId = property.projectId;
            } else if (projectId !== property.projectId) {
                throw new AppError('Property does not belong to the selected project', 400, 'CROSS_PROJECT_REFERENCE');
            }
        }

        if (projectId === null) {
            if (propertyId === undefined) propertyId = null;
        } else if (projectId) {
            const project = await db.project.findFirst({
                where: { id: projectId, organizationId },
                select: { id: true }
            });
            if (!project) throw new AppError('Project not found', 404, 'NOT_FOUND');
        }

        return { projectId, propertyId };
    }

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

        // preferredLocations are relation rows handled by create/update directly.
        delete payload.preferredLocations;

        if (payload.budget !== undefined) {
            const parsed = parseBudget(payload.budget);
            if (parsed !== null) {
                payload.budget = parsed;
            } else {
                delete payload.budget;
            }
        }

        // Server-side PII masking guard: a masked value (e.g. +91******1234)
        // must never be written back to the database.
        if (typeof payload.phone === 'string' && payload.phone.includes('*')) {
            delete payload.phone;
        }
        if (typeof payload.email === 'string' && payload.email.includes('*')) {
            delete payload.email;
        }

        return payload;
    }

    // budgetMin/budgetMax are authoritative; the legacy single-value `budget`
    // column is kept in sync (= budgetMax ?? budgetMin) so old views/filters
    // keep working. Fields absent from the payload fall back to `existing`.
    static syncLegacyBudget(payload, existing = null) {
        const hasMin = Object.prototype.hasOwnProperty.call(payload, 'budgetMin');
        const hasMax = Object.prototype.hasOwnProperty.call(payload, 'budgetMax');
        if (!hasMin && !hasMax) return;

        const min = hasMin ? payload.budgetMin : (existing ? existing.budgetMin : null);
        const max = hasMax ? payload.budgetMax : (existing ? existing.budgetMax : null);

        const minNum = min === null || min === undefined ? null : Number(min);
        const maxNum = max === null || max === undefined ? null : Number(max);
        const value = maxNum !== null ? maxNum : minNum;
        payload.budget = value;
    }

    // Replaces all preferred-location rows for a lead with the validated rows
    // returned by LocationService.validateSelections.
    static async replacePreferredLocations(leadId, rows) {
        await prisma.$transaction(async (tx) => {
            await tx.leadPreferredLocation.deleteMany({ where: { leadId } });
            if (rows.length > 0) {
                await tx.leadPreferredLocation.createMany({
                    data: rows.map((row) => ({
                        leadId,
                        stateId: row.stateId,
                        districtId: row.districtId,
                        regionId: row.regionId
                    }))
                });
            }
        });
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
                    const refs = await SiteVisitService.resolveRefs(tx, payload.siteVisit, organizationId, lead);
                    const visitProjectId = refs.projectId || null;
                    const visitPropertyId = refs.propertyId || null;
                    await tx.siteVisit.create({
                        data: {
                            organizationId,
                            leadId: id,
                            leadName: lead.name,
                            phone: lead.phone,
                            propertyName: refs.propertyName || null,
                            projectId: visitProjectId,
                            propertyId: visitPropertyId,
                            date: new Date(payload.siteVisit.date),
                            time: payload.siteVisit.time,
                            status: 'SCHEDULED',
                            assignedToId: payload.siteVisit.assignedToId || lead.assignedToId || userId,
                        }
                    });
                    const linkLead = {};
                    if (!lead.projectId && visitProjectId) linkLead.projectId = visitProjectId;
                    if (!lead.propertyId && visitPropertyId) linkLead.propertyId = visitPropertyId;
                    if (Object.keys(linkLead).length > 0) {
                        await tx.lead.update({ where: { id }, data: linkLead });
                    }
                    await tx.leadActivity.create({
                        data: {
                            organizationId,
                            leadId: id,
                            type: 'SITE_VISIT',
                            description: `Site visit scheduled for ${payload.siteVisit.date} ${payload.siteVisit.time}`,
                            performedById: userId,
                            metadata: { date: payload.siteVisit.date, time: payload.siteVisit.time, projectId: visitProjectId, propertyId: visitPropertyId }
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
                    await QuotationService.validateInventoryRefs(payload.quotation, organizationId, lead, tx);
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
        const preferredLocations = Object.prototype.hasOwnProperty.call(data, 'preferredLocations') && data.preferredLocations
            ? data.preferredLocations
            : null;
        const locationRows = preferredLocations
            ? await LocationService.validateSelections(preferredLocations)
            : null;

        const payload = LeadService.normalizeLeadPayload(data);
        LeadService.syncLegacyBudget(payload, null);

        if (!payload.phone || String(payload.phone).includes('*')) {
            throw new AppError('A valid phone number is required', 400, 'VALIDATION_ERROR');
        }

        if (payload.status === 'BOOKED') {
            throw new AppError('Leads can only reach Booking via the booking conversion workflow', 409, 'TRANSITION_REQUIRES_BOOKING');
        }

        const refs = await LeadService.resolveInventoryRefs(prisma, payload, organizationId, null);
        if (refs.projectId !== undefined) payload.projectId = refs.projectId;
        if (refs.propertyId !== undefined) payload.propertyId = refs.propertyId;

        return await prisma.$transaction(async (tx) => {
            const lead = await tx.lead.create({
                data: {
                    ...payload,
                    organizationId,
                    createdById
                }
            });

            if (locationRows && locationRows.length > 0) {
                await tx.leadPreferredLocation.createMany({
                    data: locationRows.map((row) => ({
                        leadId: lead.id,
                        stateId: row.stateId,
                        districtId: row.districtId,
                        regionId: row.regionId
                    }))
                });
            }

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
                include: {
                    assignedTo: { select: { name: true } },
                    project: { select: { id: true, name: true } },
                    property: { select: { id: true, title: true, unitNumber: true } }
                }
            }),
            prisma.lead.count({ where })
        ]);

        return { leads: leads.map((l) => maskContact(l, userRole)), total, pages: Math.ceil(total / limit) };
    }

    // Counts leads that are currently assigned to the user because the user
    // self-claimed them (latest ASSIGNMENT activity metadata.source === 'SELF_CLAIMED').
    // Admin/manager-assigned leads never have that source, so they do not consume quota.
    static async countActiveSelfClaims(db, userId) {
        const rows = await db.$queryRaw`
            SELECT COUNT(*)::int AS count
            FROM "Lead" l
            WHERE l."assignedToId" = ${userId}
              AND l."status" NOT IN ('BOOKED', 'LOST', 'CLOSED')
              AND (
                  SELECT la."metadata" ->> 'source'
                  FROM "LeadActivity" la
                  WHERE la."leadId" = l."id" AND la."type" = 'ASSIGNMENT'
                  ORDER BY la."createdAt" DESC, la."id" DESC
                  LIMIT 1
              ) = 'SELF_CLAIMED'
        `;
        return rows?.[0]?.count ?? 0;
    }

    static async getClaimableLeads(organizationId, query, userRole, userId) {
        const { page = 1, limit = 12, search, sort = 'desc' } = query;
        const skip = (page - 1) * limit;

        const where = {
            organizationId,
            assignedToId: null,
            status: { notIn: INELIGIBLE_CLAIM_STATUSES }
        };
        if (search) {
            where.OR = [
                { name: { contains: search, mode: 'insensitive' } },
                { email: { contains: search, mode: 'insensitive' } },
                { phone: { contains: search } }
            ];
        }

        const [leads, total, claimant] = await Promise.all([
            prisma.lead.findMany({
                where,
                skip: parseInt(skip),
                take: parseInt(limit),
                orderBy: { createdAt: sort === 'asc' ? 'asc' : 'desc' },
                include: {
                    project: { select: { id: true, name: true } },
                    assignedTo: { select: { name: true } }
                }
            }),
            prisma.lead.count({ where }),
            prisma.user.findUnique({ where: { id: userId }, select: { selfClaimLimit: true } })
        ]);

        const claimLimit = claimant?.selfClaimLimit ?? 0;
        const claimed = await LeadService.countActiveSelfClaims(prisma, userId);
        const remaining = Math.max(0, claimLimit - claimed);

        return {
            leads: leads.map((l) => maskContact(l, userRole)),
            total,
            pages: Math.ceil(total / limit),
            claim: {
                limit: claimLimit,
                claimed,
                remaining,
                canClaim: remaining > 0
            }
        };
    }

    // Atomically self-claims an unassigned lead. Locks the claimant's user row so
    // the per-employee cap cannot be exceeded by concurrent claims, then assigns
    // the lead with a conditional update (count 0 => someone else won the race).
    static async claimLead(leadId, organizationId, userId) {
        return await prisma.$transaction(async (tx) => {
            const lead = await tx.lead.findFirst({
                where: { id: leadId, organizationId },
                select: { id: true, assignedToId: true, status: true }
            });
            if (!lead) throw new AppError('Lead not found', 404, 'NOT_FOUND');
            if (lead.assignedToId) {
                throw new AppError('Lead was already claimed by another employee.', 409, 'ALREADY_CLAIMED');
            }
            if (INELIGIBLE_CLAIM_STATUSES.includes(lead.status)) {
                throw new AppError('This lead is not eligible for self-claim.', 409, 'LEAD_NOT_ELIGIBLE');
            }

            const rows = await tx.$queryRaw`
                SELECT "id", "name", "status", "selfClaimLimit"
                FROM "User"
                WHERE "id" = ${userId} AND "organizationId" = ${organizationId}
                FOR UPDATE
            `;
            const claimant = rows?.[0];
            if (!claimant) throw new AppError('User not found', 404, 'NOT_FOUND');
            if (claimant.status !== 'ACTIVE') {
                throw new AppError('Only active employees can claim leads', 403, 'FORBIDDEN');
            }

            const claimLimit = claimant.selfClaimLimit ?? 0;
            if (claimLimit <= 0) {
                throw new AppError('Self-claiming is not enabled for your account', 403, 'SELF_CLAIM_NOT_ENABLED');
            }

            const claimed = await LeadService.countActiveSelfClaims(tx, userId);
            if (claimed >= claimLimit) {
                throw new AppError(`Self-claim limit reached (${claimed}/${claimLimit}).`, 409, 'SELF_CLAIM_LIMIT_REACHED');
            }

            const updated = await tx.lead.updateMany({
                where: {
                    id: leadId,
                    organizationId,
                    assignedToId: null,
                    status: { notIn: INELIGIBLE_CLAIM_STATUSES }
                },
                data: { assignedToId: userId }
            });
            if (updated.count === 0) {
                throw new AppError('Lead was already claimed by another employee.', 409, 'ALREADY_CLAIMED');
            }

            await tx.leadActivity.create({
                data: {
                    organizationId,
                    leadId,
                    type: 'ASSIGNMENT',
                    description: `Lead self-claimed by ${claimant.name}`,
                    performedById: userId,
                    metadata: { source: 'SELF_CLAIMED', previousAssignedToId: null }
                }
            });

            return await tx.lead.findFirst({
                where: { id: leadId },
                include: {
                    assignedTo: { select: { id: true, name: true } },
                    project: { select: { id: true, name: true, city: true } },
                    property: { select: { id: true, title: true, unitNumber: true, projectId: true } }
                }
            });
        });
    }

    static async getLeadById(id, organizationId, userRole, userId) {
        const lead = await prisma.lead.findFirst({
            where: { id, organizationId },
            include: {
                activities: { orderBy: { createdAt: 'desc' } },
                assignedTo: { select: { id: true, name: true } },
                project: { select: { id: true, name: true, city: true } },
                property: { select: { id: true, title: true, unitNumber: true, projectId: true } },
                preferredLocations: {
                    orderBy: { createdAt: 'asc' },
                    include: {
                        state: { select: { id: true, name: true } },
                        district: { select: { id: true, name: true } },
                        region: { select: { id: true, name: true } }
                    }
                },
                _count: { select: { siteVisits: true, quotations: true, activities: true } }
            }
        });

        if (!lead) return null;

        // Scope check
        if ((userRole === 'SALES_EXECUTIVE' || userRole === 'CHANNEL_PARTNER') && lead.assignedToId !== userId) {
            throw new AppError('You do not have access to this lead', 403, 'FORBIDDEN');
        }

        if (canSeePII(userRole)) {
            await audit(organizationId, userId, AUDIT_ACTIONS.PII_VIEWED, 'Lead', lead.id, { leadId: lead.id });
        }

        return maskContact(lead, userRole);
    }

    static async updateLead(id, data, organizationId, userRole, userId) {
        const preferredLocations = Object.prototype.hasOwnProperty.call(data, 'preferredLocations')
            ? data.preferredLocations
            : undefined;
        const locationRows = preferredLocations !== undefined
            ? await LocationService.validateSelections(preferredLocations || [])
            : null;

        const payload = LeadService.normalizeLeadPayload(data);

        const existing = await prisma.lead.findFirst({ where: { id, organizationId } });
        if (!existing) {
            throw new AppError('Lead not found', 404, 'NOT_FOUND');
        }

        if ((userRole === 'SALES_EXECUTIVE' || userRole === 'CHANNEL_PARTNER') && existing.assignedToId !== userId) {
            throw new AppError('You do not have access to update this lead', 403, 'FORBIDDEN');
        }

        LeadService.syncLegacyBudget(payload, existing);

        if (data.status && data.status !== existing.status) {
            const transitioned = await LeadService.transitionStage(id, data.status, data, organizationId, userRole, userId);
            if (locationRows !== null) {
                await LeadService.replacePreferredLocations(id, locationRows);
            }
            return transitioned;
        }

        const refs = await LeadService.resolveInventoryRefs(prisma, payload, organizationId, existing);
        if (refs.projectId !== undefined) payload.projectId = refs.projectId;
        if (refs.propertyId !== undefined) payload.propertyId = refs.propertyId;

        const updated = await prisma.lead.update({
            where: { id },
            data: payload
        });

        if (locationRows !== null) {
            await LeadService.replacePreferredLocations(id, locationRows);
        }

        if (payload.assignedToId && payload.assignedToId !== existing.assignedToId) {
            const assignee = await prisma.user.findFirst({
                where: { id: payload.assignedToId, organizationId },
                select: { name: true }
            });
            await prisma.leadActivity.create({
                data: {
                    organizationId,
                    leadId: id,
                    type: 'ASSIGNMENT',
                    description: `Lead reassigned to ${assignee ? assignee.name : 'user'}`,
                    performedById: userId,
                    metadata: {
                        source: assignmentSourceForRole(userRole),
                        previousAssignedToId: existing.assignedToId
                    }
                }
            });
        }

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
        const isUuid = (v) => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

        // Resolve public share references (opaque property token / project
        // slug) to internal IDs server-side — visitors never handle internal
        // inventory IDs. Unknown values are dropped, like invalid IDs.
        if (data.propertyToken && !isUuid(data.propertyId)) {
            const shared = await prisma.property.findFirst({
                where: { publicToken: data.propertyToken, organizationId: spaceezyOrgId },
                select: { id: true, projectId: true }
            });
            if (shared) {
                data = { ...data, propertyId: shared.id, projectId: data.projectId || shared.projectId };
            }
        }
        if (data.projectSlug) {
            const sharedProject = await prisma.project.findFirst({
                where: { publicSlug: data.projectSlug, organizationId: spaceezyOrgId },
                select: { id: true }
            });
            if (sharedProject) {
                data = { ...data, projectId: sharedProject.id };
            }
        }

        return await prisma.$transaction(async (tx) => {
            // Validate inventory references against the organization; drop invalid ones
            // instead of failing the public submission.
            let projectId = isUuid(data.projectId) ? data.projectId : null;
            let propertyId = isUuid(data.propertyId) ? data.propertyId : null;
            if (projectId) {
                const project = await tx.project.findFirst({ where: { id: projectId, organizationId: spaceezyOrgId }, select: { id: true } });
                if (!project) projectId = null;
            }
            if (propertyId) {
                const property = await tx.property.findFirst({ where: { id: propertyId, organizationId: spaceezyOrgId }, select: { id: true, projectId: true } });
                if (!property || (projectId && property.projectId !== projectId)) {
                    propertyId = null;
                } else if (!projectId) {
                    projectId = property.projectId;
                }
            }
            // Find existing lead by phone
            const existingLead = await tx.lead.findFirst({
                where: {
                    organizationId: spaceezyOrgId,
                    phone: phone
                }
            });

            let lead;
            
            if (existingLead) {
                const resolvedProjectId = projectId || existingLead.projectId;
                let resolvedPropertyId = propertyId || existingLead.propertyId;
                if (resolvedPropertyId && resolvedProjectId !== existingLead.projectId && !propertyId) {
                    resolvedPropertyId = null;
                }

                // Update relevant context but keep status unless it was LOST
                lead = await tx.lead.update({
                    where: { id: existingLead.id },
                    data: {
                        message: data.message ? `${existingLead.message || ''}\n\nNew Enquiry: ${data.message}` : existingLead.message,
                        projectId: resolvedProjectId,
                        propertyId: resolvedPropertyId,
                        status: existingLead.status === 'LOST' ? 'NEW' : existingLead.status
                    }
                });

                await tx.leadActivity.create({
                    data: {
                        organizationId: spaceezyOrgId,
                        leadId: lead.id,
                        type: 'NOTE',
                        description: `Duplicate enquiry received from website. Project: ${resolvedProjectId || 'N/A'}, Property: ${resolvedPropertyId || 'N/A'}`
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
                        projectId,
                        propertyId,
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
    // The preference's deepest selected level must be confirmed on the project:
    // canonical FKs win, legacy free-text columns are a name-equality fallback
    // for projects that are not yet linked to the location master.
    static locationMatches(pref, project) {
        if (!project) return false;

        const sameText = (a, b) => Boolean(a && b && String(a).trim().toLowerCase() === String(b).trim().toLowerCase());

        if (pref.regionId) {
            if (project.regionId) return project.regionId === pref.regionId;
            return Boolean(pref.region) && sameText(pref.region.name, project.locality);
        }

        if (pref.districtId) {
            if (project.districtId) return project.districtId === pref.districtId;
            return Boolean(pref.district) && sameText(pref.district.name, project.city);
        }

        if (project.stateId) return project.stateId === pref.stateId;
        return Boolean(pref.state) && sameText(pref.state.name, project.state);
    }

    static async getMatchingProperties(leadId, organizationId, userRole, userId) {
        const lead = await prisma.lead.findFirst({
            where: { id: leadId, organizationId },
            include: {
                preferredLocations: {
                    include: {
                        state: { select: { id: true, name: true } },
                        district: { select: { id: true, name: true } },
                        region: { select: { id: true, name: true } }
                    }
                }
            }
        });
        if (!lead) throw new AppError('Lead not found', 404, 'NOT_FOUND');

        if ((userRole === 'SALES_EXECUTIVE' || userRole === 'CHANNEL_PARTNER') && lead.assignedToId !== userId) {
            throw new AppError('You do not have access to this lead', 403, 'FORBIDDEN');
        }

        const where = { organizationId, status: 'AVAILABLE' };

        if (lead.projectId) {
            where.projectId = lead.projectId;
        }

        // Budget requirement. budgetMin/budgetMax are authoritative; the legacy
        // single-value budget (when the range is absent) only caps the maximum.
        const budgetMin = lead.budgetMin === null || lead.budgetMin === undefined ? null : Number(lead.budgetMin);
        const budgetMax = lead.budgetMax !== null && lead.budgetMax !== undefined
            ? Number(lead.budgetMax)
            : (lead.budget === null || lead.budget === undefined ? null : Number(lead.budget));
        if (budgetMin !== null || budgetMax !== null) {
            where.price = {};
            if (budgetMin !== null) where.price.gte = budgetMin;
            if (budgetMax !== null) where.price.lte = budgetMax;
        }

        // Property type: effective type = Property.type ?? Project.projectType
        // (Property.type is not populated yet, so projectType decides today).
        // Mixed_Use projects satisfy either requirement.
        if (lead.propertyType) {
            const allowedTypes = [lead.propertyType, 'Mixed_Use'];
            where.OR = [
                { type: { in: allowedTypes } },
                { type: null, project: { projectType: { in: allowedTypes } } }
            ];
        }

        const properties = await prisma.property.findMany({
            where,
            include: {
                project: {
                    select: {
                        id: true,
                        name: true,
                        address: true,
                        locality: true,
                        city: true,
                        state: true,
                        projectType: true,
                        stateId: true,
                        districtId: true,
                        regionId: true,
                        locationState: { select: { name: true } },
                        locationDistrict: { select: { name: true } },
                        locationRegion: { select: { name: true } }
                    }
                },
                config: { select: { id: true, name: true, bhk: true } }
            },
            orderBy: { price: 'asc' },
            take: 500
        });

        let candidates = properties;

        // Configuration requirement: canonical label match first, numeric BHK
        // equivalence as fallback ("2 BHK" matches a Property.bhk of 2).
        const wantedConfigs = lead.configurations || [];
        if (wantedConfigs.length > 0) {
            const labels = new Set(wantedConfigs.map(normalizeConfig));
            const bhkValues = new Set(wantedConfigs.map(extractBhk).filter((value) => value !== null));
            candidates = candidates.filter((property) => {
                const label = property.configuration || (property.config ? property.config.name : '');
                if (label && labels.has(normalizeConfig(label))) return true;
                if (property.bhk != null && bhkValues.has(property.bhk)) return true;
                return false;
            });
        }

        // Preferred locations: any selected hierarchy row may match; the deepest
        // selected level of each row must be confirmed on the project.
        const preferences = lead.preferredLocations || [];
        if (preferences.length > 0) {
            candidates = candidates.filter((property) =>
                preferences.some((pref) => LeadService.locationMatches(pref, property.project)));
        }

        const results = candidates.slice(0, 50);

        const interests = await prisma.leadInterest.findMany({
            where: { leadId },
            select: { propertyId: true }
        });
        const interestedIds = interests.map(i => i.propertyId);

        return results.map(p => ({
            ...p,
            isInterested: interestedIds.includes(p.id)
        }));
    }

    // Builds the authoritative WhatsApp proposal message for selected units from
    // database values (never from client-constructed text).
    static async buildPropertyProposal(leadId, propertyIds, organizationId, userRole, userId) {
        const lead = await prisma.lead.findFirst({
            where: { id: leadId, organizationId },
            select: { id: true, name: true, assignedToId: true }
        });
        if (!lead) throw new AppError('Lead not found', 404, 'NOT_FOUND');

        if ((userRole === 'SALES_EXECUTIVE' || userRole === 'CHANNEL_PARTNER') && lead.assignedToId !== userId) {
            throw new AppError('You do not have access to this lead', 403, 'FORBIDDEN');
        }

        const uniqueIds = [...new Set(propertyIds)];
        const properties = await prisma.property.findMany({
            where: { id: { in: uniqueIds }, organizationId },
            include: {
                project: {
                    select: {
                        name: true,
                        address: true,
                        locality: true,
                        city: true,
                        state: true,
                        locationState: { select: { name: true } },
                        locationDistrict: { select: { name: true } },
                        locationRegion: { select: { name: true } }
                    }
                },
                config: { select: { name: true, bhk: true } }
            }
        });

        if (properties.length !== uniqueIds.length) {
            throw new AppError('One of the selected units is no longer available', 404, 'NOT_FOUND');
        }

        const byId = new Map(properties.map((p) => [p.id, p]));
        const ordered = uniqueIds.map((id) => byId.get(id));

        const formatPrice = (value) => `₹${Math.round(Number(value)).toLocaleString('en-IN')}`;

        const locationOf = (property) => {
            const project = property.project;
            if (!project) return '—';
            const canonical = [
                project.locationRegion && project.locationRegion.name,
                project.locationDistrict && project.locationDistrict.name,
                project.locationState && project.locationState.name
            ].filter(Boolean);
            if (canonical.length > 0) return canonical.join(', ');
            const legacy = [project.locality, project.city, project.state].filter(Boolean);
            if (legacy.length > 0) return legacy.join(', ');
            return project.address || '—';
        };

        const unitLines = ordered.map((property) => {
            const project = property.project;
            const configuration = property.configuration || (property.config && property.config.name) || '—';
            const area = property.areaSaleable || property.area || null;
            return [
                `• ${project ? project.name : '—'} — ${configuration}`,
                `  Tower: ${property.tower || '—'} | Unit: ${property.unitNumber || '—'}${area ? ` | Area: ${area} sq.ft` : ''}`,
                `  Location: ${locationOf(property)}`,
                `  Price: ${property.price != null ? formatPrice(property.price) : 'On request'} | Availability: ${property.status}`
            ].join('\n');
        });

        const body = [
            `Hi ${lead.name}, based on your requirement, here ${ordered.length === 1 ? 'is' : 'are'} ${ordered.length} matching unit${ordered.length === 1 ? '' : 's'} from Spaceezy:`,
            '',
            unitLines.join('\n\n'),
            '',
            'Would you like to schedule a site visit?'
        ].join('\n');

        return { body, unitCount: ordered.length };
    }

    // Build the ready-made WhatsApp share message for one published unit. The
    // actual send still flows through the normal composer endpoint, so
    // permissions, provider delivery and timeline tracking stay intact.
    static async buildPropertyShare(leadId, propertyId, organizationId, userRole, userId) {
        const lead = await prisma.lead.findFirst({
            where: { id: leadId, organizationId },
            select: { id: true, name: true, assignedToId: true }
        });
        if (!lead) throw new AppError('Lead not found', 404, 'NOT_FOUND');

        if ((userRole === 'SALES_EXECUTIVE' || userRole === 'CHANNEL_PARTNER') && lead.assignedToId !== userId) {
            throw new AppError('You do not have access to this lead', 403, 'FORBIDDEN');
        }

        const property = await prisma.property.findFirst({
            where: { id: propertyId, organizationId },
            include: {
                project: {
                    select: {
                        name: true,
                        address: true,
                        locality: true,
                        city: true,
                        state: true,
                        isPublic: true,
                        status: true,
                        locationState: { select: { name: true } },
                        locationDistrict: { select: { name: true } },
                        locationRegion: { select: { name: true } }
                    }
                },
                config: { select: { name: true } }
            }
        });
        if (!property) throw new AppError('Property not found', 404, 'NOT_FOUND');

        // Sharing requires the unit AND its project to be published on the
        // public website (and the project not archived).
        if (!property.isPublic || !property.project.isPublic || property.project.status === 'INACTIVE') {
            throw new AppError(
                'Property is not published on the public website. Publish the project and the unit before sharing.',
                409,
                'PROPERTY_NOT_PUBLISHED'
            );
        }

        // Defensive: units created before the share feature get their token now.
        let token = property.publicToken;
        if (!token) {
            token = generatePublicToken();
            await prisma.property.update({ where: { id: property.id }, data: { publicToken: token } });
        }
        const publicUrl = buildPublicPropertyUrl(token);

        const employee = await prisma.user.findFirst({
            where: { id: userId },
            select: { name: true }
        });

        const formatPrice = (value) => `₹${Math.round(Number(value)).toLocaleString('en-IN')}`;

        const locationOf = (p) => {
            const project = p.project;
            if (!project) return '—';
            const canonical = [
                project.locationRegion && project.locationRegion.name,
                project.locationDistrict && project.locationDistrict.name,
                project.locationState && project.locationState.name
            ].filter(Boolean);
            if (canonical.length > 0) return canonical.join(', ');
            const legacy = [project.locality, project.city, project.state].filter(Boolean);
            if (legacy.length > 0) return legacy.join(', ');
            return project.address || '—';
        };

        const configuration = property.configuration || (property.config && property.config.name) || '—';
        const area = property.areaSaleable || property.area || property.areaCarpet || null;

        const body = [
            `Hi ${lead.name},`,
            '',
            'As discussed, here are the details of the property we shortlisted for you:',
            '',
            `🏢 ${property.project.name}`,
            `📍 ${locationOf(property)}`,
            `🏠 ${configuration}`,
            `📐 ${area ? `${area} sq.ft` : '—'}`,
            `💰 ${property.price != null ? formatPrice(property.price) : 'On request'}`,
            '',
            'View Property:',
            publicUrl,
            '',
            'Regards,',
            employee && employee.name ? employee.name : 'Team Spaceezy'
        ].join('\n');

        return {
            body,
            publicUrl,
            publicToken: token,
            property: {
                id: property.id,
                title: property.title,
                unitNumber: property.unitNumber,
                configuration,
                price: property.price != null ? Number(property.price) : null,
                availability: publicAvailability(property.status),
                projectName: property.project.name
            }
        };
    }

    static async addInterestedProperty(leadId, propertyId, organizationId, userRole, userId) {
        const lead = await prisma.lead.findFirst({ where: { id: leadId, organizationId } });
        if (!lead) throw new AppError('Lead not found', 404, 'NOT_FOUND');

        if ((userRole === 'SALES_EXECUTIVE' || userRole === 'CHANNEL_PARTNER') && lead.assignedToId !== userId) {
            throw new AppError('You do not have access to this lead', 403, 'FORBIDDEN');
        }

        const property = await prisma.property.findFirst({ where: { id: propertyId, organizationId } });
        if (!property) throw new AppError('Property not found', 404, 'NOT_FOUND');
        if (lead.projectId && property.projectId && property.projectId !== lead.projectId) {
            throw new AppError('Property does not belong to the lead project', 400, 'CROSS_PROJECT_REFERENCE');
        }

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

    static async removeInterestedProperty(leadId, propertyId, organizationId, userRole, userId) {
        const lead = await prisma.lead.findFirst({ where: { id: leadId, organizationId } });
        if (!lead) throw new AppError('Lead not found', 404, 'NOT_FOUND');

        if ((userRole === 'SALES_EXECUTIVE' || userRole === 'CHANNEL_PARTNER') && lead.assignedToId !== userId) {
            throw new AppError('You do not have access to this lead', 403, 'FORBIDDEN');
        }

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
            const assignmentSource = assignmentSourceForRole(userRole);
            for (const leadId of leadIds) {
                await tx.leadActivity.create({
                    data: {
                        organizationId,
                        leadId,
                        type: 'ASSIGNMENT',
                        description: `Lead reassigned to ${user.name}`,
                        performedById: userId,
                        metadata: { source: assignmentSource }
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
