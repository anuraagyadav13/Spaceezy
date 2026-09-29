const { asyncHandler, AppError } = require('../utils/errors');
const LeadService = require('../services/leadService');

const getLeads = asyncHandler(async (req, res, next) => {
    const { organizationId, role, userId } = req.auth;
    const result = await LeadService.getLeads(organizationId, req.query, role, userId);
    
    res.status(200).json({
        success: true,
        data: result,
        message: 'Leads fetched successfully'
    });
});

const getLeadById = asyncHandler(async (req, res, next) => {
    const { id } = req.params;
    const { organizationId, role, userId } = req.auth;
    
    const lead = await LeadService.getLeadById(id, organizationId, role, userId);
    
    if (!lead) {
        return next(new AppError('Lead not found', 404, 'NOT_FOUND'));
    }

    res.status(200).json({
        success: true,
        data: lead,
        message: 'Lead fetched successfully'
    });
});

const createLead = asyncHandler(async (req, res, next) => {
    const { organizationId, userId } = req.auth;
    
    const lead = await LeadService.createLead(req.body, organizationId, userId);
    
    res.status(201).json({
        success: true,
        data: lead,
        message: 'Lead created successfully'
    });
});

const updateLead = asyncHandler(async (req, res, next) => {
    const { id } = req.params;
    const { organizationId, role, userId } = req.auth;
    
    const lead = await LeadService.updateLead(id, req.body, organizationId, role, userId);
    
    res.status(200).json({
        success: true,
        data: lead,
        message: 'Lead updated successfully'
    });
});

const deleteLead = asyncHandler(async (req, res, next) => {
    const { id } = req.params;
    const { organizationId, role, userId } = req.auth;
    
    await LeadService.deleteLead(id, organizationId, role, userId);
    
    res.status(200).json({
        success: true,
        data: null,
        message: 'Lead deleted successfully'
    });
});

module.exports = {
    getLeads,
    getLeadById,
    createLead,
    updateLead,
    deleteLead
};
