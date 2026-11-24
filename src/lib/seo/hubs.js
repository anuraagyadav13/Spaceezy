/**
 * Data access for generated hub pages.
 *
 * The registry is rebuilt from the (60s-cached) inventory so metadata and the
 * page body always agree about counts, prices and indexability.
 */

import { getInventory } from "./inventory";
import { buildHubRegistry, indexableHubs, navHubs, resolveHubSlug } from "./facets";

let registryCache = { at: 0, inventory: null, registry: null };

export async function getHubRegistry() {
    const inventory = await getInventory();
    if (registryCache.registry && registryCache.inventory === inventory) {
        return registryCache.registry;
    }
    const registry = buildHubRegistry(inventory);
    registryCache = { at: Date.now(), inventory, registry };
    return registry;
}

/** @returns {{hub: object|null, redirectTo: string|null}} */
export async function getHub(slug) {
    const registry = await getHubRegistry();
    return resolveHubSlug(registry, slug);
}

export async function getIndexableHubs() {
    return indexableHubs(await getHubRegistry());
}

export async function getNavHubs() {
    return navHubs(await getHubRegistry());
}

/**
 * Indexable location hubs whose place name matches any of `names`
 * (region first, then district). Used by project/unit pages for their
 * "Properties in {place}" up-links.
 */
export async function findPlaceHubs(names) {
    const registry = await getHubRegistry();
    const wanted = (names || [])
        .filter(Boolean)
        .map((name) => String(name).trim().toLowerCase());
    const seen = new Set();
    const found = [];

    for (const name of wanted) {
        for (const hub of registry.values()) {
            if (!hub.place || hub.kind !== "all" || !hub.indexable) continue;
            if (hub.place.name.toLowerCase() !== name || seen.has(hub.slug)) continue;
            seen.add(hub.slug);
            found.push({ href: hub.path, label: hub.h1, name: hub.place.name });
        }
    }
    return found;
}

export function resetHubCache() {
    registryCache = { at: 0, inventory: null, registry: null };
}
