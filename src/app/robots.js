import { SITE_URL } from "../lib/seo/site";

/**
 * robots.txt is generated from this config only — no hand-edited text file.
 *
 * Utility pages (/search, /enquiry) are deliberately crawlable so Google can
 * see their noindex directive: disallowing them would hide that signal. Only
 * private routes and parameter/filter permutations are disallowed here.
 */
const DISALLOW = [
    "/dashboard",
    "/login",
    "/api",
    // Parameterised filter/sort/pagination URLs — keep these disallowed.
    "/*?*sort=",
    "/*?*page=",
    "/*?*minPrice=",
    "/*?*maxPrice=",
    "/*?*bhk=",
    "/*?*configuration=",
    "/*?*filter=",
];

export default function robots() {
    return {
        rules: [{ userAgent: "*", allow: "/", disallow: DISALLOW }],
        sitemap: `${SITE_URL}/sitemap.xml`,
        host: SITE_URL,
    };
}
