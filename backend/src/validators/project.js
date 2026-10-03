const { z } = require('zod');

const getProjectsQuerySchema = {
    query: z.object({
        page: z.string().optional(),
        limit: z.string().optional(),
        search: z.string().optional(),
        status: z.string().optional(),
        type: z.string().optional(),
        sort: z.string().optional()
    })
};

const createProjectSchema = {
    body: z.object({
        name: z.string().min(1, 'Name is required'),
        address: z.string().min(1, 'Address is required'),
        city: z.string().optional(),
        type: z.string().min(1, 'Type is required'),
        totalUnits: z.number().optional(),
        occupiedUnits: z.number().optional(),
        status: z.enum(['PRE_LAUNCH', 'UNDER_CONSTRUCTION', 'AVAILABLE', 'FULLY_OCCUPIED', 'RENOVATING']).optional(),
        price: z.number().optional(),
        description: z.string().optional(),
        amenities: z.array(z.string()).optional(),
        yearBuilt: z.string().optional(),
        floors: z.string().optional(),
        parkingSpots: z.string().optional(),
        images: z.array(z.string()).optional()
    })
};

const updateProjectSchema = {
    body: z.object({
        name: z.string().optional(),
        address: z.string().optional(),
        city: z.string().optional(),
        type: z.string().optional(),
        totalUnits: z.number().optional(),
        occupiedUnits: z.number().optional(),
        status: z.enum(['PRE_LAUNCH', 'UNDER_CONSTRUCTION', 'AVAILABLE', 'FULLY_OCCUPIED', 'RENOVATING']).optional(),
        price: z.number().optional(),
        description: z.string().optional(),
        amenities: z.array(z.string()).optional(),
        yearBuilt: z.string().optional(),
        floors: z.string().optional(),
        parkingSpots: z.string().optional(),
        images: z.array(z.string()).optional()
    })
};

module.exports = {
    getProjectsQuerySchema,
    createProjectSchema,
    updateProjectSchema
};
