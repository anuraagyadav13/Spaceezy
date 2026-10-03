const { asyncHandler, AppError } = require('../utils/errors');
const ProjectService = require('../services/projectService');

const getProjects = asyncHandler(async (req, res, next) => {
    const { organizationId } = req.auth;
    const result = await ProjectService.getProjects(organizationId, req.query);
    
    res.status(200).json({
        success: true,
        data: result,
        message: 'Projects fetched successfully'
    });
});

const getProjectById = asyncHandler(async (req, res, next) => {
    const { id } = req.params;
    const { organizationId } = req.auth;
    
    const project = await ProjectService.getProjectById(id, organizationId);
    
    res.status(200).json({
        success: true,
        data: project,
        message: 'Project fetched successfully'
    });
});

const createProject = asyncHandler(async (req, res, next) => {
    const { organizationId } = req.auth;
    
    const project = await ProjectService.createProject(req.body, organizationId);
    
    res.status(201).json({
        success: true,
        data: project,
        message: 'Project created successfully'
    });
});

const updateProject = asyncHandler(async (req, res, next) => {
    const { id } = req.params;
    const { organizationId } = req.auth;
    
    const project = await ProjectService.updateProject(id, req.body, organizationId);
    
    res.status(200).json({
        success: true,
        data: project,
        message: 'Project updated successfully'
    });
});

module.exports = {
    getProjects,
    getProjectById,
    createProject,
    updateProject
};
