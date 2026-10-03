const prisma = require('../db/prisma');
const { AppError } = require('../utils/errors');

class PropertyService {
    static parseCurrencyValue(value) {
        if (value === null || value === undefined || value === '') return 0;

        const input = String(value).replace(/,/g, '').trim();
        const normalized = input.toLowerCase();

        if (!Number.isNaN(Number(input))) {
            return Number(input);
        }

        if (normalized.includes('cr')) {
            const numeric = Number(input.replace(/[^0-9.]/g, '')) || 0;
            return numeric * 10000000;
        }

        if (normalized.includes('l')) {
            const numeric = Number(input.replace(/[^0-9.]/g, '')) || 0;
            return numeric * 100000;
        }

        if (normalized.includes('k')) {
            const numeric = Number(input.replace(/[^0-9.]/g, '')) || 0;
            return numeric * 1000;
        }

        return Number(input.replace(/[^0-9.-]/g, '')) || 0;
    }

    static normalizePropertyPayload(data = {}) {
        const payload = { ...data };

        if (!payload.title && payload.name) {
            payload.title = payload.name;
        }

        if (!payload.projectId && payload.project) {
            payload.projectId = payload.project;
        }

        if (payload.status) {
            const normalizedStatus = String(payload.status).trim().toUpperCase();
            const statusMap = {
                AVAILABLE: 'AVAILABLE',
                RESERVED: 'RESERVED',
                SOLD: 'SOLD',
                'FULLY OCCUPIED': 'RESERVED',
                'PRE-LAUNCH': 'AVAILABLE',
                'UNDER_CONSTRUCTION': 'AVAILABLE',
                'RENOVATING': 'RESERVED'
            };
            payload.status = statusMap[normalizedStatus] || normalizedStatus;
        }

        if (payload.price !== undefined && payload.price !== null) {
            payload.price = PropertyService.parseCurrencyValue(payload.price);
        }

        if (payload.bhk !== undefined && payload.bhk !== null && typeof payload.bhk === 'string') {
            payload.bhk = Number(payload.bhk);
        }

        if (payload.area !== undefined && payload.area !== null && typeof payload.area === 'string') {
            payload.area = Number(payload.area);
        }

        const areaFields = ['areaCarpet', 'areaSaleable', 'areaBuiltUp', 'areaProject', 'areaCovered', 'areaTerrace'];
        areaFields.forEach(field => {
            if (payload[field] !== undefined && payload[field] !== null && typeof payload[field] === 'string') {
                payload[field] = Number(payload[field]) || null;
            }
        });

        if (payload.floor !== undefined && payload.floor !== null && typeof payload.floor === 'string') {
            payload.floor = Number(payload.floor);
        }

        delete payload.name;
        delete payload.address;
        delete payload.project;
        delete payload.category;

        return payload;
    }

    static async getProperties(organizationId, query) {
        const { page = 1, limit = 10, search, status, minPrice, maxPrice, bhk, sort = 'desc' } = query;
        const skip = (page - 1) * limit;

        const where = { organizationId };
        
        if (status) where.status = status;
        if (bhk) where.bhk = parseInt(bhk);
        if (minPrice || maxPrice) {
            where.price = {};
            if (minPrice) where.price.gte = parseFloat(minPrice);
            if (maxPrice) where.price.lte = parseFloat(maxPrice);
        }
        if (search) {
            where.OR = [
                { title: { contains: search, mode: 'insensitive' } },
                { unitNumber: { contains: search, mode: 'insensitive' } }
            ];
        }

        const [properties, total] = await Promise.all([
            prisma.property.findMany({
                where,
                skip: parseInt(skip),
                take: parseInt(limit),
                orderBy: { createdAt: sort === 'asc' ? 'asc' : 'desc' },
                include: { project: { select: { name: true } } }
            }),
            prisma.property.count({ where })
        ]);

        return { properties, total, pages: Math.ceil(total / limit) };
    }

    static async getPropertiesForProject(projectId, organizationId, query) {
        const { page = 1, limit = 10, search, status, minPrice, maxPrice, bhk, sort = 'desc' } = query;
        const skip = (page - 1) * limit;

        const where = { projectId, organizationId };
        
        if (status) where.status = status;
        if (bhk) where.bhk = parseInt(bhk);
        if (minPrice || maxPrice) {
            where.price = {};
            if (minPrice) where.price.gte = parseFloat(minPrice);
            if (maxPrice) where.price.lte = parseFloat(maxPrice);
        }
        if (search) {
            where.OR = [
                { title: { contains: search, mode: 'insensitive' } },
                { unitNumber: { contains: search, mode: 'insensitive' } }
            ];
        }

        const [properties, total] = await Promise.all([
            prisma.property.findMany({
                where,
                skip: parseInt(skip),
                take: parseInt(limit),
                orderBy: { createdAt: sort === 'asc' ? 'asc' : 'desc' }
            }),
            prisma.property.count({ where })
        ]);

        return { properties, total, pages: Math.ceil(total / limit) };
    }

    static async getPropertyById(id, organizationId) {
        const property = await prisma.property.findFirst({
            where: { id, organizationId },
            include: { project: { select: { id: true, name: true, type: true } } }
        });

        if (!property) throw new AppError('Property not found', 404, 'NOT_FOUND');
        return property;
    }

    static async createProperty(data, organizationId) {
        const payload = PropertyService.normalizePropertyPayload(data);

        // Validate project belongs to organization
        const project = await prisma.project.findFirst({
            where: { id: payload.projectId, organizationId }
        });
        if (!project) throw new AppError('Project not found or unauthorized', 404, 'NOT_FOUND');

        return await prisma.property.create({
            data: {
                ...payload,
                organizationId
            }
        });
    }

    static async updateProperty(id, data, organizationId) {
        const payload = PropertyService.normalizePropertyPayload(data);
        const existing = await prisma.property.findFirst({ where: { id, organizationId } });
        if (!existing) throw new AppError('Property not found', 404, 'NOT_FOUND');

        // Optimistic locking preservation - do not allow arbitrary status transition by client
        // This is simplified, actual logic for status transition (e.g. reserving a unit) should 
        // be handled via specific booking/reservation workflows.
        if (payload.status && payload.status !== existing.status) {
            if (existing.status === 'SOLD') {
                throw new AppError('Cannot modify status of a sold property directly', 400, 'BAD_REQUEST');
            }
        }

        return await prisma.property.update({
            where: { id },
            data: {
                ...payload,
                version: { increment: 1 } // Optimistic locking increment
            }
        });
    }

    static async deleteProperty(id, organizationId) {
        const existing = await prisma.property.findFirst({ where: { id, organizationId } });
        if (!existing) throw new AppError('Property not found', 404, 'NOT_FOUND');

        if (existing.status !== 'AVAILABLE') {
            throw new AppError('Cannot delete a property that is reserved or sold', 400, 'BAD_REQUEST');
        }

        await prisma.property.delete({ where: { id } });
        return true;
    }
}

module.exports = PropertyService;
