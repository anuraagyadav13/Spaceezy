const { z } = require('zod');

const projectIdParamsSchema = {
    params: z.object({
        projectId: z.string().uuid('projectId must be a valid UUID')
    })
};

const configurationParamsSchema = {
    params: z.object({
        projectId: z.string().uuid('projectId must be a valid UUID'),
        configId: z.string().uuid('configId must be a valid UUID')
    })
};

const nonNegativeInt = (field) => z.number().int(`${field} must be a non-negative integer`).min(0, `${field} must be a non-negative integer`).nullish();

// Aggregate bulk-inventory counters. Both set = bulk mode; both absent/null
// = classic unit-tracked mode. Mixed states are rejected by rangeChecks.
const bulkInventoryFields = {
    totalUnits: nonNegativeInt('totalUnits'),
    availableUnits: nonNegativeInt('availableUnits')
};

// Descriptive ranges shown publicly. The representative areaSaleable /
// basePrice single values are preserved untouched for unit inheritance.
const rangeFields = {
    areaMin: z.number().min(0).nullish(),
    areaMax: z.number().min(0).nullish(),
    priceMin: z.number().min(0).nullish(),
    priceMax: z.number().min(0).nullish()
};

const rangeChecks = (body, ctx) => {
    if (body.areaMin != null && body.areaMax != null && body.areaMin > body.areaMax) {
        ctx.addIssue({ code: 'custom', path: ['areaMax'], message: 'areaMax must be greater than or equal to areaMin' });
    }
    if (body.priceMin != null && body.priceMax != null && body.priceMin > body.priceMax) {
        ctx.addIssue({ code: 'custom', path: ['priceMax'], message: 'priceMax must be greater than or equal to priceMin' });
    }
};

const bulkChecks = (body, ctx) => {
    rangeChecks(body, ctx);
    const hasTotal = body.totalUnits !== undefined && body.totalUnits !== null;
    const hasAvailable = body.availableUnits !== undefined && body.availableUnits !== null;
    if (hasAvailable && !hasTotal) {
        ctx.addIssue({ code: 'custom', path: ['totalUnits'], message: 'totalUnits is required when availableUnits is provided' });
    }
    if (hasTotal && hasAvailable && body.availableUnits > body.totalUnits) {
        ctx.addIssue({ code: 'custom', path: ['availableUnits'], message: 'availableUnits cannot exceed totalUnits' });
    }
};

const createConfigurationSchema = {
    params: z.object({
        projectId: z.string().uuid('projectId must be a valid UUID')
    }),
    body: z.object({
        name: z.string().min(1, 'Configuration name is required').max(100),
        bhk: z.number().int().min(0).max(20).nullish(),
        areaSaleable: z.number().min(0).nullish(),
        basePrice: z.number().min(0).nullish(),
        ...bulkInventoryFields,
        ...rangeFields
    }).superRefine(bulkChecks)
};

const updateConfigurationSchema = {
    params: z.object({
        projectId: z.string().uuid('projectId must be a valid UUID'),
        configId: z.string().uuid('configId must be a valid UUID')
    }),
    body: z.object({
        name: z.string().min(1).max(100).optional(),
        bhk: z.number().int().min(0).max(20).nullish(),
        areaSaleable: z.number().min(0).nullish(),
        basePrice: z.number().min(0).nullish(),
        active: z.boolean().optional(),
        ...rangeFields,
        // Declared only so the service can reject them explicitly — bulk
        // counters must never change as a side effect of an unrelated edit.
        totalUnits: z.unknown().optional(),
        availableUnits: z.unknown().optional()
    }).superRefine(rangeChecks)
};

// Dedicated explicit inventory adjustment with optimistic concurrency.
// Both counters set = switch to / stay in bulk mode; both null = clear back
// to unit-tracked mode. Anything else is rejected.
const updateInventorySchema = {
    params: z.object({
        projectId: z.string().uuid('projectId must be a valid UUID'),
        configId: z.string().uuid('configId must be a valid UUID')
    }),
    body: z.object({
        totalUnits: z.number().int().min(0, 'totalUnits must be a non-negative integer').nullable(),
        availableUnits: z.number().int().min(0, 'availableUnits must be a non-negative integer').nullable(),
        expectedInventoryVersion: z.number().int().min(0, 'expectedInventoryVersion must be a non-negative integer')
    }).superRefine((body, ctx) => {
        const totalSet = body.totalUnits !== null;
        const availableSet = body.availableUnits !== null;
        if (totalSet !== availableSet) {
            ctx.addIssue({ code: 'custom', path: ['availableUnits'], message: 'totalUnits and availableUnits must be set or cleared together' });
            return;
        }
        if (totalSet && body.availableUnits > body.totalUnits) {
            ctx.addIssue({ code: 'custom', path: ['availableUnits'], message: 'availableUnits cannot exceed totalUnits' });
        }
    })
};

module.exports = {
    projectIdParamsSchema,
    configurationParamsSchema,
    createConfigurationSchema,
    updateConfigurationSchema,
    updateInventorySchema
};
