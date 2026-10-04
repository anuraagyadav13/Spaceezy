const { asyncHandler, AppError } = require('../utils/errors');
const LeadService = require('../services/leadService');
const BookingService = require('../services/bookingService');

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

const getMatchingProperties = asyncHandler(async (req, res, next) => {
    const { id } = req.params;
    const { organizationId } = req.auth;
    
    const properties = await LeadService.getMatchingProperties(id, organizationId);
    
    res.status(200).json({
        success: true,
        data: properties
    });
});

const addInterestedProperty = asyncHandler(async (req, res, next) => {
    const { id } = req.params;
    const { propertyId } = req.body;
    const { organizationId } = req.auth;
    
    if (!propertyId) throw new AppError('propertyId is required', 400, 'BAD_REQUEST');

    await LeadService.addInterestedProperty(id, propertyId, organizationId);
    
    res.status(201).json({
        success: true,
        message: 'Interest added successfully'
    });
});

const removeInterestedProperty = asyncHandler(async (req, res, next) => {
    const { id, propId } = req.params;
    const { organizationId } = req.auth;
    
    await LeadService.removeInterestedProperty(id, propId, organizationId);
    
    res.status(200).json({
        success: true,
        message: 'Interest removed successfully'
    });
});

const getFollowups = asyncHandler(async (req, res, next) => {
    const { organizationId, role, userId } = req.auth;
    const result = await LeadService.getFollowups(organizationId, req.query, role, userId);
    
    res.status(200).json({
        success: true,
        data: result,
        message: 'Follow-ups fetched successfully'
    });
});

const toggleFollowupStatus = asyncHandler(async (req, res, next) => {
    const { id } = req.params;
    const { organizationId } = req.auth;
    
    const result = await LeadService.toggleFollowupStatus(id, organizationId);
    
    res.status(200).json({
        success: true,
        data: result,
        message: 'Follow-up status toggled'
    });
});

const getActivities = asyncHandler(async (req, res, next) => {
    const { organizationId, role, userId } = req.auth;
    const result = await LeadService.getActivities(organizationId, req.query, role, userId);
    
    res.status(200).json({
        success: true,
        data: result,
        message: 'Activities fetched successfully'
    });
});

const bulkAssignLeads = asyncHandler(async (req, res, next) => {
    const { leadIds, assignedToId } = req.body;
    const { organizationId, userId } = req.auth;
    
    const result = await LeadService.bulkAssignLeads(leadIds, assignedToId, organizationId, userId);
    
    res.status(200).json({
        success: true,
        data: result,
        message: 'Leads reassigned successfully'
    });
});

const getDuplicates = asyncHandler(async (req, res, next) => {
    const { organizationId } = req.auth;
    const result = await LeadService.getDuplicates(organizationId, req.query);
    
    res.status(200).json({
        success: true,
        data: result,
        message: 'Duplicates fetched successfully'
    });
});

const mergeLeads = asyncHandler(async (req, res, next) => {
    const { id } = req.params; // survivor
    const { duplicateLeadId } = req.body;
    const { organizationId, userId } = req.auth;
    
    const result = await LeadService.mergeLeads(id, duplicateLeadId, organizationId, userId);
    
    res.status(200).json({
        success: true,
        data: result,
        message: 'Leads merged successfully'
    });
});

const transitionStage = asyncHandler(async (req, res, next) => {
    const { id } = req.params;
    const { organizationId, role, userId } = req.auth;
    const { target, ...payload } = req.body;

    if (!target) throw new AppError('target is required', 422, 'VALIDATION_ERROR');

    const result = await LeadService.transitionStage(id, target, payload, organizationId, role, userId);

    res.status(200).json({
        success: true,
        data: result,
        message: `Lead moved to ${target}`
    });
});

const logContact = asyncHandler(async (req, res, next) => {
    const { id } = req.params;
    const { organizationId, role, userId } = req.auth;

    const result = await LeadService.logContact(id, req.body, organizationId, role, userId);

    res.status(200).json({
        success: true,
        data: result,
        message: 'Contact logged'
    });
});

const scheduleFollowUp = asyncHandler(async (req, res, next) => {
    const { id } = req.params;
    const { organizationId, role, userId } = req.auth;

    const result = await LeadService.scheduleFollowUp(id, req.body, organizationId, role, userId);

    res.status(201).json({
        success: true,
        data: result,
        message: 'Follow-up scheduled'
    });
});

const createBookingFromLead = asyncHandler(async (req, res, next) => {
    const { id } = req.params;
    const { organizationId, role, userId } = req.auth;

    const result = await BookingService.createBookingFromLead(id, req.body, organizationId, userId, role);

    res.status(201).json({
        success: true,
        data: result,
        message: 'Booking created successfully'
    });
});

module.exports = {
    getLeads,
    getLeadById,
    createLead,
    updateLead,
    deleteLead,
    getMatchingProperties,
    addInterestedProperty,
    removeInterestedProperty,
    getFollowups,
    toggleFollowupStatus,
    getActivities,
    bulkAssignLeads,
    getDuplicates,
    mergeLeads,
    transitionStage,
    logContact,
    scheduleFollowUp,
    createBookingFromLead
};
