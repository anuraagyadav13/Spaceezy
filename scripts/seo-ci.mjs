#!/usr/bin/env node
/**
 * SEO CI crawl — runs against a built, running site.
 *
 *   SEO_BASE_URL=https://spaceezy.com node scripts/seo-ci.mjs
 *   SEO_BASE_URL=http://localhost:3000 node scripts/seo-ci.mjs
 *
 * Checks (fails with exit code 1 on any error):
 *   - every sitemap URL answers 200 without redirecting;
 *   - canonical link is present, absolute, HTTPS and equal to the sitemap URL;
 *   - titles are unique, descriptions are unique, lengths are sane;
 *   - exactly one <h1> per page;
 *   - every internal <a href> is crawlable (no http://, no >1-hop redirect,
 *     no broken target);
 *   - every project page receives at least three internal links;
 *   - all JSON-LD blocks parse and declare @context/@type;
 *   - noindex pages never appear in the sitemap.
 */

const BASE = (process.env.SEO_BASE_URL || "http://localhost:3000").replace(/\/+$/, "");
const MAX_PAGES = Number(process.env.SEO_CRAWL_MAX || 300);
const CONCURRENCY = Number(process.env.SEO_CRAWL_CONCURRENCY || 6);

const BASE_ORIGIN = new URL(BASE).origin;
const LOCAL_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(BASE_ORIGIN);

/**
 * Sitemap <loc> values always carry the canonical HTTPS origin. When crawling
 * a local/staged build we must request the same path from BASE, otherwise the
 * test would silently crawl production instead of the build under test.
 */
function fetchLoc(loc) {
    if (!LOCAL_ORIGIN) return loc;
    const url = new URL(loc);
    return `${BASE_ORIGIN}${url.pathname}${url.search}`;
}

const errors = [];
const warnings = [];
const fail = (message) => errors.push(message);
const warn = (message) => warnings.push(message);

function decodeEntities(value) {
    return value
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#x27;|&#39;/g, "'")
        .replace(/&#x2F;/g, "/");
}

function match(html, regex) {
    const found = regex.exec(html);
    return found ? decodeEntities(found[1]).trim() : null;
}

async function get(url, options = {}) {
    const response = await fetch(url, {
        redirect: "manual",
        headers: { "user-agent": "SpaceezySEOCrawl/1.0", accept: "text/html,application/xml" },
        ...options,
    });
    return response;
}

function parseSitemap(xml) {
    const urls = [];
    const blocks = xml.match(/<url>[\s\S]*?<\/url>/g) || [];
    for (const block of blocks) {
        const loc = match(block, /<loc>([\s\S]*?)<\/loc>/);
        if (!loc) continue;
        const lastmod = match(block, /<lastmod>([\s\S]*?)<\/lastmod>/);
        urls.push({ loc, lastmod });
    }
    return urls;
}

function parsePage(html) {
    const title = match(html, /<title[^>]*>([\s\S]*?)<\/title>/);
    const description = match(html, /<meta[^>]+name="description"[^>]+content="([^"]*)"/i);
    const canonical = match(html, /<link[^>]+rel="canonical"[^>]+href="([^"]*)"/i)
        || match(html, /<link[^>]+href="([^"]*)"[^>]+rel="canonical"/i);
    const robots = match(html, /<meta[^>]+name="robots"[^>]+content="([^"]*)"/i) || "";
    const h1Count = (html.match(/<h1\b/gi) || []).length;

    const jsonLd = [];
    const scripts = html.match(/<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g) || [];
    for (const block of scripts) {
        const body = block.replace(/^<script[^>]*>/, "").replace(/<\/script>$/, "");
        try {
            jsonLd.push(JSON.parse(body));
        } catch (error) {
            jsonLd.push({ __parseError: error.message });
        }
    }

    const links = [];
    const anchors = html.match(/<a\b[^>]*href="([^"]*)"[^>]*>/gi) || [];
    for (const anchor of anchors) {
        const href = /href="([^"]*)"/i.exec(anchor)[1];
        if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) continue;
        links.push(decodeEntities(href));
    }

    return { title, description, canonical, robots, h1Count, jsonLd, links };
}

function toPath(url, base = BASE) {
    try {
        const parsed = new URL(url, base);
        if (parsed.origin !== new URL(base).origin) return null;
        return parsed.pathname + parsed.search;
    } catch {
        return null;
    }
}

async function mapLimit(items, limit, worker) {
    const results = new Array(items.length);
    let index = 0;
    const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
        while (index < items.length) {
            const current = index++;
            results[current] = await worker(items[current], current);
        }
    });
    await Promise.all(runners);
    return results;
}

