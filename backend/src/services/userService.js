const prisma = require('../db/prisma');
const { AppError } = require('../utils/errors');
const argon2 = require('argon2');

class UserService {
    static async getUsers(organizationId, query) {
        const { page = 1, limit = 10, search, role, status, sort = 'desc' } = query;
        const skip = (page - 1) * limit;

        const where = { organizationId };

        if (role) where.role = role;
        if (status) where.status = status;
        if (search) {
            where.OR = [
                { name: { contains: search, mode: 'insensitive' } },
                { email: { contains: search, mode: 'insensitive' } },
                { phone: { contains: search } }
            ];
        }

        const [users, total] = await Promise.all([
            prisma.user.findMany({
                where,
                skip: parseInt(skip),
                take: parseInt(limit),
                orderBy: { createdAt: sort === 'asc' ? 'asc' : 'desc' },
                select: {
                    id: true,
                    name: true,
                    email: true,
                    phone: true,
                    role: true,
                    status: true,
                    createdAt: true
                }
            }),
            prisma.user.count({ where })
        ]);

        return { users, total, pages: Math.ceil(total / limit) };
    }

    static async getUserById(id, organizationId) {
        const user = await prisma.user.findFirst({
            where: { id, organizationId },
            select: {
                id: true,
                name: true,
                email: true,
                phone: true,
                role: true,
                status: true,
                createdAt: true
            }
        });

        if (!user) throw new AppError('User not found', 404, 'NOT_FOUND');
        return user;
    }

    static async createUser(data, organizationId) {
        const existing = await prisma.user.findFirst({
            where: { email: data.email, organizationId }
        });

        if (existing) {
            throw new AppError('User with this email already exists', 400, 'BAD_REQUEST');
        }

        const passwordHash = await argon2.hash(data.password);
        
        const user = await prisma.user.create({
            data: {
                organizationId,
                name: data.name,
                email: data.email,
                phone: data.phone,
                passwordHash,
                role: data.role || 'SALES_EXECUTIVE',
                status: data.status || 'ACTIVE'
            },
            select: {
                id: true,
                name: true,
                email: true,
                role: true,
                status: true
            }
        });

        return user;
    }

    static async updateUser(id, data, organizationId, requestUserRole) {
        const existing = await prisma.user.findFirst({ where: { id, organizationId } });
        if (!existing) throw new AppError('User not found', 404, 'NOT_FOUND');

        // Prevent escalating privileges
        if (data.role && data.role === 'SUPER_ADMIN' && requestUserRole !== 'SUPER_ADMIN') {
            throw new AppError('Cannot elevate role to SUPER_ADMIN', 403, 'FORBIDDEN');
        }

        const user = await prisma.user.update({
            where: { id },
            data,
            select: {
                id: true,
                name: true,
                email: true,
                phone: true,
                role: true,
                status: true
            }
        });

        return user;
    }

    static async deleteUser(id, organizationId) {
        const existing = await prisma.user.findFirst({ where: { id, organizationId } });
        if (!existing) throw new AppError('User not found', 404, 'NOT_FOUND');

        // Note: instead of hard deleting, we might want to just set status to INACTIVE 
        // to preserve foreign keys. The requirements say support activation/deactivation.
        await prisma.user.update({
            where: { id },
            data: { status: 'INACTIVE' }
        });

        return true;
    }

    static async getUserProfile(id, organizationId) {
        const user = await prisma.user.findFirst({
            where: { id, organizationId },
            select: {
                id: true,
                name: true,
                email: true,
                phone: true,
                role: true,
                status: true,
                createdAt: true
            }
        });

        if (!user) throw new AppError('User not found', 404, 'NOT_FOUND');

        const [leads, clients, siteVisits, bookings, followups] = await Promise.all([
            prisma.lead.findMany({
                where: { assignedToId: id, organizationId },
                select: { id: true, name: true, status: true, source: true, createdAt: true },
                take: 20,
                orderBy: { createdAt: 'desc' }
            }),
            prisma.customer.findMany({
                where: { assignedToId: id, organizationId },
                select: { id: true, name: true, email: true, phone: true, createdAt: true },
                take: 20,
                orderBy: { createdAt: 'desc' }
            }),
            prisma.siteVisit.findMany({
                where: { assignedToId: id, organizationId },
                select: { id: true, leadName: true, property: true, date: true, status: true },
                take: 20,
                orderBy: { createdAt: 'desc' }
            }),
            prisma.booking.findMany({
                where: { assignedToId: id, organizationId },
                select: { id: true, clientName: true, property: true, amount: true, paymentStatus: true },
                take: 20,
                orderBy: { createdAt: 'desc' }
            }),
            prisma.leadActivity.findMany({
                where: { performedById: id, organizationId, type: { in: ['FOLLOW_UP', 'CALL', 'SITE_VISIT'] } },
                select: { id: true, type: true, description: true, metadata: true, createdAt: true },
                take: 20,
                orderBy: { createdAt: 'desc' }
            })
        ]);

        return {
            ...user,
            leads,
            clients,
            siteVisits,
            bookings,
            followups: followups.map(f => ({
                id: f.id,
                type: f.type,
                notes: f.description,
                dueDate: f.metadata?.dueDate || f.createdAt.toISOString().slice(0, 10),
                status: f.metadata?.followupStatus || 'Pending'
            }))
        };
    }
}

module.exports = UserService;
