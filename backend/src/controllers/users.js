const { asyncHandler, AppError } = require('../utils/errors');
const UserService = require('../services/userService');

const getUsers = asyncHandler(async (req, res, next) => {
    const { organizationId } = req.auth;
    const result = await UserService.getUsers(organizationId, req.query);
    
    res.status(200).json({
        success: true,
        data: result,
        message: 'Users fetched successfully'
    });
});

const getUserById = asyncHandler(async (req, res, next) => {
    const { id } = req.params;
    const { organizationId } = req.auth;
    
    const user = await UserService.getUserById(id, organizationId);
    
    res.status(200).json({
        success: true,
        data: user,
        message: 'User fetched successfully'
    });
});

const createUser = asyncHandler(async (req, res, next) => {
    const { organizationId } = req.auth;
    
    const user = await UserService.createUser(req.body, organizationId);
    
    res.status(201).json({
        success: true,
        data: user,
        message: 'User created successfully'
    });
});

const updateUser = asyncHandler(async (req, res, next) => {
    const { id } = req.params;
    const { organizationId, role } = req.auth;
    
    const user = await UserService.updateUser(id, req.body, organizationId, role);
    
    res.status(200).json({
        success: true,
        data: user,
        message: 'User updated successfully'
    });
});

const deleteUser = asyncHandler(async (req, res, next) => {
    const { id } = req.params;
    const { organizationId } = req.auth;
    
    await UserService.deleteUser(id, organizationId);
    
    res.status(200).json({
        success: true,
        data: null,
        message: 'User deactivated successfully'
    });
});

const getUserProfile = asyncHandler(async (req, res, next) => {
    const { id } = req.params;
    const { organizationId } = req.auth;
    
    const profile = await UserService.getUserProfile(id, organizationId);
    
    res.status(200).json({
        success: true,
        data: profile,
        message: 'User profile fetched successfully'
    });
});

module.exports = {
    getUsers,
    getUserById,
    createUser,
    updateUser,
    deleteUser,
    getUserProfile
};
