/**
 * Content-quality gate.
 *
 * A project/unit page is only indexable when the data behind it is complete
 * enough to be useful: a real location, configurations, a price range, a
 * possession date, RERA details, amenities, a page description and enough
 * gallery images. The same result drives:
 *   - <meta name="robots"> on the page
 *   - sitemap inclusion
 *   - the admin warning list
 *
 * Thresholds are configuration, not code: tune them with env vars without a
 * deploy of the page templates.
 */

import { toNumber, toText } from "./text";
import { configurationNames } from "./facts";

const int = (value, fallback) => {
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
};

const bool = (value, fallback) => {
    if (value === undefined || value === null || value === "") return fallback;
    return String(value).toLowerCase() !== "false" && String(value) !== "0";
};

export const QUALITY_RULES = Object.freeze({
    minDescriptionChars: int(process.env.SEO_MIN_DESCRIPTION_CHARS, 300),
    minGalleryImages: int(process.env.SEO_MIN_GALLERY_IMAGES, 3),
    minAmenities: int(process.env.SEO_MIN_AMENITIES, 1),
    minConfigurations: 1,
    // Roll-out switches: turn a requirement off without a code change if the
    // back-catalogue has not been completed yet.
    requirePossession: bool(process.env.SEO_REQUIRE_POSSESSION, true),
    requireRera: bool(process.env.SEO_REQUIRE_RERA, true),
});

const present = (value) => value !== undefined && value !== null && String(value).trim() !== "";

/** `undefined` = the payload does not carry the field; `null` = known missing. */
const known = (record, key) => Object.prototype.hasOwnProperty.call(record, key);

function placeName(location) {
    if (!location) return "";
    return toText(location.region || location.locality || location.district || location.city);
}

/**
 * @returns {{ok: boolean, missing: string[], warnings: string[]}}
 */
export function projectQuality(project) {
    const record = project || {};
    const missing = [];
    const warnings = [];

    if (!present(record.slug)) missing.push("public URL slug");
    if (!present(record.name)) missing.push("project name");
    if (!placeName(record.location)) missing.push("location (region/district/city)");

    const configurations = configurationNames(record.configurations);
    if (configurations.length < QUALITY_RULES.minConfigurations) missing.push("unit configurations");

    if (!toNumber(record.startingPrice) && !toNumber(record.maximumPrice)) missing.push("price range");

    if (QUALITY_RULES.requirePossession && known(record, "possessionDate") && !present(record.possessionDate)) {
        missing.push("possession date");
    }

    const reraNumber = toText(record.rera?.number) || toText(record.reraNumber);
    if (QUALITY_RULES.requireRera && (known(record, "rera") || known(record, "reraNumber"))) {
        if (!reraNumber) missing.push("RERA number");
    }

    const amenities = Array.isArray(record.amenities) ? record.amenities.filter(present) : null;
    const amenitiesCount = amenities
        ? amenities.length
        : toNumber(record.amenitiesCount);
    if (amenitiesCount !== null && amenitiesCount < QUALITY_RULES.minAmenities) {
        missing.push("amenities");
    }

    const images = Array.isArray(record.images) ? record.images.filter(present) : null;
    const imageCount = images ? images.length : toNumber(record.imageCount);
    if (imageCount !== null && imageCount < QUALITY_RULES.minGalleryImages) {
        missing.push(`at least ${QUALITY_RULES.minGalleryImages} gallery images`);
    }

    const description = toText(record.description || record.shortDescription);
    const descriptionLength = toNumber(record.descriptionLength) ?? (known(record, "description") ? description.length : null);
    if (descriptionLength !== null) {
        if (descriptionLength === 0) {
            missing.push("page description");
        } else if (descriptionLength < QUALITY_RULES.minDescriptionChars) {
            warnings.push(
                `Description is ${descriptionLength} characters; ${QUALITY_RULES.minDescriptionChars}+ is required for indexing.`
            );
            missing.push("longer page description");
        }
    }

    return { ok: missing.length === 0, missing: Array.from(new Set(missing)), warnings };
}

/**
 * Unit pages need less: title, price, a configuration or BHK, an area and an
 * image. Sold units are handled separately by lifecycle rules.
 *
 * @returns {{ok: boolean, missing: string[], warnings: string[]}}
 */
export function unitQuality(property) {
    const record = property || {};
    const missing = [];
    const warnings = [];

    if (!present(record.token)) missing.push("public link");
    if (!present(record.title)) missing.push("unit title");
    if (!toNumber(record.price)) missing.push("price");
    if (!present(record.configuration) && !toNumber(record.bhk)) missing.push("configuration or BHK");
    if (!toNumber(record.area)) missing.push("area");
    if (!placeName(record.location)) missing.push("location");

    const images = Array.isArray(record.images) ? record.images.filter(present) : null;
    const hasImage = images ? images.length > 0 : present(record.image);
    if (!hasImage) missing.push("photo");

    if (known(record, "description") && !present(record.description)) {
        warnings.push("Unit has no description; the project description is shown instead.");
    }

    return { ok: missing.length === 0, missing, warnings };
}

/** Human-readable admin warning lines for the CRM. */
export function qualityWarnings(kind, record) {
    const result = kind === "unit" ? unitQuality(record) : projectQuality(record);
    if (result.ok && result.warnings.length === 0) return [];
    const lines = [];
    if (result.missing.length) {
        lines.push(`Not indexable yet — missing: ${result.missing.join(", ")}.`);
    }
    lines.push(...result.warnings);
    return lines;
}
