const { z } = require('zod');

const getBookingsQuerySchema = {
    query: z.object({
        page: z.string().optional(),
        limit: z.string().optional(),
        paymentStatus: z.string().optional(),
        search: z.string().optional(),
        sort: z.string().optional()
    })
};

const createBookingSchema = {
    body: z.object({
        customerId: z.string().uuid('Valid Customer ID is required'),
        propertyId: z.string().uuid('Valid Property ID is required'),
        amount: z.number().min(0, 'Amount must be positive'),
        paymentStatus: z.enum(['PENDING', 'PARTIAL', 'COMPLETED', 'CANCELLED']).optional()
    })
};

module.exports = {
    getBookingsQuerySchema,
    createBookingSchema
};