async function main() {
    console.log(`SEO crawl: ${BASE}`);

    const sitemapResponse = await get(`${BASE}/sitemap.xml`);
    if (sitemapResponse.status !== 200) {
        throw new Error(`/sitemap.xml answered ${sitemapResponse.status}`);
    }
    const sitemapEntries = parseSitemap(await sitemapResponse.text());
    if (!sitemapEntries.length) throw new Error("/sitemap.xml has no <url> entries");
    console.log(`Sitemap URLs: ${sitemapEntries.length}`);

    const robotsResponse = await get(`${BASE}/robots.txt`);
    const robotsText = robotsResponse.status === 200 ? await robotsResponse.text() : "";
    if (!robotsText.includes("Sitemap:")) fail("robots.txt does not reference a sitemap");
    if (robotsText.includes("http://")) fail("robots.txt contains a plain-http URL");
    if (!/Disallow:\s*\/(search|enquiry)/i.test(robotsText)) {
        warn("robots.txt does not disallow /search and /enquiry");
    }

    const targets = sitemapEntries.slice(0, MAX_PAGES);
    if (sitemapEntries.length > MAX_PAGES) {
        warn(`Sitemap has ${sitemapEntries.length} URLs; crawled the first ${MAX_PAGES}.`);
    }

    const pages = await mapLimit(targets, CONCURRENCY, async (entry) => {
        const expected = entry.loc.split("#")[0];
        const response = await get(fetchLoc(expected));
        if (response.status !== 200) {
            fail(`${expected} answered ${response.status} (sitemap must contain only 200 URLs)`);
            return { url: expected, page: null };
        }
        const page = parsePage(await response.text());
        return { url: expected, expectedCanonical: expected, page };
    });

    const titleMap = new Map();
    const descriptionMap = new Map();
    const inbound = new Map();
    const linkTargets = new Set();
    const canonicalMismatch = [];

    for (const { url, page } of pages) {
        if (!page) continue;

        if (!page.canonical) {
            fail(`${url} has no canonical link`);
        } else {
            if (!page.canonical.startsWith("https://")) fail(`${url} canonical is not HTTPS: ${page.canonical}`);
            if (page.canonical.replace(/\/$/, "") !== url.replace(/\/$/, "")) {
                canonicalMismatch.push(`${url} -> ${page.canonical}`);
            }
        }

        if (page.robots.includes("noindex")) {
            fail(`${url} is in the sitemap but marked noindex`);
        }

        if (!page.title) fail(`${url} has no <title>`);
        else {
            if (page.title.length > 70) warn(`${url} title is ${page.title.length} chars: ${page.title}`);
            if (titleMap.has(page.title)) fail(`Duplicate title: ${url} and ${titleMap.get(page.title)} — "${page.title}"`);
            else titleMap.set(page.title, url);
        }

        if (!page.description) {
            fail(`${url} has no meta description`);
        } else {
            if (page.description.length < 70) warn(`${url} description is only ${page.description.length} chars`);
            if (descriptionMap.has(page.description)) {
                fail(`Duplicate description: ${url} and ${descriptionMap.get(page.description)}`);
            } else {
                descriptionMap.set(page.description, url);
            }
        }

        if (page.h1Count !== 1) fail(`${url} has ${page.h1Count} <h1> elements (expected exactly 1)`);

        for (const schema of page.jsonLd) {
            if (schema.__parseError) fail(`${url} has invalid JSON-LD: ${schema.__parseError}`);
            else if (!schema["@context"] || !schema["@type"]) fail(`${url} JSON-LD is missing @context/@type`);
        }

        for (const href of page.links) {
            if (href.startsWith("http://")) {
                fail(`${url} links over plain HTTP: ${href}`);
                continue;
            }
            const path = toPath(href);
            if (!path) continue;
            const target = `${BASE}${path}`;
            linkTargets.add(target);
            const selfPath = new URL(url).pathname;
            if (path.replace(/\/$/, "") === selfPath.replace(/\/$/, "")) continue;
            if (!inbound.has(path)) inbound.set(path, new Set());
            inbound.get(path).add(url);
        }
    }

    if (canonicalMismatch.length) {
        for (const mismatch of canonicalMismatch.slice(0, 20)) fail(`Canonical != sitemap URL: ${mismatch}`);
    }

    // Link targets: must be 200 or a single permanent redirect to a 200.
    const sitemapPaths = new Set(targets.map((entry) => new URL(entry.loc).pathname));
    const targetsToCheck = Array.from(linkTargets).filter((target) => !sitemapPaths.has(new URL(target).pathname));
    const linkStatus = new Map();
    await mapLimit(targetsToCheck, CONCURRENCY, async (target) => {
        let response = await get(target);
        let hops = 0;
        while ([301, 302, 307, 308].includes(response.status) && hops < 5) {
            hops += 1;
            const location = response.headers.get("location");
            if (!location) break;
            const next = new URL(location, target).toString();
            if (hops > 1) fail(`Redirect chain longer than one hop: ${target} -> ${next}`);
            response = await get(next);
        }
        linkStatus.set(target, response.status);
        if (response.status >= 400) fail(`Broken internal link ${target} (${response.status})`);
    });

    // Three-link rule for project pages present in the sitemap.
    for (const entry of targets) {
        const path = new URL(entry.loc).pathname;
        if (!/^\/projects\/[^/]+$/.test(path)) continue;
        const sources = inbound.get(path) || new Set();
        if (sources.size < 3) {
            fail(`${entry.loc} is linked from ${sources.size} page(s); at least 3 are required`);
        }
    }

    // lastmod sanity: a sitemap that regenerates "now" on every build is wrong.
    const now = Date.now();
    const suspicious = sitemapEntries.filter((entry) => entry.lastmod && now - new Date(entry.lastmod).getTime() < 10 * 60 * 1000);
    if (suspicious.length > 0) {
        warn(`${suspicious.length} sitemap URL(s) have a lastmod within the last 10 minutes (build-time timestamp?)`);
    }

    console.log(`Pages crawled: ${pages.filter((entry) => entry.page).length}`);
    console.log(`Internal targets checked: ${targetsToCheck.length}`);
    for (const message of warnings.slice(0, 30)) console.log(`WARN  ${message}`);
    if (warnings.length > 30) console.log(`... ${warnings.length - 30} more warnings`);
    for (const message of errors.slice(0, 30)) console.log(`ERROR ${message}`);
    if (errors.length > 30) console.log(`... ${errors.length - 30} more errors`);

    if (errors.length) {
        console.error(`\nSEO crawl failed with ${errors.length} error(s).`);
        process.exit(1);
    }
    console.log(`\nSEO crawl passed with ${warnings.length} warning(s).`);
}

main().catch((error) => {
    console.error(`SEO crawl crashed: ${error.message}`);
    process.exit(1);
});
