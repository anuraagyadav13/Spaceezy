export const SITE_NAME = "Spaceezy";
export const SITE_URL = "https://Spaceezy.com";
export const SITE_TITLE_FALLBACK = "Spaceezy | Premium Real Estate";
// Business contact number — single source of truth for the whole site
// (footer, floating button, contact page, SEO copy). The footer's
// "Developed by Sharnex" wa.me link is the developer's own credit number
// and intentionally differs — do not unify it.
export const PHONE_DISPLAY = "+91 78272 67897";
export const PHONE_TEL = "+917827267897";
export const WHATSAPP_NUMBER = "917827267897";
export const WHATSAPP_URL = `https://wa.me/${WHATSAPP_NUMBER}`;
export const EMAIL = "admin@Spaceezy.com";
export const OFFICE = {
    streetAddress: "Office No. 04, 1st Floor, Wave Galleria, Sector-3, Wave City",
    addressLocality: "Ghaziabad",
    addressRegion: "Uttar Pradesh",
    postalCode: "201002",
    addressCountry: "IN",
};

export const absoluteUrl = (path = "/") => new URL(path, SITE_URL).toString();

export const organizationJsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${SITE_URL}/#organization`,
    name: SITE_NAME,
    url: `${SITE_URL}/`,
    logo: `${SITE_URL}/images/logo.jpg`,
    email: EMAIL,
    telephone: `+${PHONE_TEL}`,
    address: { "@type": "PostalAddress", ...OFFICE },
};

export const webSiteJsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${SITE_URL}/#website`,
    url: `${SITE_URL}/`,
    name: SITE_NAME,
    publisher: { "@id": `${SITE_URL}/#organization` },
    potentialAction: {
        "@type": "SearchAction",
        target: { "@type": "EntryPoint", urlTemplate: `${SITE_URL}/search?q={search_term_string}` },
        "query-input": "required name=search_term_string",
    },
};

export const realEstateAgentJsonLd = {
    "@context": "https://schema.org",
    "@type": "RealEstateAgent",
    "@id": `${SITE_URL}/#realestateagent`,
    name: SITE_NAME,
    url: `${SITE_URL}/`,
    image: `${SITE_URL}/images/logo.jpg`,
    email: EMAIL,
    telephone: `+${PHONE_TEL}`,
    address: { "@type": "PostalAddress", ...OFFICE },
    areaServed: [{ "@type": "City", name: "Ghaziabad" }],
    parentOrganization: { "@id": `${SITE_URL}/#organization` },
};
