const { asyncHandler, AppError } = require('../utils/errors');
const CustomerService = require('../services/customerService');
const { maskContact } = require('../utils/pii');

const getCustomers = asyncHandler(async (req, res) => {
    const { organizationId, role, userId } = req.auth;
    const result = await CustomerService.getCustomers(organizationId, req.query, role, userId);

    // Customer rows carry phone/email directly; mask for roles without pii:view.
    res.status(200).json({
        success: true,
        data: { ...result, customers: (result.customers || []).map((c) => maskContact(c, role)) },
        message: 'Customers fetched successfully'
    });
});

const getCustomerById = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { organizationId, role } = req.auth;
    const customer = await CustomerService.getCustomerById(id, organizationId);

    res.status(200).json({
        success: true,
        data: maskContact(customer, role),
        message: 'Customer fetched successfully'
    });
});

const createCustomer = asyncHandler(async (req, res) => {
    const { organizationId, role } = req.auth;
    const customer = await CustomerService.createCustomer(req.body, organizationId);

    res.status(201).json({
        success: true,
        data: maskContact(customer, role),
        message: 'Customer created successfully'
    });
});

const updateCustomer = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { organizationId, role, userId } = req.auth;
    const customer = await CustomerService.updateCustomer(id, req.body, organizationId, role, userId);

    res.status(200).json({
        success: true,
        data: maskContact(customer, role),
        message: 'Customer updated successfully'
    });
});

const deleteCustomer = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { organizationId, role, userId } = req.auth;
    await CustomerService.deleteCustomer(id, organizationId, role, userId);

    res.status(200).json({
        success: true,
        data: null,
        message: 'Customer deleted successfully'
    });
});

module.exports = {
    getCustomers,
    getCustomerById,
    createCustomer,
    updateCustomer,
    deleteCustomer
};
