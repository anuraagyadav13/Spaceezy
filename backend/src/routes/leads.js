const express = require('express');
const { getLeads, getLeadById, createLead, updateLead, deleteLead, getMatchingProperties, addInterestedProperty, removeInterestedProperty, getFollowups, toggleFollowupStatus, getActivities, bulkAssignLeads, getDuplicates, mergeLeads, transitionStage, logContact, scheduleFollowUp, createBookingFromLead } = require('../controllers/leads');
const { requireAuth, requirePermission } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { createLeadSchema, updateLeadSchema, getLeadsQuerySchema } = require('../validators/lead');
const pipelineRoutes = require('./pipeline');

const router = express.Router();

router.use(requireAuth());

// Pipeline aggregate (must be before /:id)
router.use('/pipeline', pipelineRoutes);

// Non-parameterized routes (must be before /:id)
router.get('/follow-ups', requirePermission('lead:view'), getFollowups);
router.patch('/follow-ups/:id/toggle', requirePermission('lead:update'), toggleFollowupStatus);
router.get('/activities', requirePermission('lead:view'), getActivities);
router.patch('/bulk-assign', requirePermission('lead:update'), bulkAssignLeads);
router.get('/duplicates', requirePermission('lead:view'), getDuplicates);

router.get('/', requirePermission('lead:view'), validate(getLeadsQuerySchema), getLeads);
router.post('/', requirePermission('lead:create'), validate(createLeadSchema), createLead);
router.get('/:id', requirePermission('lead:view'), getLeadById);
router.patch('/:id', requirePermission('lead:update'), validate(updateLeadSchema), updateLead);
router.delete('/:id', requirePermission('lead:delete'), deleteLead);

// Stage transitions & lead actions
router.post('/:id/stage', requirePermission('lead:update'), transitionStage);
router.post('/:id/contact', requirePermission('lead:update'), logContact);
router.post('/:id/follow-ups', requirePermission('task:create'), scheduleFollowUp);
router.post('/:id/bookings', requirePermission('booking:create'), createBookingFromLead);

// Matching
router.get('/:id/matching', requirePermission('lead:view'), getMatchingProperties);
router.post('/:id/interested-properties', requirePermission('lead:update'), addInterestedProperty);
router.delete('/:id/interested-properties/:propId', requirePermission('lead:update'), removeInterestedProperty);

// Merge
router.post('/:id/merge', requirePermission('lead:update'), mergeLeads);

module.exports = router;
