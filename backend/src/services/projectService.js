const prisma = require('../db/prisma');
const { AppError } = require('../utils/errors');

class ProjectService {
    // Writable Project scalar fields (mass-assignment protection: arbitrary
    // client keys like `assignedTo`/`image`/`owner` are never persisted).
    static WRITABLE_FIELDS = [
        'name', 'projectType', 'status', 'developer', 'description', 'shortDescription',
        'address', 'locality', 'city', 'state', 'pincode', 'latitude', 'longitude',
        'mapUrl', 'landmark', 'totalLandArea', 'landAreaUnit', 'totalTowers',
        'totalFloors', 'totalUnits', 'availableUnits', 'launchDate',
        'expectedCompletionDate', 'possessionDate', 'reraRegistered', 'reraNumber',
        'reraAuthority', 'startingPrice', 'maximumPrice', 'pricePerSqFt', 'priceUnit',
        'maintenanceCharges', 'plcCharges', 'parkingCharges', 'clubCharges',
        'otherCharges', 'amenities', 'images', 'documents', 'connectivity'
    ];

    /**
     * Normalize incoming project payload — convert dates, handle legacy fields, etc.
     * Result contains ONLY allowlisted, schema-valid fields.
     */
    static normalizePayload(data = {}) {
        const source = { ...data };

        // Legacy compatibility: map 'type' to 'projectType' if projectType is not set
        if (source.type && !source.projectType) {
            source.projectType = source.type;
        }
        if (!source.name && source.projectName) {
            source.name = source.projectName;
        }

        const payload = {};
        for (const field of ProjectService.WRITABLE_FIELDS) {
            if (source[field] !== undefined) payload[field] = source[field];
        }

        // Convert date strings to Date objects
        const dateFields = ['launchDate', 'expectedCompletionDate', 'possessionDate'];
        dateFields.forEach(field => {
            if (payload[field] && typeof payload[field] === 'string') {
                const d = new Date(payload[field]);
                payload[field] = isNaN(d.getTime()) ? undefined : d;
            }
        });

        // Convert numeric strings
        const intFields = ['totalTowers', 'totalFloors', 'totalUnits', 'availableUnits'];
        intFields.forEach(field => {
            if (payload[field] !== undefined && payload[field] !== null) {
                payload[field] = parseInt(payload[field]) || null;
            }
        });

        const floatFields = ['totalLandArea', 'latitude', 'longitude',
            'startingPrice', 'maximumPrice', 'pricePerSqFt',
            'maintenanceCharges', 'plcCharges', 'parkingCharges', 'clubCharges', 'otherCharges'];
        floatFields.forEach(field => {
            if (payload[field] !== undefined && payload[field] !== null && payload[field] !== '') {
                payload[field] = parseFloat(payload[field]) || null;
            } else if (payload[field] === '') {
                payload[field] = null;
            }
        });

        return payload;
    }

    static async getProjects(organizationId, query) {
        const {
            page = 1, limit = 10,
            search, status, projectType, type, city, developer,
            reraRegistered, sort = 'desc', sortBy = 'createdAt'
        } = query;
        const skip = (page - 1) * limit;

        const where = { organizationId };

        if (status) where.status = status;
        if (projectType || type) where.projectType = projectType || type;
        if (city) where.city = { contains: city, mode: 'insensitive' };
        if (developer) where.developer = { contains: developer, mode: 'insensitive' };
        if (reraRegistered === 'true') where.reraRegistered = true;
        if (reraRegistered === 'false') where.reraRegistered = false;

        if (search) {
            where.OR = [
                { name: { contains: search, mode: 'insensitive' } },
                { address: { contains: search, mode: 'insensitive' } },
                { city: { contains: search, mode: 'insensitive' } },
                { developer: { contains: search, mode: 'insensitive' } },
                { locality: { contains: search, mode: 'insensitive' } }
            ];
        }

        const allowedSortFields = ['createdAt', 'name', 'startingPrice', 'totalUnits', 'city'];
        const orderField = allowedSortFields.includes(sortBy) ? sortBy : 'createdAt';

        const [projects, total] = await Promise.all([
            prisma.project.findMany({
                where,
                skip: parseInt(skip),
                take: parseInt(limit),
                orderBy: { [orderField]: sort === 'asc' ? 'asc' : 'desc' },
                include: {
                    _count: {
                        select: {
                            properties: true,
                            leads: true,
                            bookings: true
                        }
                    }
                }
            }),
            prisma.project.count({ where })
        ]);

        // Enrich with live inventory counts from DB
        const enriched = await Promise.all(projects.map(async (project) => {
            const statusCounts = await prisma.property.groupBy({
                by: ['status'],
                where: { projectId: project.id, organizationId },
                _count: { status: true }
            });

            const inventory = {
                total: 0,
                available: 0,
                reserved: 0,
                sold: 0
            };
            statusCounts.forEach(sc => {
                inventory.total += sc._count.status;
                if (sc.status === 'AVAILABLE') inventory.available = sc._count.status;
                if (sc.status === 'RESERVED') inventory.reserved = sc._count.status;
                if (sc.status === 'SOLD') inventory.sold = sc._count.status;
            });

            return {
                ...project,
                inventory
            };
        }));

        return { projects: enriched, total, pages: Math.ceil(total / limit) };
    }

