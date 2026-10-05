const express = require('express');
const { getProperties, getPropertyById, createProperty, updateProperty, deleteProperty, bulkImport } = require('../controllers/properties');
const { requireAuth, requirePermission } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { createPropertySchema, updatePropertySchema, getPropertiesQuerySchema, propertyIdParamsSchema, bulkImportSchema } = require('../validators/property');

const router = express.Router();

router.use(requireAuth());

router.get('/', requirePermission('inventory:view'), validate(getPropertiesQuerySchema), getProperties);
router.post('/', requirePermission('inventory:create'), validate(createPropertySchema), createProperty);
router.post('/bulk-import', requirePermission('inventory:create'), validate(bulkImportSchema), bulkImport);
router.get('/:id', requirePermission('inventory:view'), validate(propertyIdParamsSchema), getPropertyById);
router.patch('/:id', requirePermission('inventory:update'), validate(propertyIdParamsSchema), validate(updatePropertySchema), updateProperty);
router.delete('/:id', requirePermission('inventory:update'), validate(propertyIdParamsSchema), deleteProperty);

module.exports = router;
