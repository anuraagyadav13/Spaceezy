#!/usr/bin/env node
/**
 * IndexNow ping for the canonical URLs in the sitemap.
 *
 * Setup (one time, by ops): generate a key, host it at
 *   https://<host>/<key>.txt
 * and set INDEXNOW_KEY + INDEXNOW_KEY_LOCATION in the deployment env.
 * The key is a secret-ish token: never commit it to this repository.
 *
 *   npm run seo:indexnow                       # submit every sitemap URL
 *   npm run seo:indexnow -- /projects/my-slug  # submit one changed URL
 *
 * With no INDEXNOW_KEY configured the command is a safe no-op (exit 0), so it
 * can run in every environment's CI without secrets.
 */

const SITE = (process.env.NEXT_PUBLIC_SITE_URL || "https://spaceezy.com").replace(/\/+$/, "");
const BASE = (process.env.SEO_BASE_URL || SITE).replace(/\/+$/, "");
const SITEMAP = process.env.SEO_SITEMAP_URL || `${BASE}/sitemap.xml`;
const KEY = process.env.INDEXNOW_KEY || "";
const KEY_LOCATION = process.env.INDEXNOW_KEY_LOCATION || (KEY ? `${SITE}/${KEY}.txt` : "");
const ENDPOINT = "https://api.indexnow.org/indexnow";

async function sitemapUrls() {
    const response = await fetch(SITEMAP);
    if (!response.ok) throw new Error(`${SITEMAP} answered ${response.status}`);
    const xml = await response.text();
    return Array.from(xml.matchAll(/<loc>([^<]+)<\/loc>/g), (match) => match[1].trim())
        .filter((url) => url.startsWith("https://"));
}

async function main() {
    if (!KEY) {
        console.log("IndexNow skipped: INDEXNOW_KEY is not configured.");
        return;
    }
    const explicit = process.argv.slice(2).filter((arg) => !arg.startsWith("-"));
    const urls = explicit.length ? explicit.map((path) => new URL(path, `${SITE}/`).toString()) : await sitemapUrls();
    if (!urls.length) throw new Error("No URLs to submit");
    if (urls.length > 10000) throw new Error("IndexNow accepts at most 10,000 URLs per request");

    const response = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify({
            host: new URL(SITE).host,
            key: KEY,
            keyLocation: KEY_LOCATION,
            urlList: urls,
        }),
    });
    if (!response.ok) throw new Error(`IndexNow answered ${response.status}: ${await response.text()}`);
    console.log(`IndexNow accepted ${urls.length} URL(s).`);
}

main().catch((error) => {
    console.error(`IndexNow failed: ${error.message}`);
    process.exit(1);
});
