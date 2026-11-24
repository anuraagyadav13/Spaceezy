#!/usr/bin/env node
/**
 * Print the JSON-LD @type inventory for one page of each type.
 * Run once against production (before) and once against the built branch
 * (after) to compare structured-data coverage.
 *
 *   SEO_BASE_URL=https://spaceezy.com node scripts/seo-schema-report.mjs
 *   SEO_BASE_URL=http://localhost:3000 node scripts/seo-schema-report.mjs
 */

const BASE = (process.env.SEO_BASE_URL || "http://localhost:3000").replace(/\/+$/, "");
const BASE_ORIGIN = new URL(BASE).origin;
const LOCAL = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(BASE_ORIGIN);

function fetchUrl(loc) {
    if (!LOCAL) return loc;
    const url = new URL(loc);
    return `${BASE_ORIGIN}${url.pathname}${url.search}`;
}

async function main() {
    const sitemapResponse = await fetch(`${BASE}/sitemap.xml`);
    const xml = await sitemapResponse.text();
    const locs = Array.from(xml.matchAll(/<loc>([^<]+)<\/loc>/g), (match) => match[1].trim());
    const find = (pattern) => locs.find((loc) => pattern.test(new URL(loc).pathname));
    const api = (process.env.SEO_API_BASE || `${BASE}/api/v1`).replace(/\/+$/, "");

    async function firstFromApi(path, key) {
        try {
            const response = await fetch(`${api}${path}?limit=1`);
            const payload = await response.json();
            const item = payload?.data?.items?.[0];
            return item ? `${BASE_ORIGIN}/${key}/${encodeURIComponent(item[key === "projects" ? "slug" : "token"])}` : null;
        } catch {
            return null;
        }
    }

    const samples = [
        ["home", locs.find((loc) => new URL(loc).pathname === "/")],
        ["projects list", find(/^\/projects$/)],
        ["properties list", find(/^\/properties$/)],
        ["hub", find(/^\/properties-in-/)],
        ["project detail", find(/^\/projects\/[^/]+$/) || await firstFromApi("/public/projects", "projects")],
        ["property detail", find(/^\/properties\/[^/]+$/) || await firstFromApi("/public/properties", "properties")],
        ["search (utility)", `${BASE_ORIGIN}/search`],
        ["enquiry (utility)", `${BASE_ORIGIN}/enquiry`],
    ];

    console.log(`Schema report: ${BASE}`);
    for (const [label, loc] of samples) {
        if (!loc) {
            console.log(`${label.padEnd(18)} NO SAMPLE IN SITEMAP`);
            continue;
        }
        const response = await fetch(fetchUrl(loc));
        if (!response.ok) {
            console.log(`${label.padEnd(18)} HTTP ${response.status}`);
            continue;
        }
        const html = await response.text();
        const blocks = Array.from(html.matchAll(/<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g));
        const types = [];
        for (const block of blocks) {
            try {
                const parsed = JSON.parse(block[1]);
                const values = Array.isArray(parsed) ? parsed : [parsed];
                for (const value of values) types.push(value["@type"] || "(no @type)");
            } catch {
                types.push("(invalid JSON)");
            }
        }
        console.log(`${label.padEnd(18)} HTTP ${response.status}  blocks=${blocks.length}  types=${types.join(", ") || "(none)"}`);
    }
}

main().catch((error) => {
    console.error(`Schema report failed: ${error.message}`);
    process.exit(1);
});
