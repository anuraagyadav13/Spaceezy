const prisma = require('../db/prisma');
const { AppError } = require('../utils/errors');

// Inventory counter keys. These are NEVER writable through the generic
// create/update payload — counters change only via create (initial bulk
// setup) or the dedicated inventory endpoint with optimistic concurrency.
const INVENTORY_KEYS = ['totalUnits', 'availableUnits'];

class ConfigurationService {
    static normalize(data = {}) {
        const allowed = ['name', 'bhk', 'areaSaleable', 'basePrice', 'active', 'areaMin', 'areaMax', 'priceMin', 'priceMax'];
        const payload = {};
        for (const key of allowed) {
            if (data[key] !== undefined) payload[key] = data[key];
        }
        return payload;
    }

    // Bulk mode = both counters set. NULL/missing counters = classic
    // unit-tracked mode (availability derives from linked Property rows).
    static isBulkMode(config) {
        return !!config
            && config.totalUnits !== null && config.totalUnits !== undefined
            && config.availableUnits !== null && config.availableUnits !== undefined;
    }

    // Sum stored bulk counters across configurations. Bulk configs have zero
    // linked Property rows (enforced at write time), so these sums can be
    // added to unit-derived counts without double-counting.
    static sumBulkCounters(configs) {
        let total = 0;
        let available = 0;
        for (const config of configs || []) {
            if (!ConfigurationService.isBulkMode(config)) continue;
            total += config.totalUnits || 0;
            available += config.availableUnits || 0;
        }
        return { total, available };
    }

    static assertValidCounters(totalUnits, availableUnits) {
        if (totalUnits !== null && totalUnits !== undefined) {
            if (!Number.isInteger(totalUnits) || totalUnits < 0) {
                throw new AppError('totalUnits must be a non-negative integer', 400, 'VALIDATION_ERROR');
            }
        }
        if (availableUnits !== null && availableUnits !== undefined) {
            if (!Number.isInteger(availableUnits) || availableUnits < 0) {
                throw new AppError('availableUnits must be a non-negative integer', 400, 'VALIDATION_ERROR');
            }
        }
        const hasTotal = totalUnits !== null && totalUnits !== undefined;
        const hasAvailable = availableUnits !== null && availableUnits !== undefined;
        if (hasAvailable && !hasTotal) {
            throw new AppError('totalUnits is required when availableUnits is provided', 400, 'VALIDATION_ERROR');
        }
        if (hasTotal && hasAvailable && availableUnits > totalUnits) {
            throw new AppError('availableUnits cannot exceed totalUnits', 400, 'VALIDATION_ERROR');
        }
    }

    static async assertProject(projectId, organizationId) {
        const project = await prisma.project.findFirst({
            where: { id: projectId, organizationId },
            select: { id: true, name: true, projectType: true }
        });
        if (!project) throw new AppError('Project not found', 404, 'NOT_FOUND');
        return project;
    }

    static async getConfigurations(projectId, organizationId) {
        await ConfigurationService.assertProject(projectId, organizationId);

        const configurations = await prisma.configuration.findMany({
            where: { projectId, organizationId },
            include: { _count: { select: { properties: true } } },
            orderBy: { createdAt: 'asc' }
        });
        return { configurations };
    }

    static async getConfiguration(configId, projectId, organizationId) {
        const configuration = await prisma.configuration.findFirst({
            where: { id: configId, projectId, organizationId },
            include: { _count: { select: { properties: true } } }
        });
        if (!configuration) throw new AppError('Configuration not found', 404, 'NOT_FOUND');
        return configuration;
    }

    static async createConfiguration(projectId, data, organizationId) {
        await ConfigurationService.assertProject(projectId, organizationId);

        const payload = ConfigurationService.normalize(data);
        if (!payload.name) throw new AppError('Configuration name is required', 400, 'BAD_REQUEST');

        // Bulk setup at creation: available defaults to total when only the
        // total is given (e.g. "18 units of 1 BHK"). available-without-total
        // and available > total are rejected. A brand-new configuration has
        // no linked units, so bulk mode is always safe here.
        const hasTotal = data.totalUnits !== undefined && data.totalUnits !== null;
        const hasAvailable = data.availableUnits !== undefined && data.availableUnits !== null;
        ConfigurationService.assertValidCounters(
            hasTotal ? data.totalUnits : null,
            hasAvailable ? data.availableUnits : null
        );
        const totalUnits = hasTotal ? data.totalUnits : null;
        const availableUnits = hasAvailable ? data.availableUnits : (hasTotal ? data.totalUnits : null);

        const existing = await prisma.configuration.findFirst({
            where: { projectId, organizationId, name: { equals: payload.name, mode: 'insensitive' } }
        });
        if (existing) {
            throw new AppError(`Configuration "${payload.name}" already exists in this project`, 409, 'CONFLICT');
        }

        try {
            return await prisma.configuration.create({
                data: {
                    ...payload,
                    totalUnits,
                    availableUnits,
                    projectId,
                    organizationId
                }
            });
        } catch (err) {
            if (err.code === 'P2002') {
                throw new AppError(`Configuration "${payload.name}" already exists in this project`, 409, 'CONFLICT');
            }
            throw err;
        }
    }

