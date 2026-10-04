const prisma = require('../db/prisma');
const { AppError } = require('../utils/errors');

const EARLIER_STAGES = ['NEW', 'CONTACTED', 'FOLLOW_UP', 'SITE_VISIT', 'INTERESTED', 'QUALIFIED', 'NEGOTIATION'];

class QuotationService {
    static async getQuotations(organizationId, query, role, userId) {
        const { page = 1, limit = 20, leadId, status, sort = 'desc' } = query;
        const skip = (page - 1) * limit;

        const where = { organizationId };

        if (role === 'SALES_EXECUTIVE' || role === 'CHANNEL_PARTNER') {
            where.lead = { assignedToId: userId };
        }
        if (leadId) where.leadId = leadId;
        if (status) where.status = status;

        const [quotations, total] = await Promise.all([
            prisma.quotation.findMany({
                where,
                skip: parseInt(skip),
                take: parseInt(limit),
                orderBy: { createdAt: sort === 'asc' ? 'asc' : 'desc' },
                include: {
                    lead: { select: { id: true, name: true, phone: true, status: true } },
                    project: { select: { id: true, name: true } },
                    property: { select: { id: true, title: true, unitNumber: true } },
                    createdBy: { select: { id: true, name: true } }
                }
            }),
            prisma.quotation.count({ where })
        ]);

        return { quotations, total, pages: Math.ceil(total / limit) };
    }

    static async getQuotationById(id, organizationId) {
        const quotation = await prisma.quotation.findFirst({
            where: { id, organizationId },
            include: {
                lead: { select: { id: true, name: true, phone: true, status: true } },
                project: { select: { id: true, name: true } },
                property: { select: { id: true, title: true, unitNumber: true } },
                createdBy: { select: { id: true, name: true } }
            }
        });
        if (!quotation) throw new AppError('Quotation not found', 404, 'NOT_FOUND');
        return quotation;
    }

    static async createQuotation(data, organizationId, userId) {
        const lead = await prisma.lead.findFirst({ where: { id: data.leadId, organizationId } });
        if (!lead) throw new AppError('Lead not found', 404, 'NOT_FOUND');

        const project = await prisma.project.findFirst({ where: { id: data.projectId, organizationId } });
        if (!project) throw new AppError('Project not found', 404, 'NOT_FOUND');

        if (data.propertyId) {
            const property = await prisma.property.findFirst({ where: { id: data.propertyId, organizationId } });
            if (!property) throw new AppError('Property not found', 404, 'NOT_FOUND');
        }

        return await prisma.$transaction(async (tx) => {
            const quotation = await tx.quotation.create({
                data: {
                    organizationId,
                    leadId: data.leadId,
                    projectId: data.projectId,
                    propertyId: data.propertyId || null,
                    totalAmount: data.totalAmount,
                    validUntil: data.validUntil ? new Date(data.validUntil) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
                    status: data.status || 'DRAFT',
                    notes: data.notes || null,
                    createdById: userId
                },
                include: {
                    lead: { select: { id: true, name: true } },
                    project: { select: { id: true, name: true } }
                }
            });

            await tx.leadActivity.create({
                data: {
                    organizationId,
                    leadId: data.leadId,
                    type: 'NOTE',
                    description: `Quotation created (${quotation.status})`,
                    performedById: userId,
                    metadata: { quotationId: quotation.id, totalAmount: quotation.totalAmount, status: quotation.status }
                }
            });

            if (quotation.status === 'SENT') {
                await QuotationService.advanceLeadToQuotation(tx, lead, userId, organizationId);
            }

            return quotation;
        });
    }

    static async updateQuotationStatus(id, status, organizationId, userId) {
        const allowed = ['DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED'];
        if (!allowed.includes(status)) throw new AppError('Invalid quotation status', 422, 'VALIDATION_ERROR');

        return await prisma.$transaction(async (tx) => {
            const quotation = await tx.quotation.findFirst({ where: { id, organizationId } });
            if (!quotation) throw new AppError('Quotation not found', 404, 'NOT_FOUND');

            const updated = await tx.quotation.update({
                where: { id },
                data: { status }
            });

            await tx.leadActivity.create({
                data: {
                    organizationId,
                    leadId: quotation.leadId,
                    type: 'NOTE',
                    description: `Quotation ${status.toLowerCase()}`,
                    performedById: userId,
                    metadata: { quotationId: quotation.id, status }
                }
            });

            if (status === 'SENT') {
                const lead = await tx.lead.findFirst({ where: { id: quotation.leadId } });
                if (lead) await QuotationService.advanceLeadToQuotation(tx, lead, userId, organizationId);
            }

            return updated;
        });
    }

    static async advanceLeadToQuotation(tx, lead, userId, organizationId) {
        if (!EARLIER_STAGES.includes(lead.status)) return;

        await tx.lead.update({ where: { id: lead.id }, data: { status: 'QUOTATION' } });
        await tx.leadActivity.create({
            data: {
                organizationId,
                leadId: lead.id,
                type: 'STATUS_CHANGE',
                description: `Stage changed from ${lead.status} to QUOTATION`,
                performedById: userId,
                metadata: { from: lead.status, to: 'QUOTATION', reason: 'quotation sent' }
            }
        });
    }
}

module.exports = QuotationService;
