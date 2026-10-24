const { asyncHandler } = require('../utils/errors');
const LeadService = require('../services/leadService');
const PublicService = require('../services/publicService');
const prisma = require('../db/prisma');

const handlePublicEnquiry = asyncHandler(async (req, res, next) => {
    // In a real application, you might lookup the spaceezy org ID or use a default
    // We assume there's one organization for now
    const defaultOrg = await prisma.organization.findFirst();
    
    if (!defaultOrg) {
        return res.status(500).json({
            success: false,
            message: 'System not configured correctly (No organization found)',
            code: 'INTERNAL_ERROR'
        });
    }

    const lead = await LeadService.handlePublicEnquiry(req.body, defaultOrg.id);

    res.status(201).json({
        success: true,
        data: { id: lead.id }, // Return minimal safe response
        message: 'Enquiry submitted successfully'
    });
});

// ---- Public website read APIs (unauthenticated, explicit DTOs only) ----

const getPublicProjects = asyncHandler(async (req, res) => {
    const result = await PublicService.listProjects(req.query);
    res.status(200).json({
        success: true,
        data: result,
        message: 'Projects fetched successfully'
    });
});

const getPublicProject = asyncHandler(async (req, res) => {
    const project = await PublicService.getProjectBySlug(req.params.slug);
    res.status(200).json({
        success: true,
        data: project,
        message: 'Project fetched successfully'
    });
});

const getPublicProperties = asyncHandler(async (req, res) => {
    const result = await PublicService.listProperties(req.query);
    res.status(200).json({
        success: true,
        data: result,
        message: 'Properties fetched successfully'
    });
});

const getPublicProperty = asyncHandler(async (req, res) => {
    const property = await PublicService.getPropertyByToken(req.params.token);
    res.status(200).json({
        success: true,
        data: property,
        message: 'Property fetched successfully'
    });
});

const getPublicLocations = asyncHandler(async (req, res) => {
    const locations = await PublicService.listLocations();
    res.status(200).json({
        success: true,
        data: locations,
        message: 'Locations fetched successfully'
    });
});

const getPublicConfigurations = asyncHandler(async (req, res) => {
    const configurations = await PublicService.listConfigurations();
    res.status(200).json({
        success: true,
        data: configurations,
        message: 'Configurations fetched successfully'
    });
});

// Serves the project's UPLOADED brochure PDF (documents JSON entry) on
// demand. No auth: Meta's servers fetch this URL to deliver the WhatsApp
// document message, exactly like the quotation route below. The payload is
// the file the employee uploaded — nothing is ever generated. The bucket
// (or local uploads dir) stays private; this route is the delivery path.
const { AppError } = require('../utils/errors');
const { findBrochureDocument, readDocument } = require('../services/storageService');
const { slugify } = require('../utils/publicLink');

const getPublicDocument = asyncHandler(async (req, res) => {
    const project = await prisma.project.findFirst({
        where: { id: req.query.projectId },
        select: { name: true, documents: true }
    });
    if (!project) throw new AppError('Project not found', 404, 'NOT_FOUND');

    const brochure = findBrochureDocument(project.documents);
    if (!brochure) {
        throw new AppError('No brochure PDF has been uploaded for this project yet.', 404, 'NO_BROCHURE');
    }
    const file = await readDocument(brochure);
    if (!file || !file.stream) {
        throw new AppError('The brochure file is currently unavailable.', 404, 'NO_BROCHURE');
    }

    res.set('Content-Type', 'application/pdf');
    res.set('Content-Disposition', `inline; filename="${slugify(project.name) || 'project'}-brochure.pdf"`);
    res.set('Cache-Control', 'public, max-age=3600');
    // A broken storage stream must not crash the process mid-download.
    file.stream.on('error', () => res.destroy());
    file.stream.pipe(res);
});

// Renders the quotation PDF on demand from live project/unit data. Same
// delivery contract as the brochure route: no auth, Meta's servers fetch
// the link for the WhatsApp document message, and the payload only mirrors
// data the public project pages already expose (price list + charges). Any
// per-send add-on values travel as `addons` JSON and are re-validated inside
// the renderer (nothing from the URL is trusted).
const { generateQuotation } = require('../services/quotationPdf');

const getPublicQuotation = asyncHandler(async (req, res) => {
    const { buffer, filename } = await generateQuotation({
        projectId: req.query.projectId,
        propertyId: req.query.unit || null,
        by: req.query.by,
        customer: req.query.customer,
        addons: req.query.addons,
        // Editable sheet from the composer: cost rows, brokerage %, GST % and
        // payout ratios — fully re-validated inside sanitizeQuote.
        quote: req.query.quote
    });
    res.set('Content-Type', 'application/pdf');
    res.set('Content-Disposition', `inline; filename="${filename}"`);
    res.set('Cache-Control', 'public, max-age=3600');
    res.status(200).send(buffer);
});

module.exports = {
    handlePublicEnquiry,
    getPublicProjects,
    getPublicProject,
    getPublicProperties,
    getPublicProperty,
    getPublicLocations,
    getPublicConfigurations,
    getPublicDocument,
    getPublicQuotation
};
