const prisma = require('../db/prisma');
const { AppError } = require('../utils/errors');

class TaskService {
    static async getTasks(organizationId, query, role, userId) {
        const { page = 1, limit = 20, status, type, assignedToId, search, sort = 'desc' } = query;
        const skip = (page - 1) * limit;

        const where = { organizationId };

        // Role-based scoping
        if (role === 'SALES_EXECUTIVE' || role === 'CHANNEL_PARTNER') {
            where.assignedToId = userId;
        } else if (assignedToId) {
            where.assignedToId = assignedToId;
        }

        if (status) where.status = status;
        if (type) where.type = type;

        if (search) {
            where.OR = [
                { title: { contains: search, mode: 'insensitive' } },
                { description: { contains: search, mode: 'insensitive' } }
            ];
        }

        const [tasks, total] = await Promise.all([
            prisma.task.findMany({
                where,
                skip: parseInt(skip),
                take: parseInt(limit),
                orderBy: { dueDate: sort === 'asc' ? 'asc' : 'desc' },
                include: {
                    lead: { select: { id: true, name: true, phone: true } },
                    assignedTo: { select: { id: true, name: true } }
                }
            }),
            prisma.task.count({ where })
        ]);

        return { tasks, total, pages: Math.ceil(total / limit) };
    }

    static async getTaskById(id, organizationId) {
        const task = await prisma.task.findFirst({
            where: { id, organizationId },
            include: {
                lead: { select: { id: true, name: true, phone: true, email: true } },
                assignedTo: { select: { id: true, name: true } }
            }
        });
        if (!task) throw new AppError('Task not found', 404, 'NOT_FOUND');
        return task;
    }

    static async createTask(data, organizationId, userId) {
        // Validate lead if provided
        if (data.leadId) {
            const lead = await prisma.lead.findFirst({ where: { id: data.leadId, organizationId } });
            if (!lead) throw new AppError('Lead not found', 404, 'NOT_FOUND');
        }

        return prisma.task.create({
            data: {
                organizationId,
                title: data.title,
                description: data.description || null,
                type: data.type || 'FOLLOW_UP',
                status: data.status || 'PENDING',
                dueDate: new Date(data.dueDate),
                leadId: data.leadId || null,
                assignedToId: data.assignedToId || userId
            },
            include: {
                lead: { select: { id: true, name: true, phone: true } },
                assignedTo: { select: { id: true, name: true } }
            }
        });
    }

    static async updateTask(id, data, organizationId, role, userId) {
        const task = await prisma.task.findFirst({ where: { id, organizationId } });
        if (!task) throw new AppError('Task not found', 404, 'NOT_FOUND');

        if ((role === 'SALES_EXECUTIVE' || role === 'CHANNEL_PARTNER') && task.assignedToId !== userId) {
            throw new AppError('Not authorized to update this task', 403, 'FORBIDDEN');
        }

        const updateData = {};
        if (data.title !== undefined) updateData.title = data.title;
        if (data.description !== undefined) updateData.description = data.description;
        if (data.type !== undefined) updateData.type = data.type;
        if (data.status !== undefined) updateData.status = data.status;
        if (data.dueDate !== undefined) updateData.dueDate = new Date(data.dueDate);
        if (data.assignedToId !== undefined) updateData.assignedToId = data.assignedToId;
        if (data.leadId !== undefined) updateData.leadId = data.leadId;

        return prisma.task.update({
            where: { id },
            data: updateData,
            include: {
                lead: { select: { id: true, name: true, phone: true } },
                assignedTo: { select: { id: true, name: true } }
            }
        });
    }

    static async toggleTaskStatus(id, organizationId, role, userId) {
        const task = await prisma.task.findFirst({ where: { id, organizationId } });
        if (!task) throw new AppError('Task not found', 404, 'NOT_FOUND');

        if ((role === 'SALES_EXECUTIVE' || role === 'CHANNEL_PARTNER') && task.assignedToId !== userId) {
            throw new AppError('Not authorized to update this task', 403, 'FORBIDDEN');
        }

        const newStatus = task.status === 'PENDING' ? 'COMPLETED' : 'PENDING';

        return prisma.task.update({
            where: { id },
            data: { status: newStatus },
            include: {
                lead: { select: { id: true, name: true, phone: true } },
                assignedTo: { select: { id: true, name: true } }
            }
        });
    }

    static async deleteTask(id, organizationId, role, userId) {
        const task = await prisma.task.findFirst({ where: { id, organizationId } });
        if (!task) throw new AppError('Task not found', 404, 'NOT_FOUND');

        if ((role === 'SALES_EXECUTIVE' || role === 'CHANNEL_PARTNER') && task.assignedToId !== userId) {
            throw new AppError('Not authorized to delete this task', 403, 'FORBIDDEN');
        }

        await prisma.task.delete({ where: { id } });
        return true;
    }

    static async getTasksByEmployee(employeeId, organizationId) {
        return prisma.task.findMany({
            where: { assignedToId: employeeId, organizationId },
            orderBy: { dueDate: 'desc' },
            include: {
                lead: { select: { id: true, name: true, phone: true } }
            }
        });
    }

    static async getOverdueTasks(organizationId, role, userId) {
        const where = {
            organizationId,
            status: 'PENDING',
            dueDate: { lt: new Date() }
        };
        if (role === 'SALES_EXECUTIVE' || role === 'CHANNEL_PARTNER') {
            where.assignedToId = userId;
        }

        return prisma.task.findMany({
            where,
            orderBy: { dueDate: 'asc' },
            include: {
                lead: { select: { id: true, name: true, phone: true } },
                assignedTo: { select: { id: true, name: true } }
            }
        });
    }
}

module.exports = TaskService;
