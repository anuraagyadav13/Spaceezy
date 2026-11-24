/**
 * Lifecycle redirects for projects that were removed from the CRM.
 *
 * The rows live in `seo-retired-projects.json` so the Next config (edge
 * redirect) and the project route (runtime fallback) stay in sync. An empty
 * list means no project has been retired yet.
 */

import config from "../../../seo-retired-projects.json";

const ROWS = Array.isArray(config?.redirects) ? config.redirects : [];

/** @returns {string|null} canonical destination for a retired project slug. */
export function retiredProjectPath(slug) {
    const value = String(slug || "").toLowerCase();
    const row = ROWS.find((entry) => String(entry.slug || "").toLowerCase() === value);
    return row && row.destination ? row.destination : null;
}
