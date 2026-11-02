const { asyncHandler, AppError } = require('../utils/errors');
const ProjectService = require('../services/projectService');
const prisma = require('../db/prisma');
const { uploadDocument, readDocument, findBrochureDocument } = require('../services/storageService');
const { slugify } = require('../utils/publicLink');

const getProjects = asyncHandler(async (req, res, next) => {
    const { organizationId } = req.auth;
    const result = await ProjectService.getProjects(organizationId, req.query);
    
    res.status(200).json({
        success: true,
        data: result,
        message: 'Projects fetched successfully'
    });
});

const getProjectById = asyncHandler(async (req, res, next) => {
    const { id } = req.params;
    const { organizationId } = req.auth;
    
    const project = await ProjectService.getProjectById(id, organizationId);
    
    res.status(200).json({
        success: true,
        data: project,
        message: 'Project fetched successfully'
    });
});

const createProject = asyncHandler(async (req, res, next) => {
    const { organizationId } = req.auth;
    
    const project = await ProjectService.createProject(req.body, organizationId);
    
    res.status(201).json({
        success: true,
        data: project,
        message: 'Project created successfully'
    });
});

const updateProject = asyncHandler(async (req, res, next) => {
    const { id } = req.params;
    const { organizationId } = req.auth;
    
    const project = await ProjectService.updateProject(id, req.body, organizationId);
    
    res.status(200).json({
        success: true,
        data: project,
        message: 'Project updated successfully'
    });
});

const deleteProject = asyncHandler(async (req, res, next) => {
    const { id } = req.params;
    const { organizationId } = req.auth;
    
    const result = await ProjectService.deleteProject(id, organizationId);
    
    const message = result.deleted
        ? 'Project deleted successfully'
        : 'Project archived (has associated data)';

    res.status(200).json({
        success: true,
        data: result,
        message
    });
});

// ---------------------------------------------------------------------------
// Project brochure — an OPTIONAL employee-uploaded PDF (max 15 MB).
//
// The brochure is a stored file, never a generated document: the employee
// picks a PDF (composer or this form), it is validated by magic bytes and
// stored (S3 in production, local disk in dev) and the project's documents
// JSON records the reference. Sending uses the public /public/documents
// route so Meta can fetch the exact file that was uploaded. The upload
// persists immediately — the project save form is not involved.
// ---------------------------------------------------------------------------

const isBrochureEntry = (doc) => Boolean(
    doc && typeof doc === 'object' && /brochure/i.test(String(doc.name || doc.label || doc.type || ''))
);

const uploadProjectBrochure = asyncHandler(async (req, res) => {
    const { organizationId } = req.auth;
    const buffer = Buffer.isBuffer(req.body) ? req.body : null;
    if (!buffer || !buffer.length) {
        throw new AppError('No PDF received. Send the file as a raw application/pdf body.', 400, 'VALIDATION_ERROR');
    }

    const project = await prisma.project.findFirst({
        where: { id: req.params.id, organizationId },
        select: { id: true, name: true, documents: true }
    });
    if (!project) throw new AppError('Project not found', 404, 'NOT_FOUND');

    const { url, key, storage } = await uploadDocument({ buffer, organizationId });

    // Replace any previous brochure entry; keep every other document.
    const existing = Array.isArray(project.documents) ? project.documents : [];
    const entry = {
        name: 'Brochure',
        url,
        key,
        storage,
        contentType: 'application/pdf',
        size: buffer.length,
        uploadedAt: new Date().toISOString()
    };
    const documents = [...existing.filter((doc) => !isBrochureEntry(doc)), entry];
    await prisma.project.update({ where: { id: project.id }, data: { documents } });

    res.status(201).json({
        success: true,
        data: { brochure: entry, documents },
        message: 'Brochure uploaded'
    });
});

const deleteProjectBrochure = asyncHandler(async (req, res) => {
    const { organizationId } = req.auth;

    const project = await prisma.project.findFirst({
        where: { id: req.params.id, organizationId },
        select: { id: true, name: true, documents: true }
    });
    if (!project) throw new AppError('Project not found', 404, 'NOT_FOUND');

    const existing = Array.isArray(project.documents) ? project.documents : [];
    const documents = existing.filter((doc) => !isBrochureEntry(doc));
    await prisma.project.update({ where: { id: project.id }, data: { documents } });

    res.status(200).json({
        success: true,
        data: { brochure: null, documents },
        message: 'Brochure removed'
    });
});

// Authenticated download of the uploaded brochure for the CRM (project page
// Preview). Sending to WhatsApp goes through the public documents route
// instead — both read the same stored file.
const getProjectBrochure = asyncHandler(async (req, res) => {
    const { organizationId } = req.auth;

    const project = await prisma.project.findFirst({
        where: { id: req.params.id, organizationId },
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
    // A broken storage stream must not crash the process mid-download.
    file.stream.on('error', () => res.destroy());
    file.stream.pipe(res);
});

module.exports = {
    getProjects,
    getProjectById,
    createProject,
    updateProject,
    deleteProject,
    uploadProjectBrochure,
    deleteProjectBrochure,
    getProjectBrochure
};
