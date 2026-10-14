const express = require('express');
const {
    getStatus,
    listAdAccounts,
    listCampaigns,
    getInsights,
} = require('../controllers/metaAds');
const { requireAuth, requirePermission } = require('../middleware/auth');
const validate = require('../middleware/validate');
const {
    listAdAccountsSchema,
    listCampaignsSchema,
    insightsQuerySchema,
} = require('../validators/metaAds');

const router = express.Router();

router.use(requireAuth());

// Connection status is safe to expose to viewers: it carries account names
// and permission state, never tokens or secrets.
router.get('/status', requirePermission('marketing:view'), getStatus);
router.get('/ad-accounts', requirePermission('marketing:view'), validate(listAdAccountsSchema), listAdAccounts);
router.get('/campaigns', requirePermission('marketing:view'), validate(listCampaignsSchema), listCampaigns);
router.get('/insights', requirePermission('marketing:view'), validate(insightsQuerySchema), getInsights);

// NOTE: campaign write operations (create/pause/budget) are intentionally
// absent in this read-only phase. POST/PATCH/DELETE here 404 by design.

module.exports = router;
