const prisma = require('../db/prisma');
const { AppError } = require('../utils/errors');

class BookingService {
    static async getBookings(organizationId, query, role, userId) {
        const { page = 1, limit = 20, paymentStatus, search, sort = 'desc' } = query;
        const skip = (page - 1) * limit;

        const where = { organizationId };

        if (role === 'SALES_EXECUTIVE' || role === 'CHANNEL_PARTNER') {
            where.assignedToId = userId;
        }

        if (paymentStatus) where.paymentStatus = paymentStatus;

        if (search) {
            where.customer = {
                OR: [
                    { name: { contains: search, mode: 'insensitive' } },
                    { phone: { contains: search, mode: 'insensitive' } }
                ]
            };
        }

        const [bookings, total] = await Promise.all([
            prisma.booking.findMany({
                where,
                skip: parseInt(skip),
                take: parseInt(limit),
                orderBy: { bookingDate: sort === 'asc' ? 'asc' : 'desc' },
                include: {
                    customer: { select: { id: true, name: true, phone: true } },
                    property: { select: { id: true, title: true, unitNumber: true } },
                    project: { select: { id: true, name: true } },
                    assignedTo: { select: { id: true, name: true } }
                }
            }),
            prisma.booking.count({ where })
        ]);

        return { bookings, total, pages: Math.ceil(total / limit) };
    }

    static async getBookingById(id, organizationId) {
        const booking = await prisma.booking.findFirst({
            where: { id, organizationId },
            include: {
                customer: true,
                property: { include: { project: { select: { name: true } } } },
                project: { select: { id: true, name: true } },
                assignedTo: { select: { id: true, name: true } }
            }
        });
        if (!booking) throw new AppError('Booking not found', 404, 'NOT_FOUND');
        return booking;
    }

    static async createBooking(data, organizationId, userId, userRole) {
        return await prisma.$transaction(async (tx) => {
            // 1. Tenant Isolation Checks
            const customer = await tx.customer.findFirst({
                where: { id: data.customerId, organizationId }
            });
            if (!customer) throw new AppError('Customer not found in your organization', 404, 'NOT_FOUND');

            const property = await tx.property.findFirst({
                where: { id: data.propertyId, organizationId }
            });
            if (!property) throw new AppError('Property not found in your organization', 404, 'NOT_FOUND');

            // 2. Concurrency Check (Optimistic Locking)
            if (property.status !== 'AVAILABLE') {
                throw new AppError('Property is no longer available', 409, 'CONFLICT');
            }

            // Lock property via versioning
            const updatedProperty = await tx.property.updateMany({
                where: {
                    id: data.propertyId,
                    version: property.version,
                    organizationId
                },
                data: {
                    status: 'RESERVED',
                    version: { increment: 1 }
                }
            });

            if (updatedProperty.count === 0) {
                // Another transaction got there first and incremented the version
                throw new AppError('Property was booked by another user. Please try another unit.', 409, 'CONFLICT_CONCURRENCY');
            }

            // 3. Create Booking
            const booking = await tx.booking.create({
                data: {
                    organizationId,
                    customerId: data.customerId,
                    propertyId: data.propertyId,
                    projectId: property.projectId,
                    amount: data.amount,
                    paymentStatus: data.paymentStatus || 'PENDING',
                    assignedToId: userId
                }
            });

            return booking;
        });
    }

    static async cancelBooking(bookingId, organizationId, userId, userRole) {
        return await prisma.$transaction(async (tx) => {
            // Find booking with tenant isolation
            const booking = await tx.booking.findFirst({
                where: { id: bookingId, organizationId }
            });

            if (!booking) throw new AppError('Booking not found', 404, 'NOT_FOUND');

            if (booking.paymentStatus === 'CANCELLED') {
                return booking; // Idempotent
            }

            // Access control
            if ((userRole === 'SALES_EXECUTIVE' || userRole === 'CHANNEL_PARTNER') && booking.assignedToId !== userId) {
                throw new AppError('You do not have permission to modify this booking', 403, 'FORBIDDEN');
            }

            // 1. Update booking
            const updatedBooking = await tx.booking.update({
                where: { id: bookingId },
                data: { paymentStatus: 'CANCELLED' }
            });

            // 2. Check if property needs to be released
            // (Only release if there are NO OTHER active bookings for this property)
            const activeBookings = await tx.booking.count({
                where: {
                    propertyId: booking.propertyId,
                    paymentStatus: { not: 'CANCELLED' }
                }
            });

            if (activeBookings === 0 && booking.propertyId) {
                await tx.property.update({
                    where: { id: booking.propertyId },
                    data: {
                        status: 'AVAILABLE',
                        version: { increment: 1 }
                    }
                });
            }

            return updatedBooking;
        });
    }

    static async completePayment(bookingId, organizationId, userId, userRole) {
        return await prisma.$transaction(async (tx) => {
            const booking = await tx.booking.findFirst({
                where: { id: bookingId, organizationId }
            });

            if (!booking) throw new AppError('Booking not found', 404, 'NOT_FOUND');
            if (booking.paymentStatus === 'CANCELLED') throw new AppError('Cannot complete a cancelled booking', 400, 'BAD_REQUEST');

            // Access control
            if ((userRole === 'SALES_EXECUTIVE' || userRole === 'CHANNEL_PARTNER') && booking.assignedToId !== userId) {
                throw new AppError('You do not have permission to modify this booking', 403, 'FORBIDDEN');
            }

            const updatedBooking = await tx.booking.update({
                where: { id: bookingId },
                data: { paymentStatus: 'COMPLETED' }
            });

            if (booking.propertyId) {
                await tx.property.update({
                    where: { id: booking.propertyId },
                    data: {
                        status: 'SOLD',
                        version: { increment: 1 }
                    }
                });
            }

            return updatedBooking;
        });
    }
}

module.exports = BookingService;
