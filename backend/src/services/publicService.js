const prisma = require('../db/prisma');
const { AppError } = require('../utils/errors');
const {
    isValidPublicToken,
    publicAvailability,
    publicImages,
    buildPublicProjectUrl
} = require('../utils/publicLink');

const DEFAULT_LIMIT = 12;
const MAX_LIMIT = 50;

// Single source of truth for public visibility: a project is visible on the
// public website only when explicitly published AND not archived. Units inherit
// visibility (they must be published too, under a visible project).
const PUBLIC_PROJECT_WHERE = { isPublic: true, status: { not: 'INACTIVE' } };

const NOT_FOUND = () => new AppError('Property not found', 404, 'NOT_FOUND');
const PROJECT_NOT_FOUND = () => new AppError('Project not found', 404, 'NOT_FOUND');

function paginate(params = {}) {
    const page = Math.max(1, parseInt(params.page, 10) || 1);
    const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(params.limit, 10) || DEFAULT_LIMIT));
    return { page, limit, skip: (page - 1) * limit, take: limit };
}

function contains(value) {
    return { contains: value, mode: 'insensitive' };
}

function num(value) {
    if (value === undefined || value === null || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function money(value) {
    if (value === null || value === undefined) return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
}

// Public availability vocabulary -> canonical PropertyStatus values.
function availabilityToStatus(availability) {
    const map = {
        AVAILABLE: 'AVAILABLE',
        Available: 'AVAILABLE',
        RESERVED: 'RESERVED',
        'Limited Availability': 'RESERVED',
        SOLD: 'SOLD',
        Sold: 'SOLD'
    };
    return map[availability] || null;
}

function locationNames(project) {
    return {
        state: (project.locationState && project.locationState.name) || project.state || null,
        district: (project.locationDistrict && project.locationDistrict.name) || null,
        region: (project.locationRegion && project.locationRegion.name) || null,
        locality: project.locality || null,
        city: project.city || null
    };
}

function locationLabel(project) {
    const loc = locationNames(project);
    return [loc.region, loc.district, loc.state].filter(Boolean).join(', ') || loc.city || loc.state || null;
}

class PublicService {
    // Public reads are scoped to the primary organization, mirroring how public
    // enquiries resolve their tenant (see controllers/public.js).
    static async defaultOrganization() {
        const org = await prisma.organization.findFirst({ select: { id: true } });
        if (!org) {
            throw new AppError('System not configured correctly (No organization found)', 500, 'INTERNAL_ERROR');
        }
        return org.id;
    }

    // Price/availability rollup for a set of projects (computed from real unit
    // rows — no denormalized counters that can drift).
    static async projectStats(projectIds) {
        if (!projectIds.length) return new Map();
        const groups = await prisma.property.groupBy({
            by: ['projectId', 'status'],
            where: { projectId: { in: projectIds } },
            _count: { _all: true },
            _min: { price: true },
            _max: { price: true }
        });
        const map = new Map();
        for (const g of groups) {
            const stat = map.get(g.projectId) || {
                totalUnits: 0, availableUnits: 0, reservedUnits: 0, soldUnits: 0,
                minPrice: null, maxPrice: null
            };
            const count = (g._count && g._count._all) || 0;
            stat.totalUnits += count;
            if (g.status === 'AVAILABLE') stat.availableUnits += count;
            if (g.status === 'RESERVED') stat.reservedUnits += count;
            if (g.status === 'SOLD') stat.soldUnits += count;
            const min = money(g._min && g._min.price);
            const max = money(g._max && g._max.price);
            if (min !== null && (stat.minPrice === null || min < stat.minPrice)) stat.minPrice = min;
            if (max !== null && (stat.maxPrice === null || max > stat.maxPrice)) stat.maxPrice = max;
            map.set(g.projectId, stat);
        }
        return map;
    }

    // Cover image fallback: projects may have no gallery images of their own,
    // while their published units do. Use the earliest uploaded unit photo so
    // public project cards never render an empty placeholder.
    static async projectCoverImages(projectIds) {
        const map = new Map();
        if (!projectIds || !projectIds.length) return map;
        const rows = (await prisma.property.findMany({
            where: { projectId: { in: projectIds }, images: { isEmpty: false } },
            select: { projectId: true, images: true },
            orderBy: { createdAt: 'asc' },
            take: 100
        })) || [];
        for (const row of rows) {
            if (map.has(row.projectId)) continue;
            const image = publicImages(row.images)[0];
            if (image) map.set(row.projectId, image);
        }
        return map;
    }

    static projectListItem(project, stats, coverImage) {
        const images = publicImages(project.images);
        const start = money(project.startingPrice) !== null ? money(project.startingPrice) : (stats && stats.minPrice);
        const max = money(project.maximumPrice) !== null ? money(project.maximumPrice) : (stats && stats.maxPrice);
        return {
            slug: project.publicSlug,
            name: project.name,
            projectType: project.projectType,
            status: project.status,
            description: project.shortDescription || project.description || null,
            image: images[0] || coverImage || null,
            address: project.address,
            location: locationNames(project),
            startingPrice: start !== undefined ? start : null,
            maximumPrice: max !== undefined ? max : null,
            totalUnits: (stats && stats.totalUnits) || project.totalUnits || null,
            availableUnits: stats ? stats.availableUnits : (project.availableUnits || null),
            configurations: Array.isArray(project.configurations)
                ? project.configurations.map((c) => c.name)
                : [],
            url: buildPublicProjectUrl(project.publicSlug)
        };
    }

    static async listProjects(params) {
        const organizationId = await PublicService.defaultOrganization();
        const { page, limit, skip, take } = paginate(params);
        if (!params.q && params.search) params = { ...params, q: params.search };
        const and = [{ organizationId }, PUBLIC_PROJECT_WHERE];

        if (params.q) and.push({ OR: [{ name: contains(params.q) }, { description: contains(params.q) }] });
        if (params.location) and.push({ OR: [{ name: contains(params.location) }, { address: contains(params.location) }, { locality: contains(params.location) }] });
        if (params.stateId) and.push({ stateId: params.stateId });
        if (params.districtId) and.push({ districtId: params.districtId });
        if (params.regionId) and.push({ regionId: params.regionId });
        if (params.propertyType) and.push({ projectType: params.propertyType });
        if (params.status) and.push({ status: params.status });
        if (params.configuration) {
            and.push({ configurations: { some: { name: params.configuration, active: true } } });
        }
        const min = num(params.minPrice);
        const max = num(params.maxPrice);
        if (min !== null || max !== null) {
            const range = {};
            if (min !== null) range.gte = min;
            if (max !== null) range.lte = max;
            and.push({ startingPrice: range });
        }

        const where = { AND: and };
        const [items, total] = await Promise.all([
            prisma.project.findMany({
                where,
                orderBy: { updatedAt: 'desc' },
                skip,
                take,
                include: {
                    configurations: { where: { active: true }, select: { name: true }, orderBy: { name: 'asc' } },
                    locationState: { select: { name: true } },
                    locationDistrict: { select: { name: true } },
                    locationRegion: { select: { name: true } }
                }
            }),
            prisma.project.count({ where })
        ]);
        const stats = await PublicService.projectStats(items.map((p) => p.id));
        const covers = await PublicService.projectCoverImages(items.map((p) => p.id));

        return {
            items: items.map((p) => PublicService.projectListItem(p, stats.get(p.id), covers.get(p.id))),
            page,
            limit,
            total,
            totalPages: Math.max(1, Math.ceil(total / limit))
        };
    }

    static async getProjectBySlug(slug) {
        const organizationId = await PublicService.defaultOrganization();
        const project = await prisma.project.findFirst({
            where: { publicSlug: slug, organizationId, ...PUBLIC_PROJECT_WHERE },
            include: {
                configurations: { where: { active: true }, orderBy: { name: 'asc' } },
                locationState: { select: { name: true } },
                locationDistrict: { select: { name: true } },
                locationRegion: { select: { name: true } }
            }
        });
        if (!project) throw PROJECT_NOT_FOUND();

        const statsObj = (await PublicService.projectStats([project.id])).get(project.id);
        const stats = statsObj || { totalUnits: 0, availableUnits: 0, reservedUnits: 0, soldUnits: 0, minPrice: null, maxPrice: null };

        const typeGroups = await prisma.property.groupBy({
            by: ['type', 'status'],
            where: { projectId: project.id },
            _count: { _all: true }
        });
        const unitTypes = new Map();
        for (const g of typeGroups) {
            const key = g.type || project.projectType || 'Unit';
            const entry = unitTypes.get(key) || { type: key, count: 0, available: 0 };
            entry.count += (g._count && g._count._all) || 0;
            if (g.status === 'AVAILABLE') entry.available += (g._count && g._count._all) || 0;
            unitTypes.set(key, entry);
        }

        const images = publicImages(project.images);
        const cover = images[0]
            || (await PublicService.projectCoverImages([project.id])).get(project.id)
            || null;
        const start = money(project.startingPrice) !== null ? money(project.startingPrice) : stats.minPrice;
        const max = money(project.maximumPrice) !== null ? money(project.maximumPrice) : stats.maxPrice;

        return {
            slug: project.publicSlug,
            name: project.name,
            projectType: project.projectType,
            status: project.status,
            developer: project.developer || null,
            description: project.description || null,
            shortDescription: project.shortDescription || null,
            images,
            heroImage: cover,
            address: project.address,
            location: locationNames(project),
            locationLabel: locationLabel(project),
            pincode: project.pincode || null,
            landmark: project.landmark || null,
            mapUrl: project.mapUrl || null,
            latitude: project.latitude !== null && project.latitude !== undefined ? Number(project.latitude) : null,
            longitude: project.longitude !== null && project.longitude !== undefined ? Number(project.longitude) : null,
            rera: project.reraRegistered
                ? { number: project.reraNumber || null, authority: project.reraAuthority || null }
                : null,
            amenities: Array.isArray(project.amenities) ? project.amenities : [],
            connectivity: project.connectivity || null,
            startingPrice: start !== undefined ? start : null,
            maximumPrice: max !== undefined ? max : null,
            pricePerSqFt: money(project.pricePerSqFt),
            launchDate: project.launchDate ? project.launchDate.toISOString() : null,
            expectedCompletionDate: project.expectedCompletionDate ? project.expectedCompletionDate.toISOString() : null,
            possessionDate: project.possessionDate ? project.possessionDate.toISOString() : null,
            availability: {
                totalUnits: stats.totalUnits,
                availableUnits: stats.availableUnits,
                reservedUnits: stats.reservedUnits,
                soldUnits: stats.soldUnits
            },
            unitTypes: Array.from(unitTypes.values()),
            configurations: project.configurations.map((c) => ({
                name: c.name,
                bhk: c.bhk,
                areaSaleable: c.areaSaleable,
                basePrice: money(c.basePrice)
            })),
            url: buildPublicProjectUrl(project.publicSlug)
        };
    }

    static async listProperties(params) {
        const organizationId = await PublicService.defaultOrganization();
        const { page, limit, skip, take } = paginate(params);
        if (!params.q && params.search) params = { ...params, q: params.search };
        const and = [{ organizationId, isPublic: true, project: { is: PUBLIC_PROJECT_WHERE } }];

        if (params.q) {
            and.push({
                OR: [
                    { title: contains(params.q) },
                    { unitNumber: contains(params.q) },
                    { configuration: contains(params.q) },
                    { project: { is: { name: contains(params.q) } } }
                ]
            });
        }
        if (params.projectSlug) and.push({ project: { is: { publicSlug: params.projectSlug } } });
        if (params.stateId) and.push({ project: { is: { stateId: params.stateId } } });
        if (params.districtId) and.push({ project: { is: { districtId: params.districtId } } });
        if (params.regionId) and.push({ project: { is: { regionId: params.regionId } } });
        if (params.propertyType) and.push({ type: params.propertyType });
        if (params.configuration) and.push({ configuration: contains(params.configuration) });
        if (params.bhk) and.push({ bhk: num(params.bhk) });
        if (params.availability) {
            const status = availabilityToStatus(params.availability);
            if (status) and.push({ status });
        }
        const min = num(params.minPrice);
        const max = num(params.maxPrice);
        if (min !== null || max !== null) {
            const range = {};
            if (min !== null) range.gte = min;
            if (max !== null) range.lte = max;
            and.push({ price: range });
        }

        const where = { AND: and };
        const projectInclude = {
            select: {
                name: true,
                publicSlug: true,
                images: true,
                address: true,
                locality: true,
                city: true,
                state: true,
                locationState: { select: { name: true } },
                locationDistrict: { select: { name: true } },
                locationRegion: { select: { name: true } }
            }
        };
        const [items, total] = await Promise.all([
            prisma.property.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip,
                take,
                include: { project: projectInclude }
            }),
            prisma.property.count({ where })
        ]);

        return {
            items: items.map((p) => {
                const projectImages = publicImages(p.project.images);
                return {
                    token: p.publicToken,
                    title: p.title,
                    unitNumber: p.unitNumber,
                    tower: p.tower,
                    floor: p.floor,
                    configuration: p.configuration,
                    bhk: p.bhk,
                    type: p.type,
                    purpose: p.purpose,
                    area: p.areaSaleable || p.area || p.areaCarpet || null,
                    price: money(p.price),
                    availability: publicAvailability(p.status),
                    image: publicImages(p.images)[0] || projectImages[0] || null,
                    project: { name: p.project.name, slug: p.project.publicSlug },
                    location: locationNames(p.project)
                };
            }),
            page,
            limit,
            total,
            totalPages: Math.max(1, Math.ceil(total / limit))
        };
    }

    // The public property page. Identical 404 for malformed tokens, unknown
    // tokens, unpublished units and unpublished/archived projects — the endpoint
    // never reveals whether some other internal ID exists.
    static async getPropertyByToken(token) {
        const organizationId = await PublicService.defaultOrganization();
        if (!isValidPublicToken(token)) throw NOT_FOUND();

        const property = await prisma.property.findFirst({
            where: { publicToken: token, organizationId, isPublic: true, project: { is: PUBLIC_PROJECT_WHERE } },
            include: {
                project: {
                    select: {
                        name: true,
                        publicSlug: true,
                        isPublic: true,
                        projectType: true,
                        developer: true,
                        status: true,
                        description: true,
                        shortDescription: true,
                        images: true,
                        amenities: true,
                        address: true,
                        locality: true,
                        city: true,
                        state: true,
                        locationState: { select: { name: true } },
                        locationDistrict: { select: { name: true } },
                        locationRegion: { select: { name: true } }
                    }
                },
                config: { select: { name: true, bhk: true, areaSaleable: true, basePrice: true } }
            }
        });
        if (!property) throw NOT_FOUND();

        const projectImages = publicImages(property.project.images);
        const area = property.areaSaleable || property.area || property.areaCarpet
            || (property.config && property.config.areaSaleable) || null;

        return {
            token: property.publicToken,
            title: property.title,
            unitNumber: property.unitNumber,
            tower: property.tower,
            floor: property.floor,
            facing: property.facing,
            configuration: property.configuration || (property.config && property.config.name) || null,
            bhk: property.bhk || (property.config && property.config.bhk) || null,
            type: property.type,
            purpose: property.purpose,
            area,
            price: money(property.price),
            availability: publicAvailability(property.status),
            images: publicImages(property.images),
            amenities: Array.from(new Set([
                ...(Array.isArray(property.amenities) ? property.amenities : []),
                ...(Array.isArray(property.project.amenities) ? property.project.amenities : [])
            ])),
            description: property.project.description || property.project.shortDescription || null,
            project: {
                name: property.project.name,
                slug: property.project.publicSlug,
                projectType: property.project.projectType,
                developer: property.project.developer || null,
                image: projectImages[0] || null
            },
            location: locationNames(property.project),
            locationLabel: locationLabel(property.project),
            address: property.project.address,
            enquiry: {
                propertyToken: property.publicToken,
                projectSlug: property.project.publicSlug
            }
        };
    }

    // Canonical location tree with the same IDs the CRM uses — public filters
    // and CRM records reference one master (no duplicated location data).
    static async listLocations() {
        const states = await prisma.locationState.findMany({
            orderBy: { name: 'asc' },
            select: {
                id: true,
                name: true,
                code: true,
                districts: {
                    orderBy: { name: 'asc' },
                    select: {
                        id: true,
                        name: true,
                        regions: { orderBy: { name: 'asc' }, select: { id: true, name: true } }
                    }
                }
            }
        });
        return states;
    }

    // Distinct active configuration names across published projects.
    static async listConfigurations() {
        const organizationId = await PublicService.defaultOrganization();
        const rows = await prisma.configuration.findMany({
            where: { organizationId, active: true, project: { is: PUBLIC_PROJECT_WHERE } },
            distinct: ['name'],
            orderBy: { name: 'asc' },
            select: { name: true }
        });
        return rows.map((r) => r.name);
    }
}

module.exports = PublicService;
module.exports.PUBLIC_PROJECT_WHERE = PUBLIC_PROJECT_WHERE;
module.exports.availabilityToStatus = availabilityToStatus;
