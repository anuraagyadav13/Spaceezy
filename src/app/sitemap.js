import { LANDING_PAGES } from "../lib/seo/landingPages";
import { getInventory, filterLanding } from "../lib/seo/inventory";
import { SITE_URL } from "../lib/seo/site";

// Always render with live CRM data (public API is internal and fast).
export const dynamic = "force-dynamic";

const STATIC_PAGES = [
    { path: "/", changeFrequency: "daily", priority: 1 },
    { path: "/projects", changeFrequency: "daily", priority: 0.9 },
    { path: "/properties", changeFrequency: "daily", priority: 0.9 },
    { path: "/about", changeFrequency: "monthly", priority: 0.6 },
    { path: "/contact", changeFrequency: "monthly", priority: 0.6 },
    { path: "/privacy-policy", changeFrequency: "yearly", priority: 0.3 },
    { path: "/terms", changeFrequency: "yearly", priority: 0.3 },
];

export default async function sitemap() {
    const now = new Date();
    const entries = STATIC_PAGES.map((p) => ({
        url: `${SITE_URL}${p.path}`,
        lastModified: now,
        changeFrequency: p.changeFrequency,
        priority: p.priority,
    }));

    let inv = { projects: [], properties: [] };
    try {
        inv = await getInventory();
    } catch {
        // API unreachable: emit static entries only (valid sitemap, retried per request).
    }

    // SEO landing pages: only when they carry real inventory (never thin pages).
    for (const [slug, page] of Object.entries(LANDING_PAGES)) {
        try {
            const { projects, properties } = filterLanding(page, inv);
            if (projects.length + properties.length > 0) {
                entries.push({
                    url: `${SITE_URL}/${slug}`,
                    lastModified: now,
                    changeFrequency: "weekly",
                    priority: 0.8,
                });
            }
        } catch {
            // skip this slug
        }
    }

    // Published projects and units (public API already filters isPublic).
    for (const p of inv.projects || []) {
        if (!p.slug) continue;
        entries.push({
            url: `${SITE_URL}/projects/${p.slug}`,
            lastModified: now,
            changeFrequency: "weekly",
            priority: 0.7,
        });
    }
    for (const pr of inv.properties || []) {
        if (!pr.token) continue;
        entries.push({
            url: `${SITE_URL}/properties/${pr.token}`,
            lastModified: now,
            changeFrequency: "weekly",
            priority: 0.6,
        });
    }

    return entries;
}
