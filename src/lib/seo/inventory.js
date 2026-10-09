// Reads live public inventory from the CRM API (single source of truth) and
// filters it in Next.js for the SEO landing pages. No CRM backend changes.

const API_BASE = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

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

let inventoryCache = null;

// All published projects + units (paged, ≤20 pages of 50). Fetches carry
// revalidate:60, so builds degrade gracefully when the API is unreachable.
export async function getInventory() {
    if (inventoryCache) return inventoryCache;
    const [locations, projects, properties] = await Promise.all([
        getJson("/public/locations"),
        getPaged("/public/projects"),
        getPaged("/public/properties"),
    ]);
    inventoryCache = {
        locations: Array.isArray(locations) ? locations : [],
        projects: projects.items,
        projectsTotal: projects.total,
        properties: properties.items,
        propertiesTotal: properties.total,
    };
    return inventoryCache;
}

export function inScope(location, scope = {}) {
    if (!location) return false;
    if (scope.state && location.state !== scope.state) return false;
    if (scope.district && location.district !== scope.district) return false;
    if (scope.region && location.region !== scope.region) return false;
    return true;
}

// Units often have no explicit `type` in the CRM. Infer it from real data
// (configuration/title/bhk) so type-filtered pages show what genuinely fits.
export function classifyUnitType(item) {
    if (item.type) return item.type;
    const hay = `${item.configuration || ""} ${item.title || ""}`;
    if ((item.bhk && item.bhk > 0) || /\bbhk\b/i.test(hay)) return "Residential";
    if (/\bplot\b/i.test(hay)) return "Plot";
    if (/\b(shop|office|commercial|retail|showroom|godown|warehouse)\b/i.test(hay)) return "Commercial";
    return null;
}

function matchesTextMatch(hay, needle) {
    return hay.toLowerCase().includes(String(needle).toLowerCase());
}

// Apply a landing page's scope + filters to the inventory.
export function filterLanding(page, inv) {
    const scope = page.scope || {};
    const filters = page.filters || {};

    const projects = inv.projects.filter((p) => {
        if (!inScope(p.location, scope)) return false;
        if (filters.projectTypes && filters.projectTypes.length && !filters.projectTypes.includes(p.projectType)) return false;
        if (filters.bhk) {
            const re = new RegExp(`\\b${filters.bhk}\\s?bhk\\b`, "i");
            const hit = (p.configurations || []).some((c) => re.test(c && c.name ? c.name : ""));
            if (!hit) return false;
        }
        if (filters.propertyType && p.projectType !== filters.propertyType) return false;
        if (filters.textMatch) {
            const hay = `${p.name || ""} ${p.description || ""} ${(p.configurations || []).map((c) => c && c.name).join(" ")}`;
            if (!matchesTextMatch(hay, filters.textMatch)) return false;
        }
        return true;
    });

    const properties = inv.properties.filter((pr) => {
        if (!inScope(pr.location, scope)) return false;
        if (filters.propertyType && classifyUnitType(pr) !== filters.propertyType) return false;
        if (filters.bhk && pr.bhk !== filters.bhk) return false;
        if (filters.forSale && pr.purpose && String(pr.purpose).toLowerCase() === "rent") return false;
        if (filters.textMatch) {
            const hay = `${pr.title || ""} ${pr.configuration || ""} ${pr.type || ""} ${(pr.project && pr.project.name) || ""}`;
            if (!matchesTextMatch(hay, filters.textMatch)) return false;
        }
        return true;
    });

    return { projects, properties };
}

export function landingCounts(page, inv) {
    const { projects, properties } = filterLanding(page, inv);
    return { projects, properties, count: projects.length + properties.length, indexable: projects.length + properties.length > 0 };
}
