const express = require('express');
const { handlePublicEnquiry } = require('../controllers/public');
const validate = require('../middleware/validate');
const { publicEnquirySchema } = require('../validators/public');

const rateLimit = require('express-rate-limit');

const router = express.Router();

const enquiryLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: { success: false, message: 'Too many enquiries from this IP, please try again later.', code: 'TOO_MANY_REQUESTS' },
    standardHeaders: true,
    legacyHeaders: false,
});

// No auth required for public enquiries
router.post('/enquiries', enquiryLimiter, validate(publicEnquirySchema), handlePublicEnquiry);

module.exports = router;