    static async updateConfiguration(configId, projectId, data, organizationId) {
        // Bulk counters must never change as a side effect of an unrelated
        // edit — they have a dedicated endpoint with optimistic concurrency.
        if (data && INVENTORY_KEYS.some((key) => data[key] !== undefined)) {
            throw new AppError(
                'Inventory counters can only be changed via the dedicated inventory endpoint (PATCH /:configId/inventory)',
                400,
                'USE_INVENTORY_ENDPOINT'
            );
        }

        const existing = await prisma.configuration.findFirst({
            where: { id: configId, projectId, organizationId },
            include: { _count: { select: { properties: true } } }
        });
        if (!existing) throw new AppError('Configuration not found', 404, 'NOT_FOUND');

        const payload = ConfigurationService.normalize(data);
        if (payload.name && payload.name !== existing.name) {
            const duplicate = await prisma.configuration.findFirst({
                where: {
                    projectId,
                    organizationId,
                    id: { not: configId },
                    name: { equals: payload.name, mode: 'insensitive' }
                }
            });
            if (duplicate) {
                throw new AppError(`Configuration "${payload.name}" already exists in this project`, 409, 'CONFLICT');
            }
        }

        try {
            return await prisma.configuration.update({
                where: { id: configId },
                data: payload
            });
        } catch (err) {
            if (err.code === 'P2002') {
                throw new AppError(`Configuration "${payload.name}" already exists in this project`, 409, 'CONFLICT');
            }
            throw err;
        }
    }

    // Explicit bulk-inventory adjustment with optimistic concurrency control.
    // Both counters set = switch to / stay in bulk mode; both null = clear
    // back to unit-tracked mode. The conditional update fails with 409 when
    // another update changed the inventory first — the client must re-fetch
    // (GET returns current totalUnits/availableUnits/inventoryVersion).
    static async updateInventory(configId, projectId, data, organizationId) {
        const { totalUnits = null, availableUnits = null, expectedInventoryVersion } = data || {};
        ConfigurationService.assertValidCounters(totalUnits, availableUnits);

        const clearing = totalUnits === null && availableUnits === null;

        const existing = await prisma.configuration.findFirst({
            where: { id: configId, projectId, organizationId },
            include: { _count: { select: { properties: true } } }
        });
        if (!existing) throw new AppError('Configuration not found', 404, 'NOT_FOUND');

        // Mixed mode is forbidden: bulk counters plus linked unit rows would
        // double-count the same inventory in every rollup. Both directly
        // linked units and stray same-label free-text rows block the switch.
        if (!clearing) {
            let conflicting = existing._count.properties;
            if (conflicting === 0) {
                conflicting = await prisma.property.count({
                    where: {
                        projectId,
                        organizationId,
                        configuration: { equals: existing.name, mode: 'insensitive' }
                    }
                });
            }
            if (conflicting > 0) {
                throw new AppError(
                    `Configuration "${existing.name}" has ${conflicting} individual unit record(s). ` +
                    'Bulk inventory mode requires zero linked units — remove or reassign the units first.',
                    409,
                    'MIXED_MODE'
                );
            }
        }

        const applied = await prisma.configuration.updateMany({
            where: { id: configId, projectId, organizationId, inventoryVersion: expectedInventoryVersion },
            data: {
                totalUnits,
                availableUnits,
                inventoryVersion: { increment: 1 }
            }
        });

        if (applied.count === 0) {
            const current = await prisma.configuration.findFirst({
                where: { id: configId, projectId, organizationId }
            });
            if (!current) throw new AppError('Configuration not found', 404, 'NOT_FOUND');
            throw new AppError(
                'Inventory was modified by another update. Refresh the configuration and retry.',
                409,
                'INVENTORY_CONFLICT'
            );
        }

        return await prisma.configuration.findFirst({
            where: { id: configId, projectId, organizationId },
            include: { _count: { select: { properties: true } } }
        });
    }

    static async deleteConfiguration(configId, projectId, organizationId) {        const existing = await prisma.configuration.findFirst({
            where: { id: configId, projectId, organizationId },
            include: { _count: { select: { properties: true } } }
        });
        if (!existing) throw new AppError('Configuration not found', 404, 'NOT_FOUND');

        if (existing._count.properties > 0) {
            throw new AppError(
                'Configuration is in use by existing units. Deactivate it instead of deleting.',
                409,
                'CONFLICT'
            );
        }

        await prisma.configuration.delete({ where: { id: configId } });
        return { deleted: true };
    }
}

module.exports = ConfigurationService;
