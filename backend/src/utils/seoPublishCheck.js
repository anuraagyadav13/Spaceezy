// Publish-time SEO checks for projects and units.
//
// The website only indexes a page when the fields behind it are complete
// (see src/lib/seo/quality.js in the Next app). This module mirrors those
// rules on the write path so a CRM user is warned *before* publishing, and
// hard-blocks the one case that is plainly wrong data: a unit priced below
// its own project's stated starting price.
//
// It never mutates data and never throws for warnings — callers attach the
// returned lines to the API response so the admin UI can display them.

const int = (value, fallback) => {
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
};

const RULES = {
    minDescriptionChars: int(process.env.SEO_MIN_DESCRIPTION_CHARS, 300),
    minGalleryImages: int(process.env.SEO_MIN_GALLERY_IMAGES, 3),
    minAmenities: int(process.env.SEO_MIN_AMENITIES, 1)
};

const text = (value) => String(value === undefined || value === null ? '' : value).trim();
const num = (value) => {
    if (value === undefined || value === null || value === '') return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
};

function projectPublishIssues(project, { configurationCount = 0 } = {}) {
    if (!project || project.isPublic !== true) return [];
    const issues = [];

    const hasLocation = Boolean(project.regionId || project.districtId || project.stateId || text(project.city) || text(project.locality));
    if (!hasLocation) issues.push('Location is required: choose a region/district or fill the city.');

    if (!configurationCount) issues.push('At least one active configuration is required.');

    if (num(project.startingPrice) === null && num(project.maximumPrice) === null) {
        issues.push('A starting price (or maximum price) is required.');
    }

    if (!text(project.possessionDate)) issues.push('Possession date is required.');

    if (project.reraRegistered && !text(project.reraNumber)) {
        issues.push('RERA is marked as registered but the RERA number is missing.');
    }

    const description = text(project.description);
    if (!description) {
        issues.push('A project description is required.');
    } else if (description.length < RULES.minDescriptionChars) {
        issues.push(`Description is ${description.length} characters; at least ${RULES.minDescriptionChars} are needed for indexing.`);
    }

    const imageCount = Array.isArray(project.images) ? project.images.filter(Boolean).length : 0;
    if (imageCount < RULES.minGalleryImages) {
        issues.push(`At least ${RULES.minGalleryImages} gallery images are required (currently ${imageCount}).`);
    }

    const amenitiesCount = Array.isArray(project.amenities) ? project.amenities.filter(Boolean).length : 0;
    if (amenitiesCount < RULES.minAmenities) {
        issues.push(`At least ${RULES.minAmenities} amenit${RULES.minAmenities === 1 ? 'y is' : 'ies are'} required.`);
    }

    return issues;
}

/**
 * Hard validation: a published unit can never be priced below its project's
 * starting price. Returns an error message or null.
 */
function unitPriceError(unitPrice, project) {
    const price = num(unitPrice);
    const floor = num(project && project.startingPrice);
    if (price === null || floor === null || floor <= 0) return null;
    if (price >= floor) return null;
    return `Unit price (${price}) is below the project starting price (${floor}). Update the project starting price or correct the unit price.`;
}

/** Soft warnings for a unit that is about to be published. */
function unitPublishIssues(unit) {
    if (!unit || unit.isPublic !== true) return [];
    const issues = [];

    if (num(unit.price) === null) issues.push('Price is required.');
    if (!text(unit.configuration) && num(unit.bhk) === null) issues.push('Configuration or BHK is required.');
    if (num(unit.areaSaleable || unit.area || unit.areaCarpet) === null) issues.push('Area is required.');
    const imageCount = Array.isArray(unit.images) ? unit.images.filter(Boolean).length : 0;
    if (!imageCount) issues.push('At least one photo is required.');

    return issues;
}

module.exports = { RULES, projectPublishIssues, unitPublishIssues, unitPriceError };
