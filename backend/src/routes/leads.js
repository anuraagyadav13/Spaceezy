const express = require('express');
const { getLeads, getLeadById, createLead, updateLead, deleteLead, getMatchingProperties, buildProposalMessage, sharePropertyOnWhatsApp, addInterestedProperty, removeInterestedProperty, addInterestedProject, removeInterestedProject, getClaimableLeads, claimLead, getJunkLeads, discardLead, restoreLead, getFollowups, toggleFollowupStatus, getActivities, bulkAssignLeads, getDuplicates, mergeLeads, transitionStage, logContact, scheduleFollowUp, createBookingFromLead, getTimeline } = require('../controllers/leads');
const { requireAuth, requirePermission, requireRole } = require('../middleware/auth');
const validate = require('../middleware/validate');
const {
    createLeadSchema,
    updateLeadSchema,
    getLeadsQuerySchema,
    getClaimableQuerySchema,
    bulkAssignSchema,
    mergeLeadSchema,
    idParamsSchema,
    transitionStageSchema,
    logContactSchema,
    scheduleFollowUpSchema,
    interestedPropertyParamsSchema,
    addInterestSchema,
    interestedProjectParamsSchema,
    addProjectInterestSchema,
    discardLeadSchema,
    leadBookingSchema,
    proposalSchema,
    sharePropertySchema
} = require('../validators/lead');
const pipelineRoutes = require('./pipeline');

const router = express.Router();

router.use(requireAuth());

// Pipeline aggregate (must be before /:id)
router.use('/pipeline', pipelineRoutes);

// Non-parameterized routes (must be before /:id)
router.get('/follow-ups', requirePermission('lead:view'), getFollowups);
router.patch('/follow-ups/:id/toggle', requirePermission('lead:update'), validate(idParamsSchema), toggleFollowupStatus);
router.get('/activities', requirePermission('lead:view'), getActivities);
router.patch('/bulk-assign', requirePermission('lead:assign'), validate(bulkAssignSchema), bulkAssignLeads);
router.get('/duplicates', requirePermission('lead:view'), getDuplicates);

// Self-claim (must be before /:id so "claimable" is not treated as an id)
router.get('/claimable', requirePermission('lead:view'), requireRole(['SALES_EXECUTIVE']), validate(getClaimableQuerySchema), getClaimableLeads);

// Junk / Discarded view (must be before /:id)
router.get('/junk', requirePermission('lead:view'), getJunkLeads);

// Retention purge (admin only)
router.post('/retention/purge', requirePermission('lead:delete'), async (req, res, next) => {
    try {
        const RetentionService = require('../services/retentionService');
        const result = await RetentionService.runPurge();
        res.status(200).json({ success: true, data: result, message: 'Retention purge executed' });
    } catch (e) {
        next(e);
    }
});

// Discard / restore (parameterized but distinct verbs; safe after /:id? keep before for clarity)
router.post('/:id/discard', requirePermission('lead:update'), validate(discardLeadSchema), discardLead);
router.post('/:id/restore', requirePermission('lead:update'), validate(idParamsSchema), restoreLead);

router.get('/', requirePermission('lead:view'), validate(getLeadsQuerySchema), getLeads);
router.post('/', requirePermission('lead:create'), validate(createLeadSchema), createLead);
router.get('/:id', requirePermission('lead:view'), validate(idParamsSchema), getLeadById);
router.get('/:id/timeline', requirePermission('lead:view'), validate(idParamsSchema), getTimeline);
router.patch('/:id', requirePermission('lead:update'), validate(updateLeadSchema), updateLead);
router.delete('/:id', requirePermission('lead:delete'), validate(idParamsSchema), deleteLead);

// Stage transitions & lead actions
router.post('/:id/stage', requirePermission('lead:update'), validate(transitionStageSchema), transitionStage);
router.post('/:id/claim', requirePermission('lead:update'), requireRole(['SALES_EXECUTIVE']), validate(idParamsSchema), claimLead);
router.post('/:id/contact', requirePermission('lead:update'), validate(logContactSchema), logContact);
router.post('/:id/follow-ups', requirePermission('task:create'), validate(scheduleFollowUpSchema), scheduleFollowUp);
router.post('/:id/bookings', requirePermission('booking:create'), validate(leadBookingSchema), createBookingFromLead);

// Matching
router.get('/:id/matching', requirePermission('lead:view'), validate(idParamsSchema), getMatchingProperties);
router.post('/:id/proposal', requirePermission('lead:view'), validate(proposalSchema), buildProposalMessage);
router.post('/:id/property-share', requirePermission('lead:view'), validate(sharePropertySchema), sharePropertyOnWhatsApp);
router.post('/:id/interested-properties', requirePermission('lead:update'), validate(addInterestSchema), addInterestedProperty);
router.delete('/:id/interested-properties/:propId', requirePermission('lead:update'), validate(interestedPropertyParamsSchema), removeInterestedProperty);
router.post('/:id/interested-projects', requirePermission('lead:update'), validate(addProjectInterestSchema), addInterestedProject);
router.delete('/:id/interested-projects/:projectId', requirePermission('lead:update'), validate(interestedProjectParamsSchema), removeInterestedProject);

// Merge
router.post('/:id/merge', requirePermission('lead:merge'), validate(mergeLeadSchema), mergeLeads);

module.exports = router;
