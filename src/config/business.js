/**
 * Deployment-level brand profile — the single source of truth for the
 * business identity used across the public site (footer, contact page,
 * structured data, transactional copy).
 *
 * This is infrastructure configuration, NOT page content: no project,
 * unit, price or locality listing data belongs here. Everything is
 * overridable through environment variables so a deployment never needs a
 * code change to fix its own NAP (name/address/phone) details.
 *
 * The fallbacks below match the current production deployment so the site
 * keeps working before the env file is populated; set the NEXT_PUBLIC_*
 * values in `.env.production` to make them explicit.
 */

const env = (key, fallback) => {
    const value = process.env[key];
    return value && String(value).trim() ? String(value).trim() : fallback;
};

export const BUSINESS = {
    name: env("NEXT_PUBLIC_BUSINESS_NAME", "Spaceezy"),
    legalName: env("NEXT_PUBLIC_BUSINESS_LEGAL_NAME", "Spaceezy Real Estate"),
    tagline: env("NEXT_PUBLIC_BUSINESS_TAGLINE", "Premium Real Estate"),
    description: env(
        "NEXT_PUBLIC_BUSINESS_DESCRIPTION",
        "Discover spaces designed for the way you want to live. Premium real estate projects and properties."
    ),
    email: env("NEXT_PUBLIC_BUSINESS_EMAIL", "admin@spaceezy.com"),
    phoneDisplay: env("NEXT_PUBLIC_BUSINESS_PHONE", "+91 76830 20204"),
    phoneTel: env("NEXT_PUBLIC_BUSINESS_PHONE_TEL", "+917683020204"),
    whatsapp: env("NEXT_PUBLIC_BUSINESS_WHATSAPP", "917683020204"),
    logo: env("NEXT_PUBLIC_BUSINESS_LOGO", "/images/spaceezy-logo.webp"),
    ogImage: env("NEXT_PUBLIC_BUSINESS_OG_IMAGE", "/images/og-default.jpg"),
    address: {
        streetAddress: env(
            "NEXT_PUBLIC_BUSINESS_STREET",
            "Office No. 04, 1st Floor, Wave Galleria, Sector-3, Wave City"
        ),
        addressLocality: env("NEXT_PUBLIC_BUSINESS_LOCALITY", "Ghaziabad"),
        addressRegion: env("NEXT_PUBLIC_BUSINESS_REGION", "Uttar Pradesh"),
        postalCode: env("NEXT_PUBLIC_BUSINESS_POSTAL_CODE", "201002"),
        addressCountry: env("NEXT_PUBLIC_BUSINESS_COUNTRY", "IN"),
    },
    areaServed: {
        city: env("NEXT_PUBLIC_BUSINESS_AREA_CITY", "Ghaziabad"),
        region: env("NEXT_PUBLIC_BUSINESS_AREA_REGION", "Uttar Pradesh"),
    },
};

export const WHATSAPP_URL = `https://wa.me/${BUSINESS.whatsapp}`;
