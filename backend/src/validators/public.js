const { z } = require('zod');

const publicEnquirySchema = {
    body: z.object({
        name: z.string().min(1, 'Name is required').max(100),
        phone: z.string().min(10, 'Valid phone number is required').max(20),
        email: z.string().email().optional().nullable(),
        message: z.string().max(1000).optional().nullable(),
        projectId: z.string().optional().nullable(),
        propertyId: z.string().optional().nullable(),
        preferredVisitDate: z.string().datetime().optional().nullable(),
        preferredVisitTime: z.string().optional().nullable(),
        interestedUnitType: z.string().optional().nullable(),
        source: z.string().optional().nullable(),
        campaign: z.string().optional().nullable(),
        landingPage: z.string().optional().nullable()
    }).strict() // Important to prevent injection of organizationId etc.
};

module.exports = {
    publicEnquirySchema
};
