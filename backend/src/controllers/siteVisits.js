const { asyncHandler, AppError } = require('../utils/errors');
const SiteVisitService = require('../services/siteVisitService');

const getSiteVisits = asyncHandler(async (req, res) => {
    const { organizationId, role, userId } = req.auth;
    const result = await SiteVisitService.getSiteVisits(organizationId, req.query, role, userId);

    res.status(200).json({
        success: true,
        data: result,
        message: 'Site visits fetched successfully'
    });
});

const getSiteVisitById = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { organizationId } = req.auth;
    const siteVisit = await SiteVisitService.getSiteVisitById(id, organizationId);

    res.status(200).json({
        success: true,
        data: siteVisit,
        message: 'Site visit fetched successfully'
    });
});

const createSiteVisit = asyncHandler(async (req, res) => {
    const { organizationId, userId } = req.auth;
    const siteVisit = await SiteVisitService.createSiteVisit(req.body, organizationId, userId);

    res.status(201).json({
        success: true,
        data: siteVisit,
        message: 'Site visit created successfully'
    });
});

const updateSiteVisit = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { organizationId, role, userId } = req.auth;
    const siteVisit = await SiteVisitService.updateSiteVisit(id, req.body, organizationId, role, userId);

    res.status(200).json({
        success: true,
        data: siteVisit,
        message: 'Site visit updated successfully'
    });
});

const updateSiteVisitStatus = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    const { organizationId, role, userId } = req.auth;

    if (!status) throw new AppError('status is required', 400, 'BAD_REQUEST');

    const siteVisit = await SiteVisitService.updateSiteVisitStatus(id, status, organizationId, role, userId);

    res.status(200).json({
        success: true,
        data: siteVisit,
        message: 'Site visit status updated successfully'
    });
});

const deleteSiteVisit = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { organizationId, role, userId } = req.auth;
    await SiteVisitService.deleteSiteVisit(id, organizationId, role, userId);

    res.status(200).json({
        success: true,
        data: null,
        message: 'Site visit deleted successfully'
    });
});

module.exports = {
    getSiteVisits,
    getSiteVisitById,
    createSiteVisit,
    updateSiteVisit,
    updateSiteVisitStatus,
    deleteSiteVisit
};
