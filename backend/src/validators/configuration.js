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

const createConfigurationSchema = {
    params: z.object({
        projectId: z.string().uuid('projectId must be a valid UUID')
    }),
    body: z.object({
        name: z.string().min(1, 'Configuration name is required').max(100),
        bhk: z.number().int().min(0).max(20).nullish(),
        areaSaleable: z.number().min(0).nullish(),
        basePrice: z.number().min(0).nullish()
    })
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
        active: z.boolean().optional()
    })
};

module.exports = {
    projectIdParamsSchema,
    configurationParamsSchema,
    createConfigurationSchema,
    updateConfigurationSchema
};
