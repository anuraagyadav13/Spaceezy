const prisma = require('../db/prisma');
const { AppError } = require('../utils/errors');

class ProjectService {
    static async getProjects(organizationId, query) {
        const { page = 1, limit = 10, search, status, type, sort = 'desc' } = query;
        const skip = (page - 1) * limit;

        const where = { organizationId };
        if (status) where.status = status;
        if (type) where.type = type;
        if (search) {
            where.OR = [
                { name: { contains: search, mode: 'insensitive' } },
                { address: { contains: search, mode: 'insensitive' } },
                { city: { contains: search, mode: 'insensitive' } }
            ];
        }

        const [projects, total] = await Promise.all([
            prisma.project.findMany({
                where,
                skip: parseInt(skip),
                take: parseInt(limit),
                orderBy: { createdAt: sort === 'asc' ? 'asc' : 'desc' }
            }),
            prisma.project.count({ where })
        ]);

        return { projects, total, pages: Math.ceil(total / limit) };
    }

    static async getProjectById(id, organizationId) {
        const project = await prisma.project.findFirst({
            where: { id, organizationId },
            include: {
                properties: {
                    select: {
                        id: true,
                        title: true,
                        status: true,
                        price: true
                    }
                }
            }
        });

        if (!project) throw new AppError('Project not found', 404, 'NOT_FOUND');
        return project;
    }

    static async createProject(data, organizationId) {
        return await prisma.project.create({
            data: {
                ...data,
                organizationId
            }
        });
    }

    static async updateProject(id, data, organizationId) {
        const existing = await prisma.project.findFirst({ where: { id, organizationId } });
        if (!existing) throw new AppError('Project not found', 404, 'NOT_FOUND');

        return await prisma.project.update({
            where: { id },
            data
        });
    }
}

module.exports = ProjectService;
