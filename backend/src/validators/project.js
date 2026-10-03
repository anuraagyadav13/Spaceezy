const { z } = require('zod');

const PROJECT_STATUSES = [
    'UPCOMING', 'PRE_LAUNCH', 'UNDER_CONSTRUCTION', 'READY_TO_MOVE',
    'AVAILABLE', 'COMPLETED', 'FULLY_OCCUPIED', 'RENOVATING',
    'ON_HOLD', 'SOLD_OUT', 'INACTIVE'
];

const PROJECT_TYPES = ['Residential', 'Commercial', 'Mixed_Use'];

const connectivityItemSchema = z.object({
    name: z.string().min(1),
    category: z.string().optional(),
    distance: z.string().optional(),
    time: z.string().optional()
}).passthrough();

const documentItemSchema = z.object({
    name: z.string().min(1),
    url: z.string().optional(),
    type: z.string().optional()
}).passthrough();

const getProjectsQuerySchema = {
    query: z.object({
        page: z.string().optional(),
        limit: z.string().optional(),
        search: z.string().optional(),
        status: z.string().optional(),
        projectType: z.string().optional(),
        type: z.string().optional(),
        city: z.string().optional(),
        developer: z.string().optional(),
        reraRegistered: z.string().optional(),
        sort: z.string().optional(),
        sortBy: z.string().optional()
    })
};

const createProjectSchema = {
    body: z.object({
        name: z.string().min(1, 'Project name is required'),
        address: z.string().min(1, 'Address is required'),
        projectType: z.enum(PROJECT_TYPES).optional().default('Residential'),
        type: z.string().optional(), // Legacy compat
        status: z.enum(PROJECT_STATUSES).optional(),
        developer: z.string().optional(),
        description: z.string().optional(),
        shortDescription: z.string().optional(),

        // Location
        locality: z.string().optional(),
        city: z.string().optional(),
        state: z.string().optional(),
        pincode: z.string().optional(),
        latitude: z.number().optional(),
        longitude: z.number().optional(),
        mapUrl: z.string().optional(),
        landmark: z.string().optional(),

        // Overview
        totalLandArea: z.number().optional(),
        landAreaUnit: z.string().optional(),
        totalTowers: z.number().int().optional(),
        totalFloors: z.number().int().optional(),
        totalUnits: z.number().int().optional(),
        availableUnits: z.number().int().optional(),
        launchDate: z.string().optional(),
        expectedCompletionDate: z.string().optional(),
        possessionDate: z.string().optional(),

        // RERA
        reraRegistered: z.boolean().optional(),
        reraNumber: z.string().optional(),
        reraAuthority: z.string().optional(),

        // Pricing
        startingPrice: z.number().optional(),
        maximumPrice: z.number().optional(),
        pricePerSqFt: z.number().optional(),
        priceUnit: z.string().optional(),
        maintenanceCharges: z.number().optional(),
        plcCharges: z.number().optional(),
        parkingCharges: z.number().optional(),
        clubCharges: z.number().optional(),
        otherCharges: z.number().optional(),

        // Amenities & Assets
        amenities: z.array(z.string()).optional(),
        images: z.array(z.string()).optional(),
        documents: z.array(documentItemSchema).optional(),
        connectivity: z.array(connectivityItemSchema).optional(),
    })
};

const updateProjectSchema = {
    body: z.object({
        name: z.string().min(1).optional(),
        address: z.string().min(1).optional(),
        projectType: z.enum(PROJECT_TYPES).optional(),
        type: z.string().optional(),
        status: z.enum(PROJECT_STATUSES).optional(),
        developer: z.string().optional(),
        description: z.string().optional(),
        shortDescription: z.string().optional(),

        locality: z.string().optional(),
        city: z.string().optional(),
        state: z.string().optional(),
        pincode: z.string().optional(),
        latitude: z.number().optional(),
        longitude: z.number().optional(),
        mapUrl: z.string().optional(),
        landmark: z.string().optional(),

        totalLandArea: z.number().optional(),
        landAreaUnit: z.string().optional(),
        totalTowers: z.number().int().optional(),
        totalFloors: z.number().int().optional(),
        totalUnits: z.number().int().optional(),
        availableUnits: z.number().int().optional(),
        launchDate: z.string().optional(),
        expectedCompletionDate: z.string().optional(),
        possessionDate: z.string().optional(),

        reraRegistered: z.boolean().optional(),
        reraNumber: z.string().optional(),
        reraAuthority: z.string().optional(),

        startingPrice: z.number().optional(),
        maximumPrice: z.number().optional(),
        pricePerSqFt: z.number().optional(),
        priceUnit: z.string().optional(),
        maintenanceCharges: z.number().optional(),
        plcCharges: z.number().optional(),
        parkingCharges: z.number().optional(),
        clubCharges: z.number().optional(),
        otherCharges: z.number().optional(),

        amenities: z.array(z.string()).optional(),
        images: z.array(z.string()).optional(),
        documents: z.array(documentItemSchema).optional(),
        connectivity: z.array(connectivityItemSchema).optional(),
    })
};

module.exports = {
    getProjectsQuerySchema,
    createProjectSchema,
    updateProjectSchema
};
