const { asyncHandler, AppError } = require('../utils/errors');
const PropertyService = require('../services/propertyService');

const getPropertiesForProject = asyncHandler(async (req, res, next) => {
    const { projectId } = req.params;
    const { organizationId } = req.auth;
    
    const result = await PropertyService.getPropertiesForProject(projectId, organizationId, req.query);
    
    res.status(200).json({
        success: true,
        data: result,
        message: 'Properties fetched successfully'
    });
});

const getProperties = asyncHandler(async (req, res, next) => {
    const { organizationId } = req.auth;
    const result = await PropertyService.getProperties(organizationId, req.query);
    
    res.status(200).json({
        success: true,
        data: result,
        message: 'Properties fetched successfully'
    });
});

const getPropertyById = asyncHandler(async (req, res, next) => {
    const { id } = req.params;
    const { organizationId } = req.auth;
    
    const property = await PropertyService.getPropertyById(id, organizationId);
    
    res.status(200).json({
        success: true,
        data: property,
        message: 'Property fetched successfully'
    });
});

const createProperty = asyncHandler(async (req, res, next) => {
    const { organizationId } = req.auth;
    
    const property = await PropertyService.createProperty(req.body, organizationId);
    
    res.status(201).json({
        success: true,
        data: property,
        message: 'Property created successfully'
    });
});

const updateProperty = asyncHandler(async (req, res, next) => {
    const { id } = req.params;
    const { organizationId } = req.auth;
    
    const property = await PropertyService.updateProperty(id, req.body, organizationId);
    
    res.status(200).json({
        success: true,
        data: property,
        message: 'Property updated successfully'
    });
});

const deleteProperty = asyncHandler(async (req, res, next) => {
    const { id } = req.params;
    const { organizationId } = req.auth;
    
    await PropertyService.deleteProperty(id, organizationId);
    
    res.status(200).json({
        success: true,
        data: null,
        message: 'Property deleted successfully'
    });
});

module.exports = {
    getProperties,
    getPropertiesForProject,
    getPropertyById,
    createProperty,
    updateProperty,
    deleteProperty
};
