const express = require('express');
const { getUsers, getUserById, createUser, updateUser, deleteUser, getUserProfile } = require('../controllers/users');
const { requireAuth, requirePermission } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { createUserSchema, updateUserSchema, getUsersQuerySchema } = require('../validators/user');

const router = express.Router();

router.use(requireAuth());

router.get('/', requirePermission('employee:view'), validate(getUsersQuerySchema), getUsers);
router.post('/', requirePermission('employee:create'), validate(createUserSchema), createUser);
router.get('/:id', requirePermission('employee:view'), getUserById);
router.get('/:id/profile', requirePermission('employee:view'), getUserProfile);
router.patch('/:id', requirePermission('employee:update'), validate(updateUserSchema), updateUser);
router.delete('/:id', requirePermission('employee:delete'), deleteUser);

module.exports = router;
