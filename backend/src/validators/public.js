const { z } = require('zod');

const PROJECT_STATUSES = [
    'UPCOMING', 'PRE_LAUNCH', 'UNDER_CONSTRUCTION', 'READY_TO_MOVE',
    'AVAILABLE', 'COMPLETED', 'FULLY_OCCUPIED', 'RENOVATING',
    'ON_HOLD', 'SOLD_OUT', 'INACTIVE'
];

// Canonical public availability vocabulary plus raw enum spellings accepted
// as aliases (mapped to PropertyStatus in PublicService).
const AVAILABILITY_VALUES = [
    'Available', 'Limited Availability', 'Sold',
    'AVAILABLE', 'RESERVED', 'SOLD'
];

const publicEnquirySchema = {
    body: z.object({
        name: z.string().min(1, 'Name is required').max(100),
        phone: z.string().min(10, 'Valid phone number is required').max(20),
        email: z.string().email().optional().nullable(),
        message: z.string().max(1000).optional().nullable(),
        projectId: z.string().optional().nullable(),
        propertyId: z.string().optional().nullable(),
        // Public links resolve to internal IDs server-side — visitors never
        // handle (or learn) internal inventory IDs.
        propertyToken: z.string().max(64).optional().nullable(),
        projectSlug: z.string().max(120).optional().nullable(),
        preferredVisitDate: z.string()
            .refine((v) => !Number.isNaN(Date.parse(v)), 'Invalid date')
            .optional().nullable(),
        preferredVisitTime: z.string().max(50).optional().nullable(),
        interestedUnitType: z.string().max(100).optional().nullable(),
        source: z.string().max(50).optional().nullable(),
        campaign: z.string().max(200).optional().nullable(),
        landingPage: z.string().max(500).optional().nullable()
    }).strict() // Important to prevent injection of organizationId etc.
};

const uuidParam = z.string().uuid();

const listPublicProjectsQuerySchema = {
    query: z.object({
        page: z.string().optional(),
        limit: z.string().optional(),
        q: z.string().max(200).optional(),
        search: z.string().max(200).optional(),
        location: z.string().max(200).optional(),
        stateId: uuidParam.optional(),
        districtId: uuidParam.optional(),
        regionId: uuidParam.optional(),
        propertyType: z.string().max(50).optional(),
        status: z.enum(PROJECT_STATUSES).optional(),
        configuration: z.string().max(100).optional(),
        minPrice: z.string().optional(),
        maxPrice: z.string().optional()
    }).passthrough()
};

const listPublicPropertiesQuerySchema = {
    query: z.object({
        page: z.string().optional(),
        limit: z.string().optional(),
        q: z.string().max(200).optional(),
        search: z.string().max(200).optional(),
        projectSlug: z.string().max(120).optional(),
        stateId: uuidParam.optional(),
        districtId: uuidParam.optional(),
        regionId: uuidParam.optional(),
        propertyType: z.string().max(50).optional(),
        configuration: z.string().max(100).optional(),
        bhk: z.string().optional(),
        availability: z.enum(AVAILABILITY_VALUES).optional(),
        minPrice: z.string().optional(),
        maxPrice: z.string().optional()
    }).passthrough()
};

const publicProjectParamSchema = {
    params: z.object({
        slug: z.string().min(1).max(120)
    })
};

// Format validation is intentionally loose: unknown or malformed tokens get
// the same 404 as valid-but-unpublished ones (no existence oracle).
const publicPropertyParamSchema = {
    params: z.object({
        token: z.string().min(1).max(64)
    })
};

module.exports = {
    publicEnquirySchema,
    listPublicProjectsQuerySchema,
    listPublicPropertiesQuerySchema,
    publicProjectParamSchema,
    publicPropertyParamSchema
};
