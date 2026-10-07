const { z } = require('zod');
const { STAGE_GROUPS, INACTIVE_STAGES } = require('../constants/stageGroups');
const { PROPERTY_TYPES, configurationsFor } = require('../utils/propertyRequirement');

const leadStatusEnum = z.enum(['NEW', 'CONTACTED', 'INTERESTED', 'QUALIFIED', 'SITE_VISIT', 'NEGOTIATION', 'BOOKED', 'CLOSED', 'LOST', 'FOLLOW_UP', 'QUOTATION']);

const stageEnum = z.enum([...Object.keys(STAGE_GROUPS), ...INACTIVE_STAGES]);

const idParamsSchema = {
    params: z.object({
        id: z.string().uuid('id must be a valid UUID')
    })
};

const inventoryRefFields = {
    projectId: z.string().uuid('projectId must be a valid UUID').nullish(),
    propertyId: z.string().uuid('propertyId must be a valid UUID').nullish()
};

// Structured customer requirement (Phase 7). preferredLocations references the
// canonical LocationState/LocationDistrict/LocationRegion hierarchy, never free text.
const requirementRefFields = {
    propertyType: z.enum(PROPERTY_TYPES).nullish(),
    configurations: z.array(z.string().min(1).max(50)).max(12).nullish(),
    budgetMin: z.coerce.number().min(0).nullish(),
    budgetMax: z.coerce.number().min(0).nullish(),
    preferredLocations: z.array(z.object({
        stateId: z.string().uuid('stateId must be a valid UUID'),
        districtId: z.string().uuid('districtId must be a valid UUID').nullish(),
        regionId: z.string().uuid('regionId must be a valid UUID').nullish()
    })).max(10).nullish()
};

const requirementChecks = (body, ctx) => {
    if (body.budgetMin != null && body.budgetMax != null && body.budgetMin > body.budgetMax) {
        ctx.addIssue({
            code: 'custom',
            path: ['budgetMax'],
            message: 'budgetMax must be greater than or equal to budgetMin'
        });
    }

    if (body.configurations && body.configurations.length > 0 && !body.propertyType) {
        ctx.addIssue({
            code: 'custom',
            path: ['propertyType'],
            message: 'propertyType is required when configurations are provided'
        });
        return;
    }

    if (body.configurations && body.propertyType) {
        const allowed = new Set(configurationsFor(body.propertyType));
        body.configurations.forEach((configuration, index) => {
            if (!allowed.has(configuration)) {
                ctx.addIssue({
                    code: 'custom',
                    path: ['configurations', index],
                    message: `"${configuration}" is not a valid ${body.propertyType} configuration`
                });
            }
        });
    }
};

const createLeadSchema = {
    body: z.object({
        name: z.string().min(1, 'Name is required'),
        phone: z.string().min(1, 'Phone is required'),
        email: z.string().email().optional().nullable(),
        source: z.string().optional().nullable(),
        campaign: z.string().optional().nullable(),
        landingPage: z.string().optional().nullable(),
        status: leadStatusEnum.optional().default('NEW'),
        assignedToId: z.string().uuid().optional().nullable(),
        assignedTo: z.string().uuid().optional().nullable(),
        stage: leadStatusEnum.optional(),
        interestedUnitType: z.string().optional().nullable(),
        preferredVisitDate: z.string().datetime().optional().nullable(),
        preferredVisitTime: z.string().optional().nullable(),
        message: z.string().optional().nullable(),
        nextFollowUpAt: z.string().datetime().optional().nullable(),
        ...inventoryRefFields,
        ...requirementRefFields,
        project: z.string().optional().nullable(), // For frontend compatibility (free text, not persisted)
        budget: z.string().optional().nullable() // For frontend compatibility
    }).superRefine(requirementChecks)
};

const updateLeadSchema = {
    body: z.object({
        name: z.string().optional(),
        phone: z.string().optional(),
        email: z.string().email().optional().nullable(),
        source: z.string().optional().nullable(),
        campaign: z.string().optional().nullable(),
        landingPage: z.string().optional().nullable(),
        status: leadStatusEnum.optional(),
        assignedToId: z.string().uuid().optional().nullable(),
        assignedTo: z.string().uuid().optional().nullable(),
        stage: leadStatusEnum.optional(),
        interestedUnitType: z.string().optional().nullable(),
        preferredVisitDate: z.string().datetime().optional().nullable(),
        preferredVisitTime: z.string().optional().nullable(),
        message: z.string().optional().nullable(),
        nextFollowUpAt: z.string().datetime().optional().nullable(),
        ...inventoryRefFields,
        ...requirementRefFields,
        project: z.string().optional().nullable(),
        budget: z.string().optional().nullable()
    }).superRefine(requirementChecks)
};

const getLeadsQuerySchema = {
    query: z.object({
        page: z.string().regex(/^\d+$/).transform(Number).optional().default("1"),
        limit: z.string().regex(/^\d+$/).transform(Number).optional().default("10"),
        search: z.string().optional(),
        status: leadStatusEnum.optional(),
        stage: stageEnum.optional(),
        source: z.string().optional(),
        assignedTo: z.string().uuid().optional(),
        projectId: z.string().uuid().optional(),
        from: z.string().refine((v) => !isNaN(Date.parse(v)), 'from is not a valid date').optional(),
        to: z.string().refine((v) => !isNaN(Date.parse(v)), 'to is not a valid date').optional(),
        sort: z.enum(['asc', 'desc']).optional().default('desc')
    })
};

