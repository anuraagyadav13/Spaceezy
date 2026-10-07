const express = require('express');
const { getCustomers, getCustomerById, createCustomer, updateCustomer, deleteCustomer } = require('../controllers/customers');
const { requireAuth, requirePermission } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { idParamsSchema, getCustomersQuerySchema, createCustomerSchema, updateCustomerSchema } = require('../validators/customer');

const router = express.Router();

router.use(requireAuth());

router.get('/', requirePermission('customer:view'), validate(getCustomersQuerySchema), getCustomers);
router.post('/', requirePermission('customer:create'), validate(createCustomerSchema), createCustomer);
router.get('/:id', requirePermission('customer:view'), validate(idParamsSchema), getCustomerById);
router.patch('/:id', requirePermission('customer:update'), validate(idParamsSchema), validate(updateCustomerSchema), updateCustomer);
router.delete('/:id', requirePermission('customer:delete'), validate(idParamsSchema), deleteCustomer);

module.exports = router;
