const express = require('express');
const {
    handlePublicEnquiry,
    getPublicProjects,
    getPublicProject,
    getPublicProperties,
    getPublicProperty,
    getPublicLocations,
    getPublicConfigurations,
    getPublicDocument,
    getPublicQuotation
} = require('../controllers/public');
const validate = require('../middleware/validate');
const {
    publicEnquirySchema,
    listPublicProjectsQuerySchema,
    listPublicPropertiesQuerySchema,
    publicProjectParamSchema,
    publicPropertyParamSchema,
    publicDocumentQuerySchema,
    publicQuotationQuerySchema
} = require('../validators/public');

const rateLimit = require('express-rate-limit');

const router = express.Router();

const enquiryLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: { success: false, message: 'Too many enquiries from this IP, please try again later.', code: 'TOO_MANY_REQUESTS' },
    standardHeaders: true,
    legacyHeaders: false,
});

// Generous read limiter: public pages issue list+detail+filter reads in bursts.
const readLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 600,
    message: { success: false, message: 'Too many requests from this IP, please try again later.', code: 'TOO_MANY_REQUESTS' },
    standardHeaders: true,
    legacyHeaders: false,
});

// No auth required for public enquiries
router.post('/enquiries', enquiryLimiter, validate(publicEnquirySchema), handlePublicEnquiry);

// Public website reads (unauthenticated — explicit DTOs, no CRM identifiers)
router.get('/projects', readLimiter, validate(listPublicProjectsQuerySchema), getPublicProjects);
router.get('/projects/:slug', readLimiter, validate(publicProjectParamSchema), getPublicProject);
router.get('/properties', readLimiter, validate(listPublicPropertiesQuerySchema), getPublicProperties);
router.get('/properties/:token', readLimiter, validate(publicPropertyParamSchema), getPublicProperty);
router.get('/locations', readLimiter, getPublicLocations);
router.get('/configurations', readLimiter, getPublicConfigurations);

// The project's uploaded brochure PDF (stored file — never generated).
// Public by design: WhatsApp/Meta fetches this link to deliver the
// attachment, exactly like the quotation route below.
router.get('/documents', readLimiter, validate(publicDocumentQuerySchema), getPublicDocument);

// On-demand quotation PDF (price list + charges + per-send add-ons ->
// itemised document), same delivery contract as the documents route above.
router.get('/quotations', readLimiter, validate(publicQuotationQuerySchema), getPublicQuotation);

module.exports = router;
