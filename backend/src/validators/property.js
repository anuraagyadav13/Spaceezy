const { z } = require('zod');

const PROPERTY_STATUSES = ['AVAILABLE', 'RESERVED', 'SOLD'];

const AREA_FIELDS = {
    area: z.number().min(0).nullish(),
    areaCarpet: z.number().min(0).nullish(),
    areaSaleable: z.number().min(0).nullish(),
    areaBuiltUp: z.number().min(0).nullish(),
    areaProject: z.number().min(0).nullish(),
    areaCovered: z.number().min(0).nullish(),
    areaTerrace: z.number().min(0).nullish()
};

const getPropertiesQuerySchema = {
    query: z.object({
        page: z.string().optional(),
        limit: z.string().optional(),
        search: z.string().optional(),
        status: z.enum(PROPERTY_STATUSES).optional(),
        projectId: z.string().uuid().optional(),
        configurationId: z.string().uuid().optional(),
        tower: z.string().max(100).optional(),
        purpose: z.string().max(50).optional(),
        floor: z.string().regex(/^-?\d+$/).optional(),
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
        unitNumber: z.string().max(64).nullish(),
        configuration: z.string().max(100).nullish(),
        configurationId: z.string().uuid().nullish(),
        purpose: z.string().max(50).nullish(),
        tower: z.string().max(100).nullish(),
        bhk: z.number().int().min(0).max(20).nullish(),
        ...AREA_FIELDS,
        floor: z.number().int().nullish(),
        facing: z.string().max(50).nullish(),
        price: z.number().min(0, 'Price must be positive').optional(),
        status: z.literal('AVAILABLE').optional(),
        featured: z.boolean().optional(),
        isPublic: z.boolean().optional(),
        images: z.array(z.string()).optional(),
        amenities: z.array(z.string()).optional()
    })
};

const updatePropertySchema = {
    body: z.object({
        title: z.string().min(1).optional(),
        unitNumber: z.string().max(64).nullish(),
        configuration: z.string().max(100).nullish(),
        configurationId: z.string().uuid().nullish(),
        purpose: z.string().max(50).nullish(),
        tower: z.string().max(100).nullish(),
        bhk: z.number().int().min(0).max(20).nullish(),
        ...AREA_FIELDS,
        floor: z.number().int().nullish(),
        facing: z.string().max(50).nullish(),
        price: z.number().min(0).optional(),
        status: z.enum(PROPERTY_STATUSES).optional(),
        featured: z.boolean().optional(),
        isPublic: z.boolean().optional(),
        images: z.array(z.string()).optional(),
        amenities: z.array(z.string()).optional()
    })
};

const propertyIdParamsSchema = {
    params: z.object({
        id: z.string().uuid('id must be a valid UUID')
    })
};

// --- Bulk import (Inventory) ---
const importRowSchema = z.object({
    unitNumber: z.string().min(1, 'Unit number is required').max(64),
    tower: z.string().max(100).nullish(),
    floor: z.coerce.number().int().nullish(),
    configuration: z.string().min(1).max(100).nullish(),
    bhk: z.coerce.number().int().min(0).max(20).nullish(),
    area: z.coerce.number().min(0).nullish(),
    areaCarpet: z.coerce.number().min(0).nullish(),
    areaSaleable: z.coerce.number().min(0).nullish(),
    facing: z.string().max(50).nullish(),
    price: z.coerce.number().min(0).nullish(),
    purpose: z.string().max(50).nullish()
});

const bulkImportSchema = {
    body: z.object({
        projectId: z.string().uuid('Valid Project ID is required'),
        dryRun: z.boolean().optional().default(false),
        rows: z.array(importRowSchema).min(1, 'At least one row is required').max(1000, 'Maximum 1000 rows per import')
    })
};

module.exports = {
    getPropertiesQuerySchema,
    createPropertySchema,
    updatePropertySchema,
    propertyIdParamsSchema,
    importRowSchema,
    bulkImportSchema
};
