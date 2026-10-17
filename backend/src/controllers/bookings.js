const { asyncHandler, AppError } = require('../utils/errors');
const BookingService = require('../services/bookingService');
const { maskContact } = require('../utils/pii');

const getBookings = asyncHandler(async (req, res) => {
    const { organizationId, role, userId } = req.auth;
    const result = await BookingService.getBookings(organizationId, req.query, role, userId);

    // Mask customer phone for roles without pii:view (list already scopes
    // restricted roles, but the include still carries the contact field).
    const bookings = (result.bookings || []).map((b) => (
        b.customer ? { ...b, customer: maskContact(b.customer, role) } : b
    ));

    res.status(200).json({
        success: true,
        data: { ...result, bookings },
        message: 'Bookings fetched successfully'
    });
});

const getBookingById = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { organizationId, role } = req.auth;
    const booking = await BookingService.getBookingById(id, organizationId);

    res.status(200).json({
        success: true,
        data: booking && booking.customer ? { ...booking, customer: maskContact(booking.customer, role) } : booking,
        message: 'Booking fetched successfully'
    });
});

const createBooking = asyncHandler(async (req, res) => {
    const { organizationId, userId, role } = req.auth;
    const booking = await BookingService.createBooking(req.body, organizationId, userId, role);

    res.status(201).json({
        success: true,
        data: booking,
        message: 'Booking created successfully'
    });
});

const cancelBooking = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { organizationId, userId, role } = req.auth;
    const booking = await BookingService.cancelBooking(id, organizationId, userId, role);

    res.status(200).json({
        success: true,
        data: booking,
        message: 'Booking cancelled successfully'
    });
});

const completePayment = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { organizationId, userId, role } = req.auth;
    const booking = await BookingService.completePayment(id, organizationId, userId, role);

    res.status(200).json({
        success: true,
        data: booking,
        message: 'Payment completed successfully'
    });
});

const updatePaymentStatus = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { paymentStatus } = req.body;
    const { organizationId, userId, role } = req.auth;

    if (!paymentStatus) throw new AppError('paymentStatus is required', 400, 'BAD_REQUEST');

    let booking;
    if (paymentStatus === 'CANCELLED') {
        booking = await BookingService.cancelBooking(id, organizationId, userId, role);
    } else if (paymentStatus === 'COMPLETED') {
        booking = await BookingService.completePayment(id, organizationId, userId, role);
    } else {
        booking = await BookingService.updatePaymentStatus(id, paymentStatus, organizationId, userId, role);
    }

    res.status(200).json({
        success: true,
        data: booking,
        message: 'Booking payment status updated successfully'
    });
});

module.exports = {
    getBookings,
    getBookingById,
    createBooking,
    cancelBooking,
    completePayment,
    updatePaymentStatus
};
