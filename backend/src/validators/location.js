const { z } = require('zod');

const nameSchema = z
    .string()
    .trim()
    .min(2, 'Region name must be at least 2 characters')
    .max(80, 'Region name must be at most 80 characters');

// `?q=` is optional; an empty value means "no filter".
const optionalSearch = z.preprocess(
    (value) => (value === '' || value === undefined ? undefined : value),
    z.string().trim().min(1).max(80).optional()
);

const searchQuerySchema = {
    query: z.object({ q: optionalSearch })
};

const stateParamSchema = {
    params: z.object({
        stateId: z.string().uuid('stateId must be a valid UUID')
    })
};

const stateSearchSchema = {
    params: z.object({
        stateId: z.string().uuid('stateId must be a valid UUID')
    }),
    query: z.object({ q: optionalSearch })
};

const districtParamSchema = {
    params: z.object({
        districtId: z.string().uuid('districtId must be a valid UUID')
    })
};

const districtSearchSchema = {
    params: z.object({
        districtId: z.string().uuid('districtId must be a valid UUID')
    }),
    query: z.object({ q: optionalSearch })
};

const createRegionSchema = {
    body: z.object({
        districtId: z.string().uuid('districtId must be a valid UUID'),
        name: nameSchema
    })
};

const updateRegionSchema = {
    params: z.object({
        regionId: z.string().uuid('regionId must be a valid UUID')
    }),
    body: z.object({
        name: nameSchema
    })
};

const regionParamSchema = {
    params: z.object({
        regionId: z.string().uuid('regionId must be a valid UUID')
    })
};

module.exports = {
    searchQuerySchema,
    stateParamSchema,
    stateSearchSchema,
    districtParamSchema,
    districtSearchSchema,
    createRegionSchema,
    updateRegionSchema,
    regionParamSchema
};