    static async getProjectById(id, organizationId) {
        const project = await prisma.project.findFirst({
            where: { id, organizationId },
            include: {
                configurations: {
                    orderBy: { createdAt: 'asc' },
                    include: { _count: { select: { properties: true } } }
                },
                properties: {
                    select: {
                        id: true,
                        title: true,
                        unitNumber: true,
                        configuration: true,
                        configurationId: true,
                        tower: true,
                        purpose: true,
                        bhk: true,
                        area: true,
                        areaCarpet: true,
                        areaSaleable: true,
                        floor: true,
                        facing: true,
                        price: true,
                        status: true,
                        type: true,
                        version: true,
                        featured: true
                    },
                    orderBy: [{ tower: 'asc' }, { floor: 'asc' }, { unitNumber: 'asc' }]
                },
                leads: {
                    select: {
                        id: true,
                        name: true,
                        phone: true,
                        status: true,
                        source: true,
                        createdAt: true
                    },
                    orderBy: { createdAt: 'desc' },
                    take: 50
                },
                bookings: {
                    select: {
                        id: true,
                        amount: true,
                        bookingDate: true,
                        paymentStatus: true
                    },
                    orderBy: { createdAt: 'desc' },
                    take: 20
                },
                quotations: {
                    select: {
                        id: true,
                        totalAmount: true,
                        status: true,
                        validUntil: true,
                        createdAt: true
                    },
                    orderBy: { createdAt: 'desc' },
                    take: 20
                }
            }
        });

        if (!project) throw new AppError('Project not found', 404, 'NOT_FOUND');

        // Compute live inventory stats
        const statusCounts = await prisma.property.groupBy({
            by: ['status'],
            where: { projectId: id, organizationId },
            _count: { status: true }
        });

        const inventory = { total: 0, available: 0, reserved: 0, sold: 0 };
        statusCounts.forEach(sc => {
            inventory.total += sc._count.status;
            if (sc.status === 'AVAILABLE') inventory.available = sc._count.status;
            if (sc.status === 'RESERVED') inventory.reserved = sc._count.status;
            if (sc.status === 'SOLD') inventory.sold = sc._count.status;
        });

        // Compute configuration summary from properties
        const configCounts = await prisma.property.groupBy({
            by: ['configuration'],
            where: { projectId: id, organizationId },
            _count: { configuration: true },
            _min: { price: true },
            _max: { price: true }
        });

        return {
            ...project,
            inventory,
            configurationSummary: configCounts.map(cc => ({
                configuration: cc.configuration || 'Unknown',
                count: cc._count.configuration,
                minPrice: cc._min.price,
                maxPrice: cc._max.price
            }))
        };
    }

    static async createProject(data, organizationId) {
        const payload = ProjectService.normalizePayload(data);

        // Default address to project name if not provided
        if (!payload.address) {
            payload.address = payload.name || 'TBD';
        }

        try {
            return await prisma.project.create({
                data: {
                    ...payload,
                    organizationId
                }
            });
        } catch (err) {
            console.error('=== PROJECT CREATE ERROR ===');
            console.error('Prisma error:', err.message);
            console.error('Error code:', err.code);
            console.error('Meta:', err.meta);
            console.error('Payload sent:', JSON.stringify({ ...payload, organizationId }, null, 2));
            throw new AppError(
                `Failed to create project: ${err.message}`,
                400,
                'CREATE_FAILED'
            );
        }
    }

    static async updateProject(id, data, organizationId) {
        const existing = await prisma.project.findFirst({ where: { id, organizationId } });
        if (!existing) throw new AppError('Project not found', 404, 'NOT_FOUND');

        const payload = ProjectService.normalizePayload(data);

        return await prisma.project.update({
            where: { id },
            data: payload
        });
    }

    static async deleteProject(id, organizationId) {
        const existing = await prisma.project.findFirst({
            where: { id, organizationId },
            include: {
                _count: {
                    select: {
                        properties: true,
                        leads: true,
                        bookings: true,
                        quotations: true
                    }
                }
            }
        });

        if (!existing) throw new AppError('Project not found', 404, 'NOT_FOUND');

        const totalRelated = existing._count.properties + existing._count.leads +
            existing._count.bookings + existing._count.quotations;

        if (totalRelated > 0) {
            // Archive instead of hard delete
            return await prisma.project.update({
                where: { id },
                data: { status: 'INACTIVE' }
            });
        }

        await prisma.project.delete({ where: { id } });
        return { deleted: true };
    }
}

module.exports = ProjectService;
