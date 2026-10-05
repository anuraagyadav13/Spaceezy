const prisma = require('../db/prisma');
const { AppError } = require('../utils/errors');

class ConfigurationService {
    static normalize(data = {}) {
        const allowed = ['name', 'bhk', 'areaSaleable', 'basePrice', 'active'];
        const payload = {};
        for (const key of allowed) {
            if (data[key] !== undefined) payload[key] = data[key];
        }
        return payload;
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

    static async deleteConfiguration(configId, projectId, organizationId) {
        const existing = await prisma.configuration.findFirst({
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
