const prisma = require('../db/prisma');
const { AppError } = require('../utils/errors');

class CustomerService {
    static async assertAssignableUser(assignedToId, organizationId) {
        if (!assignedToId) return;
        const user = await prisma.user.findFirst({
            where: { id: assignedToId, organizationId },
            select: { id: true }
        });
        if (!user) throw new AppError('Assigned user not found in your organization', 404, 'USER_NOT_FOUND');
    }

    static async assertUniquePhone(phone, organizationId, excludeId) {
        if (!phone) return;
        const existing = await prisma.customer.findFirst({
            where: {
                organizationId,
                phone,
                ...( excludeId ? { id: { not: excludeId } } : {} )
            },
            select: { id: true, name: true }
        });
        if (existing) {
            throw new AppError(`A customer with phone ${phone} already exists in your organization`, 409, 'DUPLICATE_CUSTOMER');
        }
    }

    static async getCustomers(organizationId, query, role, userId) {
        const { page = 1, limit = 20, status, search, assignedToId, sort = 'desc' } = query;
        const skip = (page - 1) * limit;

        const where = { organizationId };

        // Role-based scoping
        if (role === 'SALES_EXECUTIVE' || role === 'CHANNEL_PARTNER') {
            where.assignedToId = userId;
        } else if (assignedToId) {
            where.assignedToId = assignedToId;
        }

        if (status) where.status = status;

        if (search) {
            where.OR = [
                { name: { contains: search, mode: 'insensitive' } },
                { phone: { contains: search, mode: 'insensitive' } },
                { email: { contains: search, mode: 'insensitive' } }
            ];
        }

        const [customers, total] = await Promise.all([
            prisma.customer.findMany({
                where,
                skip: parseInt(skip),
                take: parseInt(limit),
                orderBy: { createdAt: sort === 'asc' ? 'asc' : 'desc' },
                include: {
                    assignedTo: { select: { id: true, name: true } },
                    _count: { select: { bookings: true } }
                }
            }),
            prisma.customer.count({ where })
        ]);

        return { customers, total, pages: Math.ceil(total / limit) };
    }

    static async getCustomerById(id, organizationId) {
        const customer = await prisma.customer.findFirst({
            where: { id, organizationId },
            include: {
                assignedTo: { select: { id: true, name: true } },
                bookings: {
                    include: {
                        property: { select: { id: true, title: true, unitNumber: true, status: true } },
                        project: { select: { id: true, name: true } },
                        lead: { select: { id: true, name: true, status: true } }
                    },
                    orderBy: { createdAt: 'desc' }
                }
            }
        });
        if (!customer) throw new AppError('Customer not found', 404, 'NOT_FOUND');
        return customer;
    }

    static async createCustomer(data, organizationId) {
        const phone = (data.phone || '').trim();
        await CustomerService.assertUniquePhone(phone, organizationId);
        await CustomerService.assertAssignableUser(data.assignedToId, organizationId);

        return prisma.customer.create({
            data: {
                organizationId,
                name: data.name,
                phone,
                email: data.email || null,
                status: data.status || 'ACTIVE',
                notes: data.notes || null,
                assignedToId: data.assignedToId || null
            },
            include: {
                assignedTo: { select: { id: true, name: true } }
            }
        });
    }

    static async updateCustomer(id, data, organizationId, role, userId) {
        const customer = await prisma.customer.findFirst({ where: { id, organizationId } });
        if (!customer) throw new AppError('Customer not found', 404, 'NOT_FOUND');

        if ((role === 'SALES_EXECUTIVE' || role === 'CHANNEL_PARTNER') && customer.assignedToId !== userId) {
            throw new AppError('Not authorized to update this customer', 403, 'FORBIDDEN');
        }

        if (data.phone !== undefined && data.phone.trim() !== customer.phone) {
            await CustomerService.assertUniquePhone(data.phone.trim(), organizationId, id);
        }
        if (data.assignedToId !== undefined && data.assignedToId !== null) {
            await CustomerService.assertAssignableUser(data.assignedToId, organizationId);
        }

        const updateData = {};
        if (data.name !== undefined) updateData.name = data.name;
        if (data.phone !== undefined) updateData.phone = data.phone.trim();
        if (data.email !== undefined) updateData.email = data.email;
        if (data.status !== undefined) updateData.status = data.status;
        if (data.notes !== undefined) updateData.notes = data.notes;
        if (data.assignedToId !== undefined) updateData.assignedToId = data.assignedToId;

        return prisma.customer.update({
            where: { id },
            data: updateData,
            include: {
                assignedTo: { select: { id: true, name: true } }
            }
        });
    }

    static async deleteCustomer(id, organizationId, role, userId) {
        const customer = await prisma.customer.findFirst({
            where: { id, organizationId },
            include: { _count: { select: { bookings: true } } }
        });
        if (!customer) throw new AppError('Customer not found', 404, 'NOT_FOUND');

        if ((role === 'SALES_EXECUTIVE' || role === 'CHANNEL_PARTNER') && customer.assignedToId !== userId) {
            throw new AppError('Not authorized to delete this customer', 403, 'FORBIDDEN');
        }

        if (customer._count.bookings > 0) {
            throw new AppError('Customer has bookings and cannot be deleted. Mark them inactive instead.', 409, 'CUSTOMER_HAS_BOOKINGS');
        }

        await prisma.customer.delete({ where: { id } });
        return true;
    }

    static async getCustomersByEmployee(employeeId, organizationId) {
        return prisma.customer.findMany({
            where: { assignedToId: employeeId, organizationId },
            orderBy: { createdAt: 'desc' },
            include: {
                _count: { select: { bookings: true } }
            }
        });
    }
}

module.exports = CustomerService;
