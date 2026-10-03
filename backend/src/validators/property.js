const { z } = require('zod');

const getPropertiesQuerySchema = {
    query: z.object({
        page: z.string().optional(),
        limit: z.string().optional(),
        search: z.string().optional(),
        status: z.string().optional(),
        minPrice: z.string().optional(),
        maxPrice: z.string().optional(),
        bhk: z.string().optional(),
        sort: z.string().optional()
    })
};

const createPropertySchema = {
    body: z.object({
        projectId: z.string().uuid('Valid Project ID is required'),
        title: z.string().min(1, 'Title is required'),
        unitNumber: z.string().optional(),
        configuration: z.string().optional(),
        bhk: z.number().optional(),
        area: z.number().optional(),
        floor: z.number().optional(),
        facing: z.string().optional(),
        price: z.number().min(0, 'Price must be positive'),
        status: z.enum(['AVAILABLE', 'RESERVED', 'SOLD']).optional(),
        featured: z.boolean().optional(),
        images: z.array(z.string()).optional()
    })
};

const updatePropertySchema = {
    body: z.object({
        title: z.string().optional(),
        unitNumber: z.string().optional(),
        configuration: z.string().optional(),
        bhk: z.number().optional(),
        area: z.number().optional(),
        floor: z.number().optional(),
        facing: z.string().optional(),
        price: z.number().min(0).optional(),
        status: z.enum(['AVAILABLE', 'RESERVED', 'SOLD']).optional(),
        featured: z.boolean().optional(),
        images: z.array(z.string()).optional()
    })
};

module.exports = {
    getPropertiesQuerySchema,
    createPropertySchema,
    updatePropertySchema
};
