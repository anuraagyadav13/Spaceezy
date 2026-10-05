const express = require('express');
const { getProjects, getProjectById, createProject, updateProject, deleteProject } = require('../controllers/projects');
const { getPropertiesForProject } = require('../controllers/properties');
const { requireAuth, requirePermission } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { createProjectSchema, updateProjectSchema, getProjectsQuerySchema } = require('../validators/project');
const { getPropertiesQuerySchema } = require('../validators/property');
const configurationRoutes = require('./configurations');

const router = express.Router();

router.use(requireAuth());

// Nested configurations (Project -> Configuration -> Property)
router.use('/:projectId/configurations', configurationRoutes);

router.get('/', requirePermission('project:view'), validate(getProjectsQuerySchema), getProjects);
router.post('/', requirePermission('project:create'), validate(createProjectSchema), createProject);
router.get('/:id', requirePermission('project:view'), getProjectById);
router.patch('/:id', requirePermission('project:update'), validate(updateProjectSchema), updateProject);
router.delete('/:id', requirePermission('project:delete'), deleteProject);

// Nested properties route
router.get('/:projectId/properties', requirePermission('inventory:view'), validate(getPropertiesQuerySchema), getPropertiesForProject);

module.exports = router;
