const express = require('express');
const { getProperties, getPropertyById, createProperty, updateProperty, deleteProperty } = require('../controllers/properties');
const { requireAuth, requirePermission } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { createPropertySchema, updatePropertySchema, getPropertiesQuerySchema } = require('../validators/property');

const router = express.Router();

router.use(requireAuth());

router.get('/', requirePermission('inventory:view'), validate(getPropertiesQuerySchema), getProperties);
router.post('/', requirePermission('inventory:create'), validate(createPropertySchema), createProperty);
router.get('/:id', requirePermission('inventory:view'), getPropertyById);
router.patch('/:id', requirePermission('inventory:update'), validate(updatePropertySchema), updateProperty);
router.delete('/:id', requirePermission('inventory:update'), deleteProperty);

module.exports = router;
