const express = require('express');
const { handlePublicEnquiry } = require('../controllers/public');
const validate = require('../middleware/validate');
const { publicEnquirySchema } = require('../validators/public');

const router = express.Router();

// No auth required for public enquiries
router.post('/enquiries', validate(publicEnquirySchema), handlePublicEnquiry);

module.exports = router;