const transitionStageSchema = {
    params: z.object({
        id: z.string().uuid('id must be a valid UUID')
    }),
    body: z.object({
        target: z.string().min(1, 'target is required'),
        reason: z.string().optional().nullable(),
        siteVisit: z.object({
            date: z.string().min(1, 'date is required').refine((v) => !isNaN(Date.parse(v)), 'date is not a valid date'),
            time: z.string().min(1, 'time is required'),
            projectId: z.string().uuid('projectId must be a valid UUID').optional(),
            propertyId: z.string().uuid('propertyId must be a valid UUID').optional()
        }).optional(),
        quotation: z.object({
            projectId: z.string().uuid('projectId must be a valid UUID'),
            propertyId: z.string().uuid('propertyId must be a valid UUID').optional().nullable(),
            totalAmount: z.number().positive('totalAmount must be positive'),
            validUntil: z.string().datetime().optional().nullable(),
            notes: z.string().optional().nullable()
        }).optional(),
        followUp: z.object({
            dueDate: z.string().min(1, 'dueDate is required').refine((v) => !isNaN(Date.parse(v)), 'dueDate is not a valid date'),
            title: z.string().optional(),
            notes: z.string().optional().nullable(),
            assignedToId: z.string().uuid('assignedToId must be a valid UUID').optional()
        }).optional()
    })
};

const logContactSchema = {
    params: z.object({
        id: z.string().uuid('id must be a valid UUID')
    }),
    body: z.object({
        channel: z.enum(['CALL', 'EMAIL', 'WHATSAPP', 'MANUAL']).optional(),
        notes: z.string().optional().nullable(),
        duration: z.number().int().nonnegative().optional().nullable()
    })
};

const scheduleFollowUpSchema = {
    params: z.object({
        id: z.string().uuid('id must be a valid UUID')
    }),
    body: z.object({
        dueDate: z.string().min(1, 'dueDate is required').refine((v) => !isNaN(Date.parse(v)), 'dueDate is not a valid date'),
        title: z.string().optional(),
        notes: z.string().optional().nullable(),
        assignedToId: z.string().uuid('assignedToId must be a valid UUID').optional()
    })
};

const interestedPropertyParamsSchema = {
    params: z.object({
        id: z.string().uuid('id must be a valid UUID'),
        propId: z.string().uuid('propId must be a valid UUID')
    })
};

const addInterestSchema = {
    params: z.object({
        id: z.string().uuid('id must be a valid UUID')
    }),
    body: z.object({
        propertyId: z.string().uuid('propertyId must be a valid UUID')
    })
};

const leadBookingSchema = {
    params: z.object({
        id: z.string().uuid('id must be a valid UUID')
    }),
    body: z.object({
        propertyId: z.string().uuid('Valid Property ID is required'),
        amount: z.number().positive('Amount must be positive').max(999999999999, 'Amount exceeds the supported maximum').optional(),
        quotationId: z.string().uuid('quotationId must be a valid UUID').optional(),
        paymentStatus: z.enum(['PENDING', 'PARTIAL', 'COMPLETED']).optional(),
        customer: z.object({
            name: z.string().optional(),
            phone: z.string().optional(),
            email: z.string().email().optional().nullable()
        }).optional()
    }).refine(
        (body) => body.amount !== undefined || body.quotationId !== undefined,
        { message: 'amount or quotationId is required', path: ['amount'] }
    )
};

const bulkAssignSchema = {
    body: z.object({
        leadIds: z.array(z.string().uuid()).min(1, 'At least one lead is required'),
        assignedToId: z.string().uuid('assignedToId must be a valid UUID')
    })
};

const mergeLeadSchema = {
    params: z.object({
        id: z.string().uuid('id must be a valid UUID')
    }),
    body: z.object({
        duplicateLeadId: z.string().uuid('duplicateLeadId must be a valid UUID')
    })
};

const getClaimableQuerySchema = {
    query: z.object({
        page: z.string().regex(/^\d+$/).transform(Number).optional().default("1"),
        limit: z.string().regex(/^\d+$/).transform(Number).optional().default("12"),
        search: z.string().optional(),
        sort: z.enum(['asc', 'desc']).optional().default('desc')
    })
};

const proposalSchema = {
    params: z.object({
        id: z.string().uuid('id must be a valid UUID')
    }),
    body: z.object({
        propertyIds: z.array(z.string().uuid('propertyId must be a valid UUID'))
            .min(1, 'At least one unit is required')
            .max(20, 'A proposal can include at most 20 units')
    })
};

const sharePropertySchema = {
    params: z.object({
        id: z.string().uuid('id must be a valid UUID')
    }),
    body: z.object({
        propertyId: z.string().uuid('propertyId must be a valid UUID')
    })
};

module.exports = {
    createLeadSchema,
    updateLeadSchema,
    getLeadsQuerySchema,
    getClaimableQuerySchema,
    bulkAssignSchema,
    mergeLeadSchema,
    idParamsSchema,
    transitionStageSchema,
    logContactSchema,
    scheduleFollowUpSchema,
    interestedPropertyParamsSchema,
    addInterestSchema,
    leadBookingSchema,
    proposalSchema,
    sharePropertySchema
};
