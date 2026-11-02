const express = require('express');
const { getProjects, getProjectById, createProject, updateProject, deleteProject, uploadProjectBrochure, deleteProjectBrochure, getProjectBrochure } = require('../controllers/projects');
const { getPropertiesForProject } = require('../controllers/properties');
const { requireAuth, requirePermission } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { createProjectSchema, updateProjectSchema, getProjectsQuerySchema, projectBrochureParamsSchema, projectParamsSchema } = require('../validators/project');
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

// Optional brochure PDF (raw bytes, PDF only, 15 MB cap — the storage
// service re-validates the magic bytes). Uploaded immediately on pick.
router.post(
    '/:id/brochure',
    requirePermission('project:update'),
    express.raw({ type: 'application/pdf', limit: '15mb' }),
    validate(projectBrochureParamsSchema),
    uploadProjectBrochure
);
router.delete('/:id/brochure', requirePermission('project:update'), validate(projectBrochureParamsSchema), deleteProjectBrochure);

// Authenticated download of the uploaded brochure (INTERNAL ONLY — brochure
// sending to clients was removed, so no public delivery path exists). Any
// staff who can view the project can preview the PDF in the CRM.
router.get('/:id/brochure', requirePermission('project:view'), validate(projectParamsSchema), getProjectBrochure);

// Nested properties route
router.get('/:projectId/properties', requirePermission('inventory:view'), validate(getPropertiesQuerySchema), getPropertiesForProject);

module.exports = router;
