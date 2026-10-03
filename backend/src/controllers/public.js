const { asyncHandler } = require('../utils/errors');
const LeadService = require('../services/leadService');
const prisma = require('../db/prisma');

const handlePublicEnquiry = asyncHandler(async (req, res, next) => {
    // In a real application, you might lookup the spaceezy org ID or use a default
    // We assume there's one organization for now
    const defaultOrg = await prisma.organization.findFirst();
    
    if (!defaultOrg) {
        return res.status(500).json({
            success: false,
            message: 'System not configured correctly (No organization found)',
            code: 'INTERNAL_ERROR'
        });
    }

    const lead = await LeadService.handlePublicEnquiry(req.body, defaultOrg.id);

    res.status(201).json({
        success: true,
        data: { id: lead.id }, // Return minimal safe response
        message: 'Enquiry submitted successfully'
    });
});

module.exports = {
    handlePublicEnquiry
};
