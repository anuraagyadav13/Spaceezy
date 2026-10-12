const { z } = require('zod');

const paymentStatusEnum = z.enum(['PENDING', 'PARTIAL', 'COMPLETED', 'CANCELLED']);
const creatablePaymentStatusEnum = z.enum(['PENDING', 'PARTIAL', 'COMPLETED']);

const idParamsSchema = {
    params: z.object({
        id: z.string().uuid('id must be a valid UUID')
    })
};

const getBookingsQuerySchema = {
    query: z.object({
        page: z.string().regex(/^\d+$/, 'page must be a number').optional(),
        limit: z.string().regex(/^\d+$/, 'limit must be a number').optional(),
        paymentStatus: paymentStatusEnum.optional(),
        search: z.string().optional(),
        sort: z.enum(['asc', 'desc']).optional()
    })
};

const createBookingSchema = {
    body: z.object({
        customerId: z.string().uuid('Valid Customer ID is required').optional(),
        propertyId: z.string().uuid('Valid Property ID is required').optional(),
        // Bulk-mode target: exactly one of propertyId / configurationId.
        configurationId: z.string().uuid('Valid Configuration ID is required').optional(),
        amount: z.number().positive('Amount must be positive').max(999999999999, 'Amount exceeds the supported maximum').optional(),
        paymentStatus: creatablePaymentStatusEnum.optional(),
        leadId: z.string().uuid('leadId must be a valid UUID').optional(),
        quotationId: z.string().uuid('quotationId must be a valid UUID').optional(),
        customer: z.object({
            name: z.string().min(1, 'Customer name is required').optional(),
            phone: z.string().min(1, 'Customer phone is required').optional(),
            email: z.string().email('email must be a valid email').optional().nullable()
        }).optional()
    }).refine(
        (body) => Boolean(body.propertyId) !== Boolean(body.configurationId),
        { message: 'Provide exactly one of propertyId or configurationId', path: ['propertyId'] }
    ).refine(
        (body) => body.customerId || (body.customer && body.customer.phone) || body.leadId,
        { message: 'customerId, leadId or customer details are required', path: ['customerId'] }
    ).refine(
        (body) => body.amount !== undefined || body.quotationId !== undefined,
        { message: 'amount or quotationId is required', path: ['amount'] }
    ).refine(
        (body) => !body.quotationId || body.leadId,
        { message: 'quotationId requires leadId', path: ['quotationId'] }
    ).refine(
        (body) => !body.configurationId || body.amount !== undefined,
        { message: 'amount is required for bulk configuration bookings', path: ['amount'] }
    ).refine(
        (body) => !body.configurationId || !body.quotationId,
        { message: 'quotationId cannot be used with bulk configuration bookings', path: ['quotationId'] }
    )
};

const updatePaymentStatusSchema = {
    body: z.object({
        paymentStatus: paymentStatusEnum
    })
};

module.exports = {
    idParamsSchema,
    getBookingsQuerySchema,
    createBookingSchema,
    updatePaymentStatusSchema
};
