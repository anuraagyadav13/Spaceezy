/**
 * Sitemap builder — database-driven, no build timestamps.
 *
 * Only URLs that are:
 *   - 200 (rendered, canonical),
 *   - indexable (quality gate + inventory threshold),
 *   - not redirected, sold or removed
 * make it into the sitemap. Every entry carries the record's own `updatedAt`
 * as `lastModified`; pages without a real timestamp omit the element instead
 * of claiming "now".
 *
 * `changeFrequency`/`priority` are intentionally absent: Google ignores them.
 */

import { canonicalPath, canonicalUrl } from "./site";
import { projectQuality, unitQuality } from "./quality";
import { indexableHubs } from "./facets";

/** Static, always-indexable marketing pages. */
export const STATIC_SITEMAP_PATHS = Object.freeze([
    "/",
    "/projects",
    "/properties",
    "/about",
    "/contact",
    "/privacy-policy",
    "/terms",
]);

/** Split large sitemaps into chunks of 45k URLs (well under the 50k limit). */
export const SITEMAP_CHUNK_SIZE = 45_000;

const isInactive = (status) => String(status || "").toUpperCase() === "INACTIVE";
const isSoldUnit = (availability) => String(availability || "").toLowerCase() === "sold";

function toIso(value) {
    if (!value) return null;
    const time = new Date(value).getTime();
    return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

/**
 * @param {{inventory: object, registry: Map<string, object>, extraPaths?: string[]}} input
 * @returns {{url: string, lastModified?: string}[]}
 */
export function buildSitemapEntries({ inventory, registry, extraPaths = [] }) {
    const entries = new Map();

    const add = (path, lastModified) => {
        if (!path) return;
        const normalized = canonicalPath(path);
        const url = canonicalUrl(normalized);
        const stamp = toIso(lastModified);
        const existing = entries.get(url);
        if (!existing) {
            entries.set(url, stamp ? { url, lastModified: stamp } : { url });
            return;
        }
        if (stamp && (!existing.lastModified || stamp > existing.lastModified)) {
            existing.lastModified = stamp;
        }
    };

    for (const path of STATIC_SITEMAP_PATHS) add(path);
    for (const path of extraPaths) add(path);

    for (const hub of indexableHubs(registry)) {
        add(hub.path, hub.lastModified);
    }

    for (const project of inventory.projects || []) {
        if (!project.slug || isInactive(project.status)) continue;
        if (!projectQuality(project).ok) continue;
        add(`/projects/${project.slug}`, project.updatedAt);
    }

    for (const unit of inventory.properties || []) {
        if (!unit.token || isSoldUnit(unit.availability)) continue;
        if (!unitQuality(unit).ok) continue;
        add(`/properties/${unit.token}`, unit.updatedAt);
    }

    return Array.from(entries.values()).sort((a, b) => a.url.localeCompare(b.url));
}

export function chunkEntries(entries, size = SITEMAP_CHUNK_SIZE) {
    const chunks = [];
    for (let index = 0; index < entries.length; index += size) {
        chunks.push(entries.slice(index, index + size));
    }
    return chunks.length ? chunks : [[]];
}

/** URLs that must never appear in a sitemap, for CI assertions. */
export const NEVER_INDEXABLE_PREFIXES = Object.freeze(["/search", "/enquiry", "/dashboard", "/login", "/api"]);
