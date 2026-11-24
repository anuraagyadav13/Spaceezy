/**
 * Shared helpers for optional hub preferences (plain ESM so both the Next
 * registry and the Node audit scripts can import them).
 */

export function normalizePreferenceItems(items) {
    return (Array.isArray(items) ? items : [])
        .map((item) => {
            const value = String(item).trim();
            if (/^[pu]:/.test(value)) return value;
            return /^[0-9a-f]{32}$/i.test(value) ? `u:${value}` : `p:${value}`;
        })
        .sort();
}

/** Signature of an inventory's item set, in the same form as preference rows. */
export function itemSetSignature({ projects = [], properties = [] } = {}) {
    return normalizePreferenceItems([
        ...projects.map((project) => `p:${project.slug}`),
        ...properties.map((unit) => `u:${unit.token}`),
    ]);
}

/**
 * Parse `seo-hub-preferences.json` into usable rows.
 * Invalid rows are ignored (an unmatched row is reported by the audit, not
 * applied by the registry).
 */
export function parsePreferences(config) {
    return (Array.isArray(config?.preferences) ? config.preferences : [])
        .map((row) => ({
            items: normalizePreferenceItems(row.items),
            preferred: String(row.preferred || ""),
        }))
        .filter((row) => row.items.length > 0 && row.preferred.startsWith("/"));
}

/**
 * Rows whose item set does not match any set currently present in inventory.
 * Used by `seo:audit` as a warning: a stale preference is harmless but should
 * be removed or corrected by a human owner.
 */
export function unmatchedPreferences(preferences, inventory) {
    const slugs = new Set(normalizePreferenceItems((inventory?.projects || []).map((project) => `p:${project.slug}`)));
    const tokens = new Set(normalizePreferenceItems((inventory?.properties || []).map((unit) => `u:${unit.token}`)));
    // "Matches" = every named item is currently published. A stale row is
    // harmless but should be corrected by the person who owns the file.
    return preferences.filter(
        (row) => !row.items.every((item) => slugs.has(item) || tokens.has(item))
    );
}
