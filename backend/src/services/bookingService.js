const prisma = require('../db/prisma');
const { AppError } = require('../utils/errors');

const MAX_AMOUNT = 999999999999;
const ACTIVE_BOOKING_STATUSES = ['PENDING', 'PARTIAL', 'COMPLETED'];

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
                    property: { select: { id: true, title: true, unitNumber: true, status: true } },
                    project: { select: { id: true, name: true } },
                    assignedTo: { select: { id: true, name: true } },
                    lead: { select: { id: true, name: true, status: true } },
                    quotation: { select: { id: true, status: true, totalAmount: true } }
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
                assignedTo: { select: { id: true, name: true } },
                lead: { select: { id: true, name: true, status: true } },
                quotation: { select: { id: true, status: true, totalAmount: true, validUntil: true } }
            }
        });
        if (!booking) throw new AppError('Booking not found', 404, 'NOT_FOUND');
        return booking;
    }

    static assertOwnership(booking, userRole, userId) {
        if ((userRole === 'SALES_EXECUTIVE' || userRole === 'CHANNEL_PARTNER') && booking.assignedToId !== userId) {
            throw new AppError('You do not have permission to modify this booking', 403, 'FORBIDDEN');
        }
    }

    static validateAmount(amount) {
        const value = Number(amount);
        if (amount === undefined || amount === null || amount === '' || !Number.isFinite(value) || value <= 0 || value > MAX_AMOUNT) {
            throw new AppError('Amount must be a positive number within the supported range', 400, 'BAD_REQUEST');
        }
        return value;
    }

    /**
     * Resolves the customer for a booking inside the transaction.
     * Priority: explicit customerId > explicit customer payload > lead details.
     * Payloads are matched by phone (existing business rule) and created when missing,
     * so one customer can be linked from many leads without duplication.
     */
    static async resolveCustomer(tx, data, lead, organizationId, userId) {
        if (data.customerId) {
            const customer = await tx.customer.findFirst({
                where: { id: data.customerId, organizationId }
            });
            if (!customer) throw new AppError('Customer not found in your organization', 404, 'NOT_FOUND');
            return customer;
        }

        const source = data.customer && data.customer.phone ? data.customer : lead;
        const phone = source && source.phone ? String(source.phone).trim() : '';
        if (!phone) {
            throw new AppError('customerId or customer phone is required', 400, 'BAD_REQUEST');
        }
        const name = (source && source.name) ? String(source.name).trim() : '';
        if (!name) {
            throw new AppError('Customer name is required', 400, 'BAD_REQUEST');
        }
        const email = (data.customer && data.customer.email !== undefined)
            ? data.customer.email
            : (lead && lead.email) || null;

        let customer = await tx.customer.findFirst({ where: { organizationId, phone } });
        if (!customer) {
            customer = await tx.customer.create({
                data: {
                    organizationId,
                    name,
                    phone,
                    email,
                    assignedToId: (lead && lead.assignedToId) || userId
                }
            });
        }
        return customer;
    }

    /**
     * Validates lead + quotation + unit scope inside the transaction and
     * returns the authoritative booking amount.
     */
    static async validateScope(tx, data, property, organizationId, userId, userRole) {
        let lead = null;
        let amount = data.amount;

        if (data.leadId) {
            lead = await tx.lead.findFirst({ where: { id: data.leadId, organizationId } });
            if (!lead) throw new AppError('Lead not found', 404, 'NOT_FOUND');
            if ((userRole === 'SALES_EXECUTIVE' || userRole === 'CHANNEL_PARTNER') && lead.assignedToId !== userId) {
                throw new AppError('You do not have access to this lead', 403, 'FORBIDDEN');
            }
            if (lead.projectId && property.projectId && lead.projectId !== property.projectId) {
                throw new AppError('Lead, quotation and unit must belong to the same project', 400, 'CROSS_PROJECT_REFERENCE');
            }
            const activeBooking = await tx.booking.findFirst({
                where: { leadId: lead.id, organizationId, paymentStatus: { in: ACTIVE_BOOKING_STATUSES } }
            });
            if (activeBooking) {
                throw new AppError('This lead already has an active booking', 409, 'DUPLICATE_BOOKING');
            }
        }

        if (data.quotationId) {
            if (!data.leadId) {
                throw new AppError('quotationId can only be used when booking from a lead', 400, 'BAD_REQUEST');
            }
            const quotation = await tx.quotation.findFirst({
                where: { id: data.quotationId, organizationId }
            });
            if (!quotation) throw new AppError('Quotation not found', 404, 'NOT_FOUND');
            if (quotation.leadId !== data.leadId) {
                throw new AppError('Quotation does not belong to this lead', 400, 'QUOTATION_LEAD_MISMATCH');
            }
            if (quotation.status !== 'ACCEPTED') {
                throw new AppError('Quotation must be accepted before it can be converted to a booking', 409, 'QUOTATION_NOT_ACCEPTED');
            }
            if (quotation.propertyId && quotation.propertyId !== property.id) {
                throw new AppError('Quotation unit does not match the booking unit', 400, 'UNIT_MISMATCH');
            }
            if (!quotation.propertyId && quotation.projectId !== property.projectId) {
                throw new AppError('Quotation project does not match the booking unit project', 400, 'CROSS_PROJECT_REFERENCE');
            }

            const quotationAmount = Number(quotation.totalAmount);
            if (data.amount !== undefined && data.amount !== null && Number(data.amount) !== quotationAmount) {
                throw new AppError('Booking amount must match the accepted quotation total', 400, 'AMOUNT_MISMATCH');
            }
            amount = quotationAmount;
        }

        return { lead, amount: BookingService.validateAmount(amount) };
    }

    static async createBooking(data, organizationId, userId, userRole) {
        return await prisma.$transaction(async (tx) => {
            const property = await tx.property.findFirst({
                where: { id: data.propertyId, organizationId }
            });
            if (!property) throw new AppError('Property not found in your organization', 404, 'NOT_FOUND');

            const { lead, amount } = await BookingService.validateScope(tx, data, property, organizationId, userId, userRole);
            const customer = await BookingService.resolveCustomer(tx, data, lead, organizationId, userId);

            // Concurrency check (optimistic locking)
            if (property.status !== 'AVAILABLE') {
                throw new AppError('Property is no longer available', 409, 'CONFLICT');
            }

            const locked = await tx.property.updateMany({
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

            if (locked.count === 0) {
                throw new AppError('Property was booked by another user. Please try another unit.', 409, 'CONFLICT_CONCURRENCY');
            }

            let booking;
            try {
                booking = await tx.booking.create({
                    data: {
                        organizationId,
                        customerId: customer.id,
                        propertyId: data.propertyId,
                        projectId: property.projectId,
                        amount,
                        paymentStatus: data.paymentStatus || 'PENDING',
                        assignedToId: userId,
                        leadId: data.leadId || null,
                        quotationId: data.quotationId || null
                    }
                });
            } catch (error) {
                if (error && error.code === 'P2002') {
                    throw new AppError('This quotation has already been converted to a booking', 409, 'DUPLICATE_BOOKING');
                }
                throw error;
            }

            if (lead) {
                // Backfill empty inventory references for provenance
                if (!lead.projectId || !lead.propertyId) {
                    await tx.lead.update({
                        where: { id: lead.id },
                        data: {
                            ...( !lead.projectId ? { projectId: property.projectId } : {} ),
                            ...( !lead.propertyId ? { propertyId: data.propertyId } : {} )
                        }
                    });
                }

                if (lead.status !== 'BOOKED') {
                    await tx.lead.update({ where: { id: lead.id }, data: { status: 'BOOKED' } });
                    await tx.leadActivity.create({
                        data: {
                            organizationId,
                            leadId: lead.id,
                            type: 'STATUS_CHANGE',
                            description: `Stage changed from ${lead.status} to BOOKED`,
                            performedById: userId,
                            metadata: { from: lead.status, to: 'BOOKED', reason: 'booking confirmed', bookingId: booking.id }
                        }
                    });
                }

                await tx.leadActivity.create({
                    data: {
                        organizationId,
                        leadId: lead.id,
                        type: 'NOTE',
                        description: `Booking confirmed for ${customer.name}`,
                        performedById: userId,
                        metadata: { bookingId: booking.id, amount, propertyId: data.propertyId }
                    }
                });
            }

            return booking;
        });
    }

    static async createBookingFromLead(leadId, data, organizationId, userId, userRole) {
        const lead = await prisma.lead.findFirst({ where: { id: leadId, organizationId } });
        if (!lead) throw new AppError('Lead not found', 404, 'NOT_FOUND');

        if ((userRole === 'SALES_EXECUTIVE' || userRole === 'CHANNEL_PARTNER') && lead.assignedToId !== userId) {
            throw new AppError('You do not have access to this lead', 403, 'FORBIDDEN');
        }

        // The full conversion (customer resolution, quotation validation,
        // inventory lock, booking creation and lead write-back) runs in one
        // transaction inside createBooking.
        return await BookingService.createBooking({
            propertyId: data.propertyId,
            amount: data.amount,
            paymentStatus: data.paymentStatus,
            leadId,
            quotationId: data.quotationId,
            ...( data.customer && data.customer.phone ? { customer: data.customer } : {} )
        }, organizationId, userId, userRole);
    }

    static async cancelBooking(bookingId, organizationId, userId, userRole) {
        return await prisma.$transaction(async (tx) => {
            const booking = await tx.booking.findFirst({
                where: { id: bookingId, organizationId }
            });

            if (!booking) throw new AppError('Booking not found', 404, 'NOT_FOUND');

            BookingService.assertOwnership(booking, userRole, userId);

            if (booking.paymentStatus === 'CANCELLED') {
                return booking; // Idempotent: repeated cancellation is a no-op
            }

            if (booking.paymentStatus === 'COMPLETED') {
                throw new AppError('A fully paid booking cannot be cancelled. Use the refund workflow.', 409, 'PAYMENT_COMPLETED');
            }

            // Atomic claim: only one cancellation can transition the booking
            const claimed = await tx.booking.updateMany({
                where: { id: bookingId, organizationId, paymentStatus: { in: ['PENDING', 'PARTIAL'] } },
                data: { paymentStatus: 'CANCELLED' }
            });
            if (claimed.count === 0) {
                // A concurrent cancellation won the race; stay idempotent
                return { ...booking, paymentStatus: 'CANCELLED' };
            }

            const activeBookings = await tx.booking.count({
                where: {
                    propertyId: booking.propertyId,
                    paymentStatus: { not: 'CANCELLED' }
                }
            });

            if (activeBookings === 0 && booking.propertyId) {
                // Release only RESERVED inventory. NEVER release SOLD units.
                await tx.property.updateMany({
                    where: { id: booking.propertyId, organizationId, status: 'RESERVED' },
                    data: { status: 'AVAILABLE', version: { increment: 1 } }
                });
            }

            if (booking.leadId) {
                const lead = await tx.lead.findFirst({ where: { id: booking.leadId } });
                if (lead && lead.status === 'BOOKED') {
                    const activeQuotation = await tx.quotation.findFirst({
                        where: { leadId: lead.id, status: { in: ['DRAFT', 'SENT', 'ACCEPTED'] } }
                    });
                    const nextStatus = activeQuotation ? 'QUOTATION' : 'CONTACTED';
                    await tx.lead.update({ where: { id: lead.id }, data: { status: nextStatus } });
                    await tx.leadActivity.create({
                        data: {
                            organizationId,
                            leadId: lead.id,
                            type: 'STATUS_CHANGE',
                            description: `Stage changed from BOOKED to ${nextStatus}`,
                            performedById: userId,
                            metadata: { from: 'BOOKED', to: nextStatus, reason: 'booking cancelled', bookingId: bookingId }
                        }
                    });
                }
            }

            return { ...booking, paymentStatus: 'CANCELLED' };
        });
    }

    static async completePayment(bookingId, organizationId, userId, userRole) {
        return await prisma.$transaction(async (tx) => {
            const booking = await tx.booking.findFirst({
                where: { id: bookingId, organizationId }
            });

            if (!booking) throw new AppError('Booking not found', 404, 'NOT_FOUND');

            BookingService.assertOwnership(booking, userRole, userId);

            if (booking.paymentStatus === 'CANCELLED') {
                throw new AppError('Cannot complete a cancelled booking', 409, 'ALREADY_CANCELLED');
            }
            if (booking.paymentStatus === 'COMPLETED') {
                throw new AppError('Payment is already completed for this booking', 409, 'ALREADY_COMPLETED');
            }

            const completed = await tx.booking.updateMany({
                where: { id: bookingId, organizationId, paymentStatus: { in: ['PENDING', 'PARTIAL'] } },
                data: { paymentStatus: 'COMPLETED' }
            });
            if (completed.count === 0) {
                throw new AppError('Payment status was updated concurrently by another user', 409, 'CONFLICT_CONCURRENCY');
            }

            if (booking.propertyId) {
                // Close out inventory: RESERVED -> SOLD only (manual close-outs may already be SOLD)
                await tx.property.updateMany({
                    where: { id: booking.propertyId, organizationId, status: 'RESERVED' },
                    data: { status: 'SOLD', version: { increment: 1 } }
                });
            }

            return { ...booking, paymentStatus: 'COMPLETED' };
        });
    }

    static async updatePaymentStatus(bookingId, paymentStatus, organizationId, userId, userRole) {
        return await prisma.$transaction(async (tx) => {
            const booking = await tx.booking.findFirst({
                where: { id: bookingId, organizationId }
            });

            if (!booking) throw new AppError('Booking not found', 404, 'NOT_FOUND');

            BookingService.assertOwnership(booking, userRole, userId);

            if (booking.paymentStatus === 'CANCELLED') {
                throw new AppError('Cannot change payment status of a cancelled booking', 409, 'ALREADY_CANCELLED');
            }
            if (booking.paymentStatus === 'COMPLETED') {
                throw new AppError('Cannot demote a completed payment. Cancel the booking instead.', 409, 'PAYMENT_COMPLETED');
            }
            if (booking.paymentStatus === paymentStatus) {
                return booking;
            }

            const updated = await tx.booking.updateMany({
                where: { id: bookingId, organizationId, paymentStatus: { in: ['PENDING', 'PARTIAL'] } },
                data: { paymentStatus }
            });
            if (updated.count === 0) {
                throw new AppError('Payment status was updated concurrently by another user', 409, 'CONFLICT_CONCURRENCY');
            }

            return { ...booking, paymentStatus };
        });
    }
}

module.exports = BookingService;
