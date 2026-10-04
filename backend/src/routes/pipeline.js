const express = require('express');
const { getPipelineDashboard } = require('../controllers/pipeline');
const { requireAuth, requirePermission } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth());

router.get('/', requirePermission('lead:view'), getPipelineDashboard);

module.exports = router;
