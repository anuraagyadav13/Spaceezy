#!/usr/bin/env node
/**
 * Inventory vs sitemap audit — the human-facing companion to the crawl.
 *
 * Lists every published project and unit that is NOT in the sitemap, i.e.
 * every record that is currently noindex because it fails the content gate
 * (or is sold / inactive / redirected). Use it to fill the CRM fields that
 * the gate requires.
 *
 *   node scripts/seo-audit.mjs                 # report only
 *   node scripts/seo-audit.mjs --strict        # exit 1 if anything is missing
 *   SEO_BASE_URL=... API_BASE=... node scripts/seo-audit.mjs
 */

const SITE = (process.env.SEO_BASE_URL || "http://localhost:3000").replace(/\/+$/, "");
const API = (process.env.API_BASE || "http://localhost:8000/api/v1").replace(/\/+$/, "");
const STRICT = process.argv.includes("--strict");

async function json(url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${url} answered ${response.status}`);
    const payload = await response.json();
    if (!payload.success) throw new Error(`${url} returned an unsuccessful payload`);
    return payload.data;
}

async function all(path) {
    const items = [];
    let page = 1;
    for (;;) {
        const data = await json(`${API}${path}?limit=50&page=${page}`);
        items.push(...(Array.isArray(data.items) ? data.items : []));
        if (!data.totalPages || page >= data.totalPages || page >= 40) break;
        page += 1;
    }
    return items;
}

async function main() {
    const [sitemapResponse, projects, units] = await Promise.all([
        fetch(`${SITE}/sitemap.xml`),
        all("/public/projects"),
        all("/public/properties"),
    ]);
    if (!sitemapResponse.ok) throw new Error(`/sitemap.xml answered ${sitemapResponse.status}`);
    const sitemap = await sitemapResponse.text();
    // Compare paths, not origins: a staged build emits production canonicals
    // in <loc> while the audit runs against localhost.
    const sitemapPaths = new Set(
        Array.from(sitemap.matchAll(/<loc>([^<]+)<\/loc>/g), (match) => {
            try {
                return new URL(match[1]).pathname;
            } catch {
                return null;
            }
        }).filter(Boolean)
    );
    const inSitemap = (path) => sitemapPaths.has(path);

    const missingProjects = projects.filter((project) => !inSitemap(`/projects/${project.slug}`));
    const missingUnits = units.filter((unit) => !inSitemap(`/properties/${unit.token}`));

    console.log(`Sitemap: ${SITE}/sitemap.xml`);
    console.log(`Published projects: ${projects.length}, not indexable: ${missingProjects.length}`);
    console.log(`Published units: ${units.length}, not indexable: ${missingUnits.length}`);

    if (missingProjects.length) {
        console.log("\nProjects awaiting data (noindex until complete):");
        for (const project of missingProjects) {
            console.log(`  - ${project.name} (/projects/${project.slug}) status=${project.status}`);
        }
    }
    if (missingUnits.length) {
        console.log("\nUnits awaiting data (noindex until complete):");
        for (const unit of missingUnits) {
            console.log(`  - ${unit.title} (/properties/${unit.token}) availability=${unit.availability}`);
        }
    }
    if (!missingProjects.length && !missingUnits.length) {
        console.log("\nEvery published record is indexable.");
    }

    if (STRICT && (missingProjects.length || missingUnits.length)) {
        console.error("\nStrict mode: fix the records above (or lower the SEO_* thresholds) before shipping.");
        process.exit(1);
    }
}

main().catch((error) => {
    console.error(`Audit failed: ${error.message}`);
    process.exit(1);
});
