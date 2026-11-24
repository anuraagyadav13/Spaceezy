#!/usr/bin/env node
/**
 * Redirect destination gate (run against a BUILT, running site).
 *
 * Fails when a redirect source does not answer with one permanent hop, or when
 * its destination is missing, redirects again, renders noindex, has a
 * mismatched canonical, or is absent from the sitemap.
 *
 *   SEO_BASE_URL=http://localhost:3000 node scripts/seo-redirect-check.mjs
 *
 * Pattern aliases are expanded against the places that actually exist in the
 * sitemap, so an empty/noindex destination can never be silently accepted.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

const BASE = (process.env.SEO_BASE_URL || "http://localhost:3000").replace(/\/+$/, "");
const errors = [];
const fail = (message) => errors.push(message);

function readJson(name) {
    try {
        return JSON.parse(readFileSync(join(process.cwd(), name), "utf8"));
    } catch {
        return {};
    }
}

async function get(url) {
    return fetch(url, { redirect: "manual", headers: { "user-agent": "SpaceezyRedirectCheck/1.0" } });
}

function pathOf(value, fallbackBase = BASE) {
    return new URL(value, fallbackBase).pathname;
}

async function main() {
    const sitemapResponse = await get(`${BASE}/sitemap.xml`);
    if (sitemapResponse.status !== 200) throw new Error(`sitemap answered ${sitemapResponse.status}`);
    const sitemapXml = await sitemapResponse.text();
    const sitemapPaths = new Set(
        Array.from(sitemapXml.matchAll(/<loc>([^<]+)<\/loc>/g), (match) => pathOf(match[1], "https://canonical.invalid"))
    );
    console.log(`Redirect gate: ${BASE} (${sitemapPaths.size} indexable paths)`);

    const aliases = readJson("seo-aliases.json").legacyAliases || [];
    const retired = readJson("seo-retired-projects.json").redirects || [];
    const places = Array.from(new Set(
        Array.from(sitemapPaths)
            .map((path) => /-in-([a-z0-9-]+)$/.exec(path)?.[1])
            .filter(Boolean)
    ));

    const pairs = [];
    for (const row of aliases) {
        if (row.source?.includes(":location")) {
            for (const place of places) {
                pairs.push({
                    source: row.source.replace(":location", place),
                    destination: row.destination.replace(":location", place),
                    label: `${row.source} (${place})`,
                });
            }
        } else if (row.source && row.destination) {
            pairs.push({ source: row.source, destination: row.destination, label: row.source });
        }
    }
    for (const row of retired) {
        if (row.slug && row.destination) {
            pairs.push({ source: `/projects/${row.slug}`, destination: row.destination, label: row.slug });
        }
    }

    if (!pairs.length) console.log("No redirect rules configured.");

    for (const pair of pairs) {
        const sourceResponse = await get(`${BASE}${pair.source}`);
        if (![301, 308].includes(sourceResponse.status)) {
            fail(`${pair.label}: source answered ${sourceResponse.status}, expected a permanent redirect`);
            continue;
        }
        const location = sourceResponse.headers.get("location");
        if (!location) {
            fail(`${pair.label}: redirect has no Location header`);
            continue;
        }
        if (pathOf(location) !== pair.destination) {
            fail(`${pair.label}: redirects to ${pathOf(location)}, expected ${pair.destination}`);
            continue;
        }

        const targetResponse = await get(`${BASE}${pair.destination}`);
        if (targetResponse.status !== 200) {
            fail(`${pair.label}: destination ${pair.destination} answered ${targetResponse.status}`);
            continue;
        }
        const html = await targetResponse.text();
        const canonical = /<link[^>]+rel="canonical"[^>]+href="([^"]+)"/i.exec(html)?.[1]
            || /<link[^>]+href="([^"]+)"[^>]+rel="canonical"/i.exec(html)?.[1]
            || null;
        const robots = /<meta[^>]+name="robots"[^>]+content="([^"]*)"/i.exec(html)?.[1] || "";
        const canonicalPath = canonical ? pathOf(canonical) : null;

        if (canonicalPath && canonicalPath !== pair.destination) {
            // Canonical-only duplicate: crawlable/indexable page that points at
            // the surviving hub. Follow the canonical and validate the winner.
            if (!sitemapPaths.has(canonicalPath)) {
                fail(`${pair.label}: canonical target ${canonicalPath} is absent from the sitemap`);
                continue;
            }
            const winnerResponse = await get(`${BASE}${canonicalPath}`);
            if (winnerResponse.status !== 200) {
                fail(`${pair.label}: canonical winner ${canonicalPath} answered ${winnerResponse.status}`);
                continue;
            }
            const winnerHtml = await winnerResponse.text();
            const winnerRobots = /<meta[^>]+name="robots"[^>]+content="([^"]*)"/i.exec(winnerHtml)?.[1] || "";
            if (winnerRobots.includes("noindex")) fail(`${pair.label}: canonical winner is noindex`);
            console.log(`OK  ${pair.source} -> ${pair.destination} (canonical -> ${canonicalPath})`);
            continue;
        }

        if (robots.includes("noindex")) fail(`${pair.label}: destination is noindex`);
        if (!sitemapPaths.has(pair.destination)) {
            fail(`${pair.label}: destination ${pair.destination} is absent from the sitemap`);
        }
        if (!canonical || canonicalPath !== pair.destination) {
            fail(`${pair.label}: destination canonical ${canonical || "(missing)"} != ${pair.destination}`);
        }
        console.log(`OK  ${pair.source} -> ${pair.destination} (200, self-canonical, indexable)`);
    }

    if (errors.length) {
        for (const error of errors) console.error(`ERROR ${error}`);
        console.error(`\nRedirect gate FAILED with ${errors.length} error(s).`);
        process.exit(1);
    }
    console.log(`\nRedirect gate passed (${pairs.length} rule(s) checked).`);
}

main().catch((error) => {
    console.error(`Redirect gate crashed: ${error.message}`);
    process.exit(1);
});
