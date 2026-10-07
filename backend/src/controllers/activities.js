const { asyncHandler } = require('../utils/errors');
const ActivityService = require('../services/activityService');

const getAgenda = asyncHandler(async (req, res) => {
    const { organizationId, role, userId } = req.auth;
    const data = await ActivityService.getAgenda(organizationId, req.query, role, userId);
    res.status(200).json({ success: true, data, message: 'Agenda fetched successfully' });
});

const getProductivity = asyncHandler(async (req, res) => {
    const { organizationId, role, userId } = req.auth;
    const data = await ActivityService.getProductivity(organizationId, req.query, role, userId);
    res.status(200).json({ success: true, data, message: 'Productivity fetched successfully' });
});

const getNeedsAttention = asyncHandler(async (req, res) => {
    const { organizationId, role, userId } = req.auth;
    const data = await ActivityService.getNeedsAttention(organizationId, role, userId, req.query);
    res.status(200).json({ success: true, data, message: 'Needs attention fetched successfully' });
});

module.exports = { getAgenda, getProductivity, getNeedsAttention };
