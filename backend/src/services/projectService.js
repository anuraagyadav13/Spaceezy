const prisma = require('../db/prisma');
const { AppError } = require('../utils/errors');
const LocationService = require('./locationService');
const ConfigurationService = require('./configurationService');
const BookingService = require('./bookingService');
const { generatePublicSlug } = require('../utils/publicLink');

class ProjectService {
    // Writable Project scalar fields (mass-assignment protection: arbitrary
    // client keys like `assignedTo`/`image`/`owner` are never persisted).
    static WRITABLE_FIELDS = [
        'name', 'projectType', 'status', 'developer', 'description', 'shortDescription',
        'address', 'locality', 'city', 'state', 'pincode', 'latitude', 'longitude',
        'stateId', 'districtId', 'regionId',
        'mapUrl', 'landmark', 'totalLandArea', 'landAreaUnit', 'totalTowers',
        'totalFloors', 'totalUnits', 'availableUnits', 'launchDate',
        'expectedCompletionDate', 'possessionDate', 'reraRegistered', 'reraNumber',
        'reraAuthority', 'startingPrice', 'maximumPrice', 'pricePerSqFt', 'priceUnit',
        'maintenanceCharges', 'plcCharges', 'parkingCharges', 'clubCharges',
        'otherCharges', 'amenities', 'images', 'documents', 'connectivity',
        'isPublic'
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

    /**
     * Validates canonical location FKs (state -> district -> region) against the
     * location master and denormalizes their names into the legacy free-text
     * columns (state/city/locality) so existing displays and text-based matching
     * keep working off the same single source of truth.
     */
    static async applyCanonicalLocation(payload) {
        const has = (field) => Object.prototype.hasOwnProperty.call(payload, field);
        const hasState = has('stateId');
        const hasDistrict = has('districtId');
        const hasRegion = has('regionId');
        if (!hasState && !hasDistrict && !hasRegion) return;

        const stateId = hasState ? payload.stateId : null;

        if (!stateId) {
            if (payload.districtId || payload.regionId) {
                throw new AppError('stateId is required when districtId or regionId is provided', 400, 'INVALID_LOCATION');
            }
            if (hasState) payload.stateId = null;
            if (hasDistrict) payload.districtId = null;
            if (hasRegion) payload.regionId = null;
            return;
        }

        const [row] = await LocationService.validateSelections([{
            stateId,
            districtId: hasDistrict ? (payload.districtId || null) : null,
            regionId: hasRegion ? (payload.regionId || null) : null
        }]);

        payload.stateId = row.stateId;
        if (hasDistrict) payload.districtId = row.districtId;
        // A region always belongs to a district: re-selection is required when
        // the district changes without a new regionId.
        if (hasDistrict && !hasRegion) payload.regionId = null;
        if (hasRegion) payload.regionId = row.regionId;

        payload.state = row.stateName;
        if (hasDistrict) payload.city = row.districtName;
        if (hasRegion) payload.locality = row.regionName;
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
        // Bulk-mode configuration counters are folded in: bulk configs have
        // zero linked Property rows (enforced), so the sums cannot overlap.
        // Bulk reserved/sold derive from their booking rows.
        const bulkByProject = new Map();
        const bulkBookedByProject = new Map();
        if (projects.length > 0) {
            const bulkRows = (await prisma.configuration.findMany({
                where: { projectId: { in: projects.map((p) => p.id) }, organizationId, totalUnits: { not: null } },
                select: { projectId: true, totalUnits: true, availableUnits: true }
            })) || [];
            for (const row of bulkRows) {
                const entry = bulkByProject.get(row.projectId) || { total: 0, available: 0 };
                entry.total += row.totalUnits || 0;
                entry.available += row.availableUnits || 0;
                bulkByProject.set(row.projectId, entry);
            }
            const bulkBookings = await BookingService.bulkBookingCounts(
                prisma,
                { projectId: { in: projects.map((p) => p.id) }, organizationId }
            );
            for (const entry of bulkBookings.values()) {
                const agg = bulkBookedByProject.get(entry.projectId) || { reserved: 0, sold: 0 };
                agg.reserved += entry.reserved;
                agg.sold += entry.sold;
                bulkBookedByProject.set(entry.projectId, agg);
            }
        }

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
            const bulk = bulkByProject.get(project.id);
            if (bulk) {
                inventory.total += bulk.total;
                inventory.available += bulk.available;
            }
            const bulkBooked = bulkBookedByProject.get(project.id);
            if (bulkBooked) {
                inventory.reserved += bulkBooked.reserved;
                inventory.sold += bulkBooked.sold;
            }

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

        // Fold in bulk-mode configuration counters. The included
        // configurations carry the stored counters; bulk configs have zero
        // linked rows (enforced at write time), so the sums cannot overlap.
        // Reserved/sold for bulk configs derive from their booking rows.
        const bulk = ConfigurationService.sumBulkCounters(project.configurations);
        inventory.total += bulk.total;
        inventory.available += bulk.available;
        const bulkBookings = await BookingService.bulkBookingCounts(prisma, { projectId: id, organizationId });
        for (const entry of bulkBookings.values()) {
            inventory.reserved += entry.reserved;
            inventory.sold += entry.sold;
        }

        // Compute configuration summary from properties
        const configCounts = await prisma.property.groupBy({
            by: ['configuration'],
            where: { projectId: id, organizationId },
            _count: { configuration: true },
            _min: { price: true },
            _max: { price: true }
        });

        // Per-label unit aggregates from the already-loaded property rows, so
        // unit-tracked entries can report their own status split.
        const unitAgg = new Map();
        for (const unit of project.properties || []) {
            const key = String(unit.configuration || 'Unknown').toLowerCase();
            const entry = unitAgg.get(key) || { count: 0, available: 0, reserved: 0, sold: 0 };
            entry.count += 1;
            if (unit.status === 'AVAILABLE') entry.available += 1;
            else if (unit.status === 'RESERVED') entry.reserved += 1;
            else if (unit.status === 'SOLD') entry.sold += 1;
            unitAgg.set(key, entry);
        }

        const summaryByLabel = new Map();
        for (const cc of configCounts) {
            const label = cc.configuration || 'Unknown';
            const agg = unitAgg.get(label.toLowerCase()) || { available: 0, reserved: 0, sold: 0 };
            summaryByLabel.set(label.toLowerCase(), {
                configuration: label,
                count: cc._count.configuration,
                availableUnits: agg.available,
                reservedUnits: agg.reserved,
                soldUnits: agg.sold,
                minPrice: cc._min.price,
                maxPrice: cc._max.price,
                mode: 'units'
            });
        }

        // Bulk-mode configurations have no property rows, so they never
        // appear above — merge them under their canonical name. Stray
        // same-label free-text rows (unreachable via API guards) fold into
        // the same entry so summary counts stay reconciled with the totals.
        for (const config of project.configurations || []) {
            if (!ConfigurationService.isBulkMode(config)) continue;
            const key = String(config.name || '').toLowerCase();
            const prev = summaryByLabel.get(key);
            const stray = prev && prev.mode === 'units' ? prev : null;
            const bookings = bulkBookings.get(config.id) || { reserved: 0, sold: 0 };
            summaryByLabel.set(key, {
                configuration: config.name,
                count: (config.totalUnits || 0) + (stray ? stray.count : 0),
                availableUnits: (config.availableUnits || 0) + (stray ? (stray.availableUnits || 0) : 0),
                reservedUnits: bookings.reserved + (stray ? (stray.reservedUnits || 0) : 0),
                soldUnits: bookings.sold + (stray ? (stray.soldUnits || 0) : 0),
                minPrice: config.priceMin ?? config.basePrice ?? (prev ? prev.minPrice : null),
                maxPrice: config.priceMax ?? config.basePrice ?? (prev ? prev.maxPrice : null),
                mode: 'bulk'
            });
        }

        return {
            ...project,
            inventory,
            configurationSummary: Array.from(summaryByLabel.values())
        };
    }

    static async createProject(data, organizationId) {
        const payload = ProjectService.normalizePayload(data);

        // Default address to project name if not provided
        if (!payload.address) {
            payload.address = payload.name || 'TBD';
        }

        await ProjectService.applyCanonicalLocation(payload);

        // URL-safe public slug (name + short random suffix, unique). Retry on
        // the unlikely collision instead of failing the create.
        for (let attempt = 0; attempt < 4; attempt++) {
            try {
                return await prisma.project.create({
                    data: {
                        ...payload,
                        organizationId,
                        publicSlug: payload.publicSlug || generatePublicSlug(payload.name)
                    }
                });
            } catch (err) {
                const target = err.code === 'P2002' ? String((err.meta && err.meta.target) || '') : '';
                if (err.code === 'P2002' && target.includes('publicSlug')) continue;
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
        // Unreachable in practice; keeps the contract explicit.
        throw new AppError('Could not allocate a unique public slug, please retry', 503, 'SERVICE_UNAVAILABLE');
    }

    static async updateProject(id, data, organizationId) {
        const existing = await prisma.project.findFirst({ where: { id, organizationId } });
        if (!existing) throw new AppError('Project not found', 404, 'NOT_FOUND');

        const payload = ProjectService.normalizePayload(data);
        await ProjectService.applyCanonicalLocation(payload);

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
