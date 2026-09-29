const express = require('express');
const { getLeads, getLeadById, createLead, updateLead, deleteLead } = require('../controllers/leads');
const { requireAuth, requirePermission } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { createLeadSchema, updateLeadSchema, getLeadsQuerySchema } = require('../validators/lead');

const router = express.Router();

router.use(requireAuth());

router.get('/', requirePermission('lead:view'), validate(getLeadsQuerySchema), getLeads);
router.post('/', requirePermission('lead:create'), validate(createLeadSchema), createLead);
router.get('/:id', requirePermission('lead:view'), getLeadById);
router.patch('/:id', requirePermission('lead:update'), validate(updateLeadSchema), updateLead);
router.delete('/:id', requirePermission('lead:delete'), deleteLead);

module.exports = router;
