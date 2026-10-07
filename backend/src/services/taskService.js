const prisma = require('../db/prisma');
const { AppError } = require('../utils/errors');
const { audit, AUDIT_ACTIONS } = require('../utils/audit');

const TERMINAL = ['COMPLETED', 'CANCELLED'];
const ALLOWED_TRANSITIONS = {
    PENDING: ['COMPLETED', 'CANCELLED'],
    COMPLETED: ['PENDING'],
    CANCELLED: ['PENDING']
};

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
        if (data.sourceCallId) {
            const call = await prisma.call.findFirst({ where: { id: data.sourceCallId, organizationId } });
            if (!call) throw new AppError('Source call not found', 404, 'NOT_FOUND');
        }

        return prisma.task.create({
            data: {
                organizationId,
                title: data.title,
                description: data.description || null,
                type: data.type || 'FOLLOW_UP',
                status: data.status || 'PENDING',
                priority: data.priority || 'MEDIUM',
                dueDate: new Date(data.dueDate),
                leadId: data.leadId || null,
                assignedToId: data.assignedToId || userId,
                createdById: userId,
                sourceCallId: data.sourceCallId || null
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
        if (data.status !== undefined) {
            if (data.status !== task.status) {
                TaskService.validateTransition(task.status, data.status);
            }
            updateData.status = data.status;
            updateData.completedAt = data.status === 'COMPLETED' ? new Date() : null;
        }
        if (data.dueDate !== undefined) updateData.dueDate = new Date(data.dueDate);
        if (data.priority !== undefined) updateData.priority = data.priority;
        if (data.assignedToId !== undefined) updateData.assignedToId = data.assignedToId;
        if (data.leadId !== undefined) updateData.leadId = data.leadId;

        const updated = await prisma.task.update({
            where: { id },
            data: updateData,
            include: {
                lead: { select: { id: true, name: true, phone: true } },
                assignedTo: { select: { id: true, name: true } }
            }
        });

        if (updateData.status && task.type === 'FOLLOW_UP' && task.leadId) {
            await prisma.$transaction(async (tx) => {
                await TaskService._refreshLeadNextFollowUp(tx, task.leadId);
            });
        }
        return updated;
    }

    static async toggleTaskStatus(id, organizationId, role, userId) {
        const task = await prisma.task.findFirst({ where: { id, organizationId } });
        if (!task) throw new AppError('Task not found', 404, 'NOT_FOUND');
        TaskService.assertTaskScope(task, role, userId);

        const newStatus = task.status === 'PENDING' ? 'COMPLETED' : 'PENDING';
        if (task.status === 'CANCELLED' && newStatus === 'PENDING') {
            // Reopening a cancelled task is allowed (PENDING).
        } else {
            TaskService.validateTransition(task.status, newStatus);
        }

        const updated = await prisma.task.update({
            where: { id },
            data: { status: newStatus, completedAt: newStatus === 'COMPLETED' ? new Date() : null },
            include: {
                lead: { select: { id: true, name: true, phone: true } },
                assignedTo: { select: { id: true, name: true } }
            }
        });

        if (task.type === 'FOLLOW_UP' && task.leadId) {
            await prisma.$transaction(async (tx) => {
                await TaskService._refreshLeadNextFollowUp(tx, task.leadId);
                await tx.leadActivity.create({
                    data: {
                        organizationId,
                        leadId: task.leadId,
                        type: 'FOLLOW_UP',
                        description: `Follow-up ${newStatus.toLowerCase()}: ${task.title}`,
                        performedById: userId,
                        metadata: { taskId: task.id, status: newStatus }
                    }
                });
            });
        }
        return updated;
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

    static assertTaskScope(task, role, userId) {
        if ((role === 'SALES_EXECUTIVE' || role === 'CHANNEL_PARTNER') && task.assignedToId !== userId) {
            throw new AppError('Not authorized to update this task', 403, 'FORBIDDEN');
        }
    }

    // Recompute the lead's next follow-up pointer after a lifecycle change.
    static async _refreshLeadNextFollowUp(tx, leadId) {
        if (!leadId) return;
        const next = await tx.task.findFirst({
            where: { leadId, type: 'FOLLOW_UP', status: 'PENDING' },
            orderBy: { dueDate: 'asc' }
        });
        await tx.lead.update({
            where: { id: leadId },
            data: { nextFollowUpAt: next ? next.dueDate : null }
        });
    }

    static validateTransition(current, next) {
        if (current === next) return 'noop';
        const allowed = ALLOWED_TRANSITIONS[current] || [];
        if (!allowed.includes(next)) {
            throw new AppError(`Cannot change status from ${current} to ${next}`, 409, 'INVALID_TASK_TRANSITION');
        }
        return 'ok';
    }

    static async updateTaskStatus(id, status, organizationId, role, userId) {
        const task = await prisma.task.findFirst({ where: { id, organizationId } });
        if (!task) throw new AppError('Task not found', 404, 'NOT_FOUND');
        TaskService.assertTaskScope(task, role, userId);

        const transition = TaskService.validateTransition(task.status, status);
        if (transition === 'noop') return task;

        const updated = await prisma.$transaction(async (tx) => {
            const result = await tx.task.update({
                where: { id },
                data: {
                    status,
                    completedAt: status === 'COMPLETED' ? new Date() : null
                }
            });
            if (task.type === 'FOLLOW_UP' && task.leadId) {
                await TaskService._refreshLeadNextFollowUp(tx, task.leadId);
                await tx.leadActivity.create({
                    data: {
                        organizationId,
                        leadId: task.leadId,
                        type: 'FOLLOW_UP',
                        description: `Follow-up ${status.toLowerCase()}: ${task.title}`,
                        performedById: userId,
                        metadata: { taskId: task.id, status }
                    }
                });
            }
            return result;
        });

        await audit(organizationId, userId, AUDIT_ACTIONS.FOLLOWUP_CHANGED, 'Task', id, { status, from: task.status });
        return updated;
    }

    static async rescheduleTask(id, data, organizationId, role, userId) {
        if (!data.dueDate) throw new AppError('dueDate is required', 400, 'VALIDATION_ERROR');
        const dueDate = new Date(data.dueDate);
        if (Number.isNaN(dueDate.getTime())) {
            throw new AppError('dueDate must be a valid date', 400, 'VALIDATION_ERROR');
        }

        const task = await prisma.task.findFirst({ where: { id, organizationId } });
        if (!task) throw new AppError('Task not found', 404, 'NOT_FOUND');
        TaskService.assertTaskScope(task, role, userId);

        if (TERMINAL.includes(task.status)) {
            throw new AppError(`A ${task.status.toLowerCase()} task cannot be rescheduled`, 409, 'TASK_NOT_PENDING');
        }

        const updated = await prisma.$transaction(async (tx) => {
            const result = await tx.task.update({
                where: { id },
                data: {
                    dueDate,
                    rescheduledAt: new Date(),
                    rescheduleReason: data.reason || null
                }
            });
            if (task.type === 'FOLLOW_UP' && task.leadId) {
                await tx.lead.update({ where: { id: task.leadId }, data: { nextFollowUpAt: dueDate } });
                await tx.leadActivity.create({
                    data: {
                        organizationId,
                        leadId: task.leadId,
                        type: 'FOLLOW_UP',
                        description: `Follow-up rescheduled to ${dueDate.toISOString()}${data.reason ? ` — ${data.reason}` : ''}`,
                        performedById: userId,
                        metadata: { taskId: task.id, dueDate: dueDate.toISOString(), previousDueDate: task.dueDate.toISOString(), callId: task.sourceCallId }
                    }
                });
            }
            return result;
        });

        await audit(organizationId, userId, AUDIT_ACTIONS.FOLLOWUP_RESCHEDULED, 'Task', id, {
            dueDate: dueDate.toISOString(),
            previousDueDate: task.dueDate.toISOString(),
            reason: data.reason || null
        });
        return updated;
    }

    static async cancelTask(id, organizationId, role, userId) {
        return TaskService.updateTaskStatus(id, 'CANCELLED', organizationId, role, userId);
    }
}

module.exports = TaskService;
