import { SITE_URL } from "../lib/seo/site";

/**
 * robots.txt is generated from this config only — no hand-edited text file.
 *
 * Utility and parameterised URLs are disallowed here AND marked noindex on the
 * pages themselves, so a crawler can never index a filter permutation.
 */
const DISALLOW = [
    "/dashboard",
    "/login",
    "/api",
    "/search",
    "/enquiry",
    // Parameterised filter/sort/pagination URLs.
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
