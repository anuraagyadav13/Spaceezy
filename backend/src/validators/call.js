const { z } = require('zod');

const idParamsSchema = {
    params: z.object({
        id: z.string().uuid('id must be a valid UUID')
    })
};

const initiateCallSchema = {
    body: z.object({
        leadId: z.string().uuid('leadId must be a valid UUID'),
        direction: z.enum(['INBOUND', 'OUTBOUND']).optional(),
        notes: z.string().max(2000).optional()
    })
};

const nextActionSchema = z.object({
    type: z.enum(['NONE', 'CALL_BACK', 'FOLLOW_UP', 'TASK', 'WHATSAPP', 'SITE_VISIT', 'QUOTATION']),
    scheduledAt: z.string().optional(),
    dueDate: z.string().optional(),
    title: z.string().max(200).optional(),
    reason: z.string().max(1000).optional()
}).refine(
    (a) => !['CALL_BACK', 'FOLLOW_UP'].includes(a.type) || Boolean(a.scheduledAt),
    { message: 'scheduledAt is required for callback/follow-up', path: ['scheduledAt'] }
).refine(
    (a) => a.type !== 'TASK' || (a.title && a.title.trim().length > 0),
    { message: 'title is required for task', path: ['title'] }
);

const outcomeSchema = {
    body: z.object({
        disposition: z.enum([
            'INTERESTED', 'NOT_INTERESTED', 'CALL_BACK', 'FOLLOW_UP_REQUIRED',
            'NO_ANSWER', 'BUSY', 'WRONG_NUMBER', 'SITE_VISIT_INTERESTED',
            'QUOTATION_INTERESTED', 'OTHER'
        ]),
        notes: z.string().max(2000).optional(),
        nextAction: nextActionSchema.optional()
    })
};

const getCallsQuerySchema = {
    query: z.object({
        page: z.string().regex(/^\d+$/).optional(),
        limit: z.string().regex(/^\d+$/).optional(),
        leadId: z.string().uuid().optional(),
        status: z.enum(['INITIATED', 'RINGING', 'IN_PROGRESS', 'COMPLETED', 'MISSED', 'FAILED']).optional(),
        direction: z.enum(['INBOUND', 'OUTBOUND']).optional(),
        from: z.string().optional(),
        to: z.string().optional()
    })
};

module.exports = {
    idParamsSchema,
    initiateCallSchema,
    outcomeSchema,
    getCallsQuerySchema
};
