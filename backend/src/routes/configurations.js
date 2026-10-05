const express = require('express');
const {
    getConfigurations,
    getConfiguration,
    createConfiguration,
    updateConfiguration,
    deleteConfiguration
} = require('../controllers/configurations');
const { requireAuth, requirePermission } = require('../middleware/auth');
const validate = require('../middleware/validate');
const {
    projectIdParamsSchema,
    createConfigurationSchema,
    updateConfigurationSchema,
    configurationParamsSchema
} = require('../validators/configuration');

const router = express.Router({ mergeParams: true });

router.use(requireAuth());

router.get('/', requirePermission('project:view'), validate(projectIdParamsSchema), getConfigurations);
router.get('/:configId', requirePermission('project:view'), validate(configurationParamsSchema), getConfiguration);
router.post('/', requirePermission('project:create'), validate(createConfigurationSchema), createConfiguration);
router.patch('/:configId', requirePermission('project:update'), validate(updateConfigurationSchema), updateConfiguration);
router.delete('/:configId', requirePermission('project:update'), validate(configurationParamsSchema), deleteConfiguration);

module.exports = router;
