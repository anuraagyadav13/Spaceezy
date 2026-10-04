const express = require('express');
const { getQuotations, getQuotationById, createQuotation, updateQuotation } = require('../controllers/quotations');
const { requireAuth, requirePermission } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { createQuotationSchema, updateQuotationSchema, getQuotationsQuerySchema } = require('../validators/quotation');

const router = express.Router();

router.use(requireAuth());

router.get('/', requirePermission('quotation:view'), validate(getQuotationsQuerySchema), getQuotations);
router.post('/', requirePermission('quotation:create'), validate(createQuotationSchema), createQuotation);
router.get('/:id', requirePermission('quotation:view'), getQuotationById);
router.patch('/:id', requirePermission('quotation:update'), validate(updateQuotationSchema), updateQuotation);

module.exports = router;
