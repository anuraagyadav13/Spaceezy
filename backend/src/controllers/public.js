const { asyncHandler } = require('../utils/errors');
const LeadService = require('../services/leadService');
const PublicService = require('../services/publicService');
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

// ---- Public website read APIs (unauthenticated, explicit DTOs only) ----

const getPublicProjects = asyncHandler(async (req, res) => {
    const result = await PublicService.listProjects(req.query);
    res.status(200).json({
        success: true,
        data: result,
        message: 'Projects fetched successfully'
    });
});

const getPublicProject = asyncHandler(async (req, res) => {
    const project = await PublicService.getProjectBySlug(req.params.slug);
    res.status(200).json({
        success: true,
        data: project,
        message: 'Project fetched successfully'
    });
});

const getPublicProperties = asyncHandler(async (req, res) => {
    const result = await PublicService.listProperties(req.query);
    res.status(200).json({
        success: true,
        data: result,
        message: 'Properties fetched successfully'
    });
});

const getPublicProperty = asyncHandler(async (req, res) => {
    const property = await PublicService.getPropertyByToken(req.params.token);
    res.status(200).json({
        success: true,
        data: property,
        message: 'Property fetched successfully'
    });
});

const getPublicLocations = asyncHandler(async (req, res) => {
    const locations = await PublicService.listLocations();
    res.status(200).json({
        success: true,
        data: locations,
        message: 'Locations fetched successfully'
    });
});

const getPublicConfigurations = asyncHandler(async (req, res) => {
    const configurations = await PublicService.listConfigurations();
    res.status(200).json({
        success: true,
        data: configurations,
        message: 'Configurations fetched successfully'
    });
});

module.exports = {
    handlePublicEnquiry,
    getPublicProjects,
    getPublicProject,
    getPublicProperties,
    getPublicProperty,
    getPublicLocations,
    getPublicConfigurations
};
