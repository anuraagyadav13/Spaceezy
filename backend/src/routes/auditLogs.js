const express = require('express');
const { getAuditLogs } = require('../controllers/auditLogs');
const { requireAuth, requirePermission } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { listAuditLogsSchema } = require('../validators/audit');

const router = express.Router();

router.use(requireAuth());

router.get('/', requirePermission('audit:view'), validate(listAuditLogsSchema), getAuditLogs);

module.exports = router;
