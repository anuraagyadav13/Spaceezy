/**
 * Site-wide SEO configuration.
 *
 * The canonical origin comes from the environment (`NEXT_PUBLIC_SITE_URL`) so
 * staging builds can never emit production canonicals by accident. Every
 * absolute URL on the site is derived from this single value, and it is
 * forced to HTTPS — see `normaliseSiteUrl`.
 *
 * Brand/NAP identity lives in `src/config/business.js` (env overridable).
 */

import { BUSINESS } from "../../config/business";

const DEFAULT_SITE_URL = "https://spaceezy.com";

function normaliseSiteUrl(raw) {
    const candidate = String(raw || "").trim() || DEFAULT_SITE_URL;
    try {
        const url = new URL(candidate);
        // Canonicals are always HTTPS, even if the env var says http://.
        return `${url.origin.replace(/^http:\/\//i, "https://")}`;
    } catch {
        return DEFAULT_SITE_URL;
    }
}

export const SITE_URL = normaliseSiteUrl(process.env.NEXT_PUBLIC_SITE_URL);
export const SITE_NAME = BUSINESS.name;
export const SITE_TITLE_FALLBACK = `${BUSINESS.name} | ${BUSINESS.tagline}`;
export const SITE_DESCRIPTION = BUSINESS.description;

// Business contact details (single source of truth for the whole site).
export const PHONE_DISPLAY = BUSINESS.phoneDisplay;
export const PHONE_TEL = BUSINESS.phoneTel.startsWith("+") ? BUSINESS.phoneTel : `+${BUSINESS.phoneTel}`;
export const WHATSAPP_NUMBER = BUSINESS.whatsapp;
export const WHATSAPP_URL = `https://wa.me/${WHATSAPP_NUMBER}`;
export const EMAIL = BUSINESS.email;
export const OFFICE = { ...BUSINESS.address };

/** Absolute URL for any site path. */
export const absoluteUrl = (path = "/") => new URL(path, `${SITE_URL}/`).toString();

/**
 * Canonical form of a path: leading slash, no trailing slash (except "/"),
 * no query string or fragment. Search engines see exactly one variant.
 */
export function canonicalPath(path = "/") {
    let value = String(path || "/").split("#")[0].split("?")[0];
    if (!value.startsWith("/")) value = `/${value}`;
    value = value.replace(/\/{2,}/g, "/");
    if (value.length > 1) value = value.replace(/\/+$/, "");
    return value || "/";
}

/** Absolute canonical URL for a path. */
export const canonicalUrl = (path = "/") => absoluteUrl(canonicalPath(path));
