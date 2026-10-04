const { asyncHandler } = require('../utils/errors');
const PipelineService = require('../services/pipelineService');

const getPipelineDashboard = asyncHandler(async (req, res, next) => {
    const { organizationId, role, userId } = req.auth;

    const result = await PipelineService.getPipelineDashboard(organizationId, req.query, role, userId);

    res.status(200).json({
        success: true,
        data: result,
        message: 'Pipeline dashboard fetched successfully'
    });
});

module.exports = { getPipelineDashboard };
