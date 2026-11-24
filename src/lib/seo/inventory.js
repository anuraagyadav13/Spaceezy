/**
 * Live public inventory (projects + units + location master) from the CRM API.
 *
 * This is the only data source for generated pages. Nothing is mocked and no
 * record is invented: if the API is unreachable the callers degrade to an
 * empty inventory and every generated page is simply not indexable.
 *
 * The module cache has a 60s TTL so an ISR revalidation actually picks up new
 * projects/units (the previous version cached for the lifetime of the process).
 */

import { projectQuality, unitQuality } from "./quality";

const API_BASE =
    process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

export const INVENTORY_TTL_MS = 60_000;

async function getJson(path, params = {}) {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== "") query.set(key, String(value));
    });
    const qs = query.toString();
    try {
        const res = await fetch(`${API_BASE}${path}${qs ? `?${qs}` : ""}`, { next: { revalidate: 60 } });
        if (!res.ok) return null;
        const payload = await res.json();
        return payload && payload.success ? payload.data : null;
    } catch {
        return null;
    }
}

async function getPaged(path, params = {}) {
    let page = 1;
    let items = [];
    let total = 0;
    let totalPages = 1;
    do {
        const data = await getJson(path, { ...params, page, limit: 50 });
        if (!data) break;
        items = items.concat(Array.isArray(data.items) ? data.items : []);
        total = Number(data.total) || items.length;
        totalPages = Number(data.totalPages) || 1;
        page += 1;
    } while (page <= totalPages && page <= 20 && items.length < total);
    return { items, total };
}

let cache = { at: 0, data: null };

/**
 * Only indexable items feed hub counts, copy, schema and links. A project that
 * fails the quality gate (or a sold unit whose page redirects) must not be
 * advertised as part of a collection.
 */
export function visibleInventory({ projects = [], properties = [] } = {}) {
    return {
        projects: projects.filter((project) => projectQuality(project).ok),
        properties: properties.filter(
            (unit) =>
                unitQuality(unit).ok &&
                String(unit.availability || "").toLowerCase() !== "sold"
        ),
    };
}

/** Test/ISR helper — force the next reader to refetch. */
export function resetInventoryCache() {
    cache = { at: 0, data: null };
}

export async function getInventory({ fresh = false } = {}) {
    if (!fresh && cache.data && Date.now() - cache.at < INVENTORY_TTL_MS) return cache.data;

    const [locations, projects, properties] = await Promise.all([
        getJson("/public/locations"),
        getPaged("/public/projects"),
        getPaged("/public/properties"),
    ]);

    const visible = visibleInventory({ projects: projects.items, properties: properties.items });
    cache = {
        at: Date.now(),
        data: {
            locations: Array.isArray(locations) ? locations : [],
            projects: visible.projects,
            projectsTotal: visible.projects.length,
            properties: visible.properties,
            propertiesTotal: visible.properties.length,
        },
    };
    return cache.data;
}

export { classifyUnitType } from "./facets";
