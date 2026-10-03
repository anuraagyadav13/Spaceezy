const express = require('express');
const { getProjects, getProjectById, createProject, updateProject } = require('../controllers/projects');
const { getPropertiesForProject } = require('../controllers/properties');
const { requireAuth, requirePermission } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { createProjectSchema, updateProjectSchema, getProjectsQuerySchema } = require('../validators/project');
const { getPropertiesQuerySchema } = require('../validators/property');

const router = express.Router();

router.use(requireAuth());

router.get('/', requirePermission('inventory:view'), validate(getProjectsQuerySchema), getProjects);
router.post('/', requirePermission('inventory:create'), validate(createProjectSchema), createProject);
router.get('/:id', requirePermission('inventory:view'), getProjectById);
router.patch('/:id', requirePermission('inventory:update'), validate(updateProjectSchema), updateProject);

// Nested properties route
router.get('/:projectId/properties', requirePermission('inventory:view'), validate(getPropertiesQuerySchema), getPropertiesForProject);

module.exports = router;
