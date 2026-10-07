const prisma = require('../db/prisma');
const { AppError } = require('../utils/errors');
const { generatePublicToken } = require('../utils/publicLink');

const AREA_FIELDS = ['area', 'areaCarpet', 'areaSaleable', 'areaBuiltUp', 'areaProject', 'areaCovered', 'areaTerrace'];

// Unit fields a client may set on create (mass-assignment protection).
// `status` is forced to AVAILABLE by the service; `type` is intentionally
// excluded (derived from Project, not client input); ids/org never writable.
// `publicToken` is server-generated only — never client-writable.
const CREATE_FIELDS = [
    'title', 'unitNumber', 'configuration', 'configurationId', 'purpose', 'tower',
    'bhk', 'floor', 'facing', 'price', 'featured', 'images', 'amenities',
    'isPublic',
    ...AREA_FIELDS
];

// `status` added for updates (validated against the transition whitelist).
const UPDATE_FIELDS = [...CREATE_FIELDS, 'configuration', 'status'];

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

        if (payload.price !== undefined && payload.price !== null && payload.price !== '') {
            payload.price = PropertyService.parseCurrencyValue(payload.price);
        }

        if (payload.bhk !== undefined && payload.bhk !== null && typeof payload.bhk === 'string') {
            payload.bhk = Number(payload.bhk);
        }

        if (payload.floor !== undefined && payload.floor !== null && typeof payload.floor === 'string') {
            payload.floor = Number(payload.floor);
        }

        AREA_FIELDS.forEach(field => {
            if (payload[field] !== undefined && payload[field] !== null && typeof payload[field] === 'string') {
                payload[field] = Number(payload[field]) || null;
            }
            // Prisma Int columns — reject negative, round floats
            if (typeof payload[field] === 'number') {
                payload[field] = payload[field] >= 0 ? Math.round(payload[field]) : null;
            }
        });

        // Empty unit number must be NULL — "" would collide on the
        // (projectId, unitNumber) unique constraint.
        if (payload.unitNumber === '') {
            payload.unitNumber = null;
        }

        delete payload.name;
        delete payload.address;
        delete payload.project;
        delete payload.category;

        return payload;
    }

    static pickFields(payload, fields) {
        const out = {};
        for (const field of fields) {
            if (payload[field] !== undefined) out[field] = payload[field];
        }
        return out;
    }

    static buildWhere(organizationId, query = {}) {
        const { search, status, projectId, configurationId, tower, purpose, floor, minPrice, maxPrice, bhk } = query;
        const where = { organizationId };

        if (status) where.status = status;
        if (projectId) where.projectId = projectId;
        if (configurationId) where.configurationId = configurationId;
        if (tower) where.tower = { equals: tower, mode: 'insensitive' };
        if (purpose) where.purpose = { equals: purpose, mode: 'insensitive' };
        if (floor !== undefined && floor !== null && floor !== '') where.floor = parseInt(floor, 10);
        if (bhk) where.bhk = parseInt(bhk);

        if (minPrice || maxPrice) {
            where.price = {};
            if (minPrice) where.price.gte = parseFloat(minPrice);
            if (maxPrice) where.price.lte = parseFloat(maxPrice);
        }

        if (search) {
            where.OR = [
                { title: { contains: search, mode: 'insensitive' } },
                { unitNumber: { contains: search, mode: 'insensitive' } },
                { configuration: { contains: search, mode: 'insensitive' } },
                { tower: { contains: search, mode: 'insensitive' } }
            ];
        }

        return where;
    }

    static listInclude() {
        return {
            project: { select: { id: true, name: true, projectType: true, city: true } },
            config: { select: { id: true, name: true, basePrice: true } }
        };
    }

    static async getProperties(organizationId, query) {
        const { page = 1, limit = 10, sort = 'desc' } = query;
        const skip = (page - 1) * limit;
        const where = PropertyService.buildWhere(organizationId, query);

        const [properties, total] = await Promise.all([
            prisma.property.findMany({
                where,
                skip: parseInt(skip),
                take: parseInt(limit),
                orderBy: { createdAt: sort === 'asc' ? 'asc' : 'desc' },
                include: PropertyService.listInclude()
            }),
            prisma.property.count({ where })
        ]);

        return { properties, total, pages: Math.ceil(total / limit) };
    }

    static async getPropertiesForProject(projectId, organizationId, query) {
        const { page = 1, limit = 10, sort = 'desc' } = query;
        const skip = (page - 1) * limit;
        const where = { ...PropertyService.buildWhere(organizationId, query), projectId };

        const [properties, total] = await Promise.all([
            prisma.property.findMany({
                where,
                skip: parseInt(skip),
                take: parseInt(limit),
                orderBy: { createdAt: sort === 'asc' ? 'asc' : 'desc' },
                include: PropertyService.listInclude()
            }),
            prisma.property.count({ where })
        ]);

        return { properties, total, pages: Math.ceil(total / limit) };
    }

    static async getPropertyById(id, organizationId) {
        const property = await prisma.property.findFirst({
            where: { id, organizationId },
            include: {
                project: { select: { id: true, name: true, projectType: true } },
                config: { select: { id: true, name: true, basePrice: true } }
            }
        });

        if (!property) throw new AppError('Property not found', 404, 'NOT_FOUND');
        return property;
    }

    static async assertProject(projectId, organizationId) {
        const project = await prisma.project.findFirst({
            where: { id: projectId, organizationId },
            select: { id: true, name: true }
        });
        if (!project) throw new AppError('Project not found or unauthorized', 404, 'NOT_FOUND');
        return project;
    }

    // Configuration must belong to the SAME project — cross-project assignment rejected.
    static async resolveConfiguration(configurationId, projectId, organizationId) {
        const config = await prisma.configuration.findFirst({
            where: { id: configurationId, projectId, organizationId }
        });
        if (!config) {
            throw new AppError('Configuration does not belong to this project', 400, 'BAD_REQUEST');
        }
        return config;
    }

    static async assertUnitNumberFree(projectId, unitNumber, organizationId, excludeId = null) {
        if (!unitNumber) return;
        const where = { projectId, unitNumber };
        if (excludeId) where.id = { not: excludeId };
        const existing = await prisma.property.findFirst({ where });
        if (existing) {
            throw new AppError(`Unit number "${unitNumber}" already exists in this project`, 409, 'CONFLICT');
        }
    }

    static async createProperty(data, organizationId) {
        const normalized = PropertyService.normalizePropertyPayload(data);

        if (!normalized.projectId) throw new AppError('Project ID is required', 400, 'BAD_REQUEST');
        const project = await PropertyService.assertProject(normalized.projectId, organizationId);

        // Units are born AVAILABLE only — all other statuses go through transitions.
        if (normalized.status && normalized.status !== 'AVAILABLE') {
            throw new AppError('New units can only be created with status AVAILABLE', 400, 'BAD_REQUEST');
        }

        const payload = PropertyService.pickFields(normalized, CREATE_FIELDS);

        if (payload.configurationId) {
            const config = await PropertyService.resolveConfiguration(payload.configurationId, normalized.projectId, organizationId);
            payload.configuration = config.name;
            if (payload.bhk === undefined || payload.bhk === null) payload.bhk = config.bhk;
            if (payload.areaSaleable === undefined || payload.areaSaleable === null) payload.areaSaleable = config.areaSaleable;
        }

        // Price: explicit > configuration base price > reject
        if (payload.price === undefined || payload.price === null) {
            if (payload.configurationId) {
                const config = await prisma.configuration.findFirst({
                    where: { id: payload.configurationId, projectId: normalized.projectId, organizationId }
                });
                payload.price = config && config.basePrice !== null ? Number(config.basePrice) : undefined;
            }
        }
        if (payload.price === undefined || payload.price === null) {
            throw new AppError('Price is required (provide price or use a configuration with a base price)', 400, 'BAD_REQUEST');
        }

        await PropertyService.assertUnitNumberFree(normalized.projectId, payload.unitNumber, organizationId);

        const baseData = {
            ...payload,
            projectId: normalized.projectId,
            organizationId,
            status: 'AVAILABLE'
        };

        // Every unit gets an opaque public share token at birth. The unique
        // index makes collisions impossible across orgs; retry on the
        // (astronomically unlikely) collision rather than failing the create.
        for (let attempt = 0; attempt < 4; attempt++) {
            try {
                return await prisma.property.create({
                    data: { ...baseData, publicToken: generatePublicToken() }
                });
            } catch (err) {
                const target = err.code === 'P2002' ? String((err.meta && err.meta.target) || '') : '';
                if (err.code === 'P2002' && target.includes('publicToken')) continue;
                if (err.code === 'P2002') {
                    throw new AppError(`Unit number "${payload.unitNumber}" already exists in this project`, 409, 'CONFLICT');
                }
                if (err.code === 'P2003') {
                    throw new AppError('Invalid project or configuration reference', 400, 'BAD_REQUEST');
                }
                throw err;
            }
        }
        // Unreachable in practice; keeps the contract explicit.
        throw new AppError('Could not allocate a unique share token, please retry', 503, 'SERVICE_UNAVAILABLE');
    }

    static async updateProperty(id, data, organizationId) {
        const normalized = PropertyService.normalizePropertyPayload(data);

        // Mass-assignment protection: only whitelisted, editable fields may be
        // updated. projectId is immutable (prevents cross-project moves); ids,
        // organizationId and version are never client-writable.
        const safeData = PropertyService.pickFields(normalized, UPDATE_FIELDS);

        const existing = await prisma.property.findFirst({ where: { id, organizationId } });
        if (!existing) throw new AppError('Property not found', 404, 'NOT_FOUND');

        // Configuration reassignment must stay within the unit's project.
        if (Object.prototype.hasOwnProperty.call(safeData, 'configurationId') && safeData.configurationId) {
            const config = await PropertyService.resolveConfiguration(
                safeData.configurationId, existing.projectId, organizationId
            );
            safeData.configuration = config.name;
        }

        // Duplicate unit number protection
        if (
            Object.prototype.hasOwnProperty.call(safeData, 'unitNumber') &&
            safeData.unitNumber &&
            safeData.unitNumber !== existing.unitNumber
        ) {
            await PropertyService.assertUnitNumberFree(existing.projectId, safeData.unitNumber, organizationId, id);
        }

        // Backend-authoritative status transitions.
        if (safeData.status && safeData.status !== existing.status) {
            const allowedTransitions = {
                AVAILABLE: ['RESERVED', 'SOLD'],
                RESERVED: ['AVAILABLE', 'SOLD'],
                SOLD: [] // terminal — never reopened
            };
            const allowed = allowedTransitions[existing.status] || [];
            if (!allowed.includes(safeData.status)) {
                throw new AppError(
                    `Invalid status transition from ${existing.status} to ${safeData.status}`,
                    400,
                    'BAD_REQUEST'
                );
            }

            // Booking compatibility: a RESERVED unit with active bookings may
            // not be released to AVAILABLE outside the booking flow.
            if (existing.status === 'RESERVED' && safeData.status === 'AVAILABLE') {
                const activeBookings = await prisma.booking.count({
                    where: { propertyId: id, paymentStatus: { not: 'CANCELLED' } }
                });
                if (activeBookings > 0) {
                    throw new AppError(
                        'Unit has active booking(s). Cancel the booking before releasing it.',
                        409,
                        'CONFLICT'
                    );
                }
            }
        }

        try {
            return await prisma.property.update({
                where: { id },
                data: {
                    ...safeData,
                    version: { increment: 1 } // Optimistic locking increment
                }
            });
        } catch (err) {
            if (err.code === 'P2002') {
                throw new AppError(`Unit number "${safeData.unitNumber}" already exists in this project`, 409, 'CONFLICT');
            }
            throw err;
        }
    }

    static async deleteProperty(id, organizationId) {
        const existing = await prisma.property.findFirst({
            where: { id, organizationId },
            include: { _count: { select: { bookings: true, interestedBy: true, quotations: true } } }
        });
        if (!existing) throw new AppError('Property not found', 404, 'NOT_FOUND');

        if (existing.status !== 'AVAILABLE') {
            throw new AppError('Cannot delete a property that is reserved or sold', 400, 'BAD_REQUEST');
        }
        if (existing._count.bookings > 0) {
            throw new AppError('Cannot delete a unit that has bookings', 409, 'CONFLICT');
        }
        if (existing._count.interestedBy > 0 || existing._count.quotations > 0) {
            throw new AppError('Cannot delete a unit referenced by leads or quotations', 409, 'CONFLICT');
        }

        await prisma.property.delete({ where: { id } });
        return true;
    }

    // --- Bulk import ---
    static async bulkImportProperties(organizationId, { projectId, rows, dryRun = false }) {
        const project = await PropertyService.assertProject(projectId, organizationId);

        const configs = await prisma.configuration.findMany({
            where: { projectId, organizationId },
            select: { id: true, name: true, bhk: true, areaSaleable: true, basePrice: true }
        });
        const configByName = new Map(configs.map(c => [c.name.toLowerCase(), c]));

        // Existing unit numbers in this project (for duplicate detection)
        const rowUnitNumbers = rows.map(r => String(r.unitNumber).trim()).filter(Boolean);
        const existingUnits = await prisma.property.findMany({
            where: { projectId, unitNumber: { in: rowUnitNumbers } },
            select: { unitNumber: true }
        });
        const existingSet = new Set(existingUnits.map(u => u.unitNumber));

        const failed = [];
        const validRows = [];
        const seenInBatch = new Set();

        rows.forEach((row, index) => {
            const errors = [];
            const unitNumber = String(row.unitNumber || '').trim();
            const key = unitNumber.toLowerCase();

            if (!unitNumber) {
                errors.push('Unit number is required');
            } else if (seenInBatch.has(key)) {
                errors.push(`Duplicate unit number "${unitNumber}" in this import`);
            } else {
                seenInBatch.add(key);
                if (existingSet.has(unitNumber)) {
                    errors.push(`Unit number "${unitNumber}" already exists in this project`);
                }
            }

            let config = null;
            const configName = row.configuration ? String(row.configuration).trim() : null;
            if (configName) {
                config = configByName.get(configName.toLowerCase());
                if (!config) {
                    errors.push(`Configuration "${configName}" not found in project "${project.name}"`);
                }
            }

            let price = row.price !== undefined && row.price !== null && row.price !== '' ? Number(row.price) : null;
            if ((price === null || Number.isNaN(price)) && config && config.basePrice !== null) {
                price = Number(config.basePrice);
            }
            if (price === null || Number.isNaN(price)) {
                errors.push('Price is required (provide price or use a configuration with a base price)');
            }

            if (errors.length > 0) {
                failed.push({ row: index + 1, unitNumber: unitNumber || null, errors });
                return;
            }

            const num = (v) => (v !== undefined && v !== null && v !== '' && !Number.isNaN(Number(v)) ? Math.round(Number(v)) : null);

            validRows.push({
                title: unitNumber,
                unitNumber,
                projectId,
                organizationId,
                status: 'AVAILABLE',
                configurationId: config ? config.id : null,
                configuration: config ? config.name : (configName || null),
                tower: row.tower || null,
                floor: num(row.floor),
                bhk: num(row.bhk) !== null ? num(row.bhk) : (config ? config.bhk : null),
                area: num(row.area),
                areaCarpet: num(row.areaCarpet),
                areaSaleable: num(row.areaSaleable) !== null ? num(row.areaSaleable) : (config ? config.areaSaleable : null),
                facing: row.facing || null,
                purpose: row.purpose || null,
                price
            });
        });

        if (dryRun || validRows.length === 0) {
            return {
                dryRun: dryRun || false,
                created: 0,
                total: rows.length,
                failed
            };
        }

        const created = await prisma.$transaction(async (tx) => {
            let count = 0;
            for (const row of validRows) {
                await tx.property.create({ data: row });
                count += 1;
            }
            return count;
        });

        return {
            dryRun: false,
            created,
            total: rows.length,
            failed
        };
    }
}

module.exports = PropertyService;
