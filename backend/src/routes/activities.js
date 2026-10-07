const express = require('express');
const { getAgenda, getProductivity, getNeedsAttention } = require('../controllers/activities');
const { requireAuth, requirePermission } = require('../middleware/auth');
const validate = require('../middleware/validate');
const {
    agendaQuerySchema,
    productivityQuerySchema,
    needsAttentionQuerySchema
} = require('../validators/activity');

const router = express.Router();

router.use(requireAuth());

router.get('/agenda', requirePermission('task:view'), validate(agendaQuerySchema), getAgenda);
router.get('/productivity', requirePermission('lead:view'), validate(productivityQuerySchema), getProductivity);
router.get('/needs-attention', requirePermission('lead:view'), validate(needsAttentionQuerySchema), getNeedsAttention);

module.exports = router;
