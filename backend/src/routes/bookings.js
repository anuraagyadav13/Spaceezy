const express = require('express');
const { getBookings, getBookingById, createBooking, cancelBooking, completePayment, updatePaymentStatus } = require('../controllers/bookings');
const { requireAuth, requirePermission } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { getBookingsQuerySchema, createBookingSchema } = require('../validators/booking');

const router = express.Router();

router.use(requireAuth());

router.get('/', requirePermission('booking:view'), validate(getBookingsQuerySchema), getBookings);
router.post('/', requirePermission('booking:create'), validate(createBookingSchema), createBooking);
router.get('/:id', requirePermission('booking:view'), getBookingById);
router.patch('/:id/cancel', requirePermission('booking:update'), cancelBooking);
router.patch('/:id/complete', requirePermission('booking:update'), completePayment);
router.patch('/:id/payment-status', requirePermission('booking:update'), updatePaymentStatus);

module.exports = router;
