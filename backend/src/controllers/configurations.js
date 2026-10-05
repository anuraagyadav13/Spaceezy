const { asyncHandler } = require('../utils/errors');
const ConfigurationService = require('../services/configurationService');

const getConfigurations = asyncHandler(async (req, res) => {
    const { projectId } = req.params;
    const { organizationId } = req.auth;

    const result = await ConfigurationService.getConfigurations(projectId, organizationId);

    res.status(200).json({
        success: true,
        data: result.configurations,
        message: 'Configurations fetched successfully'
    });
});

const getConfiguration = asyncHandler(async (req, res) => {
    const { projectId, configId } = req.params;
    const { organizationId } = req.auth;

    const configuration = await ConfigurationService.getConfiguration(configId, projectId, organizationId);

    res.status(200).json({
        success: true,
        data: configuration,
        message: 'Configuration fetched successfully'
    });
});

const createConfiguration = asyncHandler(async (req, res) => {
    const { projectId } = req.params;
    const { organizationId } = req.auth;

    const configuration = await ConfigurationService.createConfiguration(projectId, req.body, organizationId);

    res.status(201).json({
        success: true,
        data: configuration,
        message: 'Configuration created successfully'
    });
});

const updateConfiguration = asyncHandler(async (req, res) => {
    const { projectId, configId } = req.params;
    const { organizationId } = req.auth;

    const configuration = await ConfigurationService.updateConfiguration(configId, projectId, req.body, organizationId);

    res.status(200).json({
        success: true,
        data: configuration,
        message: 'Configuration updated successfully'
    });
});

const deleteConfiguration = asyncHandler(async (req, res) => {
    const { projectId, configId } = req.params;
    const { organizationId } = req.auth;

    await ConfigurationService.deleteConfiguration(configId, projectId, organizationId);

    res.status(200).json({
        success: true,
        data: null,
        message: 'Configuration deleted successfully'
    });
});

module.exports = {
    getConfigurations,
    getConfiguration,
    createConfiguration,
    updateConfiguration,
    deleteConfiguration
};
