const express = require('express');
const { getSiteVisits, getSiteVisitById, createSiteVisit, updateSiteVisit, updateSiteVisitStatus, deleteSiteVisit } = require('../controllers/siteVisits');
const { requireAuth, requirePermission } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { getSiteVisitsQuerySchema, createSiteVisitSchema, updateSiteVisitSchema } = require('../validators/siteVisit');

const router = express.Router();

router.use(requireAuth());

router.get('/', requirePermission('site_visit:view'), validate(getSiteVisitsQuerySchema), getSiteVisits);
router.post('/', requirePermission('site_visit:create'), validate(createSiteVisitSchema), createSiteVisit);
router.get('/:id', requirePermission('site_visit:view'), getSiteVisitById);
router.patch('/:id', requirePermission('site_visit:update'), validate(updateSiteVisitSchema), updateSiteVisit);
router.patch('/:id/status', requirePermission('site_visit:update'), updateSiteVisitStatus);
router.delete('/:id', requirePermission('site_visit:delete'), deleteSiteVisit);

module.exports = router;
