const { asyncHandler, AppError } = require('../utils/errors');
const QuotationService = require('../services/quotationService');

const getQuotations = asyncHandler(async (req, res, next) => {
    const { organizationId, role, userId } = req.auth;
    const result = await QuotationService.getQuotations(organizationId, req.query, role, userId);

    res.status(200).json({
        success: true,
        data: result,
        message: 'Quotations fetched successfully'
    });
});

const getQuotationById = asyncHandler(async (req, res, next) => {
    const { id } = req.params;
    const { organizationId } = req.auth;

    const quotation = await QuotationService.getQuotationById(id, organizationId);

    res.status(200).json({
        success: true,
        data: quotation,
        message: 'Quotation fetched successfully'
    });
});

const createQuotation = asyncHandler(async (req, res, next) => {
    const { organizationId, userId, role } = req.auth;

    const quotation = await QuotationService.createQuotation(req.body, organizationId, userId, role);

    res.status(201).json({
        success: true,
        data: quotation,
        message: 'Quotation created successfully'
    });
});

const updateQuotation = asyncHandler(async (req, res, next) => {
    const { id } = req.params;
    const { organizationId, userId, role } = req.auth;
    const { status, notes } = req.body;

    const quotation = await QuotationService.updateQuotationStatus(id, status, organizationId, userId, role, notes);

    res.status(200).json({
        success: true,
        data: quotation,
        message: 'Quotation updated successfully'
    });
});

module.exports = {
    getQuotations,
    getQuotationById,
    createQuotation,
    updateQuotation
};
