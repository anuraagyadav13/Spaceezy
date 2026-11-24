/**
 * Reusable JSON-LD generators.
 *
 * Rules enforced here:
 *  - every entity is keyed to an absolute HTTPS URL derived from SITE_URL;
 *  - only values that are actually rendered on the page are marked up
 *    (no hidden prices, no invented ratings or reviews);
 *  - one generator per page type so projects, units and hubs can never drift.
 */

import { BUSINESS } from "../../config/business";
import { SITE_URL, absoluteUrl, canonicalUrl, EMAIL, PHONE_TEL } from "./site";
import { joinList, priceRangeLabel, toText } from "./text";

const POSTAL_ADDRESS = {
    "@type": "PostalAddress",
    streetAddress: BUSINESS.address.streetAddress,
    addressLocality: BUSINESS.address.addressLocality,
    addressRegion: BUSINESS.address.addressRegion,
    postalCode: BUSINESS.address.postalCode,
    addressCountry: BUSINESS.address.addressCountry,
};

export function organizationSchema() {
    return {
        "@context": "https://schema.org",
        "@type": "Organization",
        "@id": `${SITE_URL}/#organization`,
        name: BUSINESS.legalName,
        alternateName: BUSINESS.name,
        url: `${SITE_URL}/`,
        logo: absoluteUrl(BUSINESS.logo),
        image: absoluteUrl(BUSINESS.logo),
        email: EMAIL,
        telephone: PHONE_TEL,
        address: POSTAL_ADDRESS,
        contactPoint: {
            "@type": "ContactPoint",
            telephone: PHONE_TEL,
            contactType: "sales",
            areaServed: BUSINESS.address.addressCountry,
            availableLanguage: ["en", "hi"],
        },
    };
}

export function realEstateAgentSchema() {
    return {
        "@context": "https://schema.org",
        "@type": "RealEstateAgent",
        "@id": `${SITE_URL}/#realestateagent`,
        name: BUSINESS.name,
        url: `${SITE_URL}/`,
        image: absoluteUrl(BUSINESS.logo),
        logo: absoluteUrl(BUSINESS.logo),
        email: EMAIL,
        telephone: PHONE_TEL,
        address: POSTAL_ADDRESS,
        areaServed: [
            { "@type": "City", name: BUSINESS.areaServed.city },
            { "@type": "State", name: BUSINESS.areaServed.region },
        ],
        parentOrganization: { "@id": `${SITE_URL}/#organization` },
    };
}

export function webSiteSchema() {
    return {
        "@context": "https://schema.org",
        "@type": "WebSite",
        "@id": `${SITE_URL}/#website`,
        url: `${SITE_URL}/`,
        name: BUSINESS.name,
        description: BUSINESS.description,
        publisher: { "@id": `${SITE_URL}/#organization` },
        inLanguage: "en-IN",
        potentialAction: {
            "@type": "SearchAction",
            target: { "@type": "EntryPoint", urlTemplate: `${SITE_URL}/search?q={search_term_string}` },
            "query-input": "required name=search_term_string",
        },
    };
}

/** @param {{name: string, href?: string|null}[]} items */
export function breadcrumbSchema(items) {
    const list = items.filter(Boolean);
    if (list.length === 0) return null;
    return {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        "@id": `${canonicalUrl(list[list.length - 1].href || "/")}#breadcrumb`,
        itemListElement: list.map((item, index) => ({
            "@type": "ListItem",
            position: index + 1,
            name: toText(item.name),
            ...(item.href ? { item: canonicalUrl(item.href) } : {}),
        })),
    };
}

/**
 * @param {{name: string, url: string, price?: number|null, type?: string}[]} items
 */
export function itemListSchema({ name, items, url }) {
    const list = (items || []).filter((item) => item && item.name && item.url);
    if (list.length === 0) return null;
    return {
        "@context": "https://schema.org",
        "@type": "ItemList",
        "@id": `${canonicalUrl(url || "/")}#itemlist`,
        name: toText(name),
        numberOfItems: list.length,
        itemListElement: list.slice(0, 50).map((item, index) => ({
            "@type": "ListItem",
            position: index + 1,
            name: toText(item.name),
            item: {
                "@type": item.type || "Thing",
                "@id": canonicalUrl(item.url),
                name: toText(item.name),
                url: canonicalUrl(item.url),
                ...(item.price ? { offers: { "@type": "Offer", price: item.price, priceCurrency: "INR" } } : {}),
            },
        })),
    };
}

export function webPageSchema({ url, name, description, breadcrumbUrl }) {
    return {
        "@context": "https://schema.org",
        "@type": "WebPage",
        "@id": `${canonicalUrl(url)}#webpage`,
        url: canonicalUrl(url),
        name: toText(name),
        ...(description ? { description: toText(description) } : {}),
        isPartOf: { "@id": `${SITE_URL}/#website` },
        ...(breadcrumbUrl ? { breadcrumb: { "@id": `${canonicalUrl(breadcrumbUrl)}#breadcrumb` } } : {}),
        inLanguage: "en-IN",
    };
}

const schemaAvailability = (availability) => {
    const value = String(availability || "").toLowerCase();
    if (value === "sold") return "https://schema.org/SoldOut";
    if (value === "limited availability") return "https://schema.org/LimitedAvailability";
    if (value === "sold out") return "https://schema.org/SoldOut";
    return "https://schema.org/InStock";
};

/**
 * Project page schema. `ApartmentComplex` is the closest schema.org type for a
 * builder project; commercial projects are described as a `Place`.
 */
export function projectSchema({ facts, images = [], url, description, amenities = [] }) {
    if (!facts || !facts.name || !facts.slug) return null;

    const commercial = String(facts.projectType || "").toLowerCase().startsWith("commercial");
    const address = {
        "@type": "PostalAddress",
        ...(facts.address ? { streetAddress: facts.address } : {}),
        addressLocality: facts.location?.city || facts.location?.district || facts.location?.region || "",
        addressRegion: facts.location?.state || "",
        addressCountry: "IN",
    };

    return {
        "@context": "https://schema.org",
        "@type": commercial ? "Place" : "ApartmentComplex",
        "@id": `${canonicalUrl(url)}#project`,
        name: facts.name,
        url: canonicalUrl(url),
        ...(description ? { description: toText(description) } : {}),
        ...(images.length ? { image: images.slice(0, 8).map((src) => absoluteUrl(src)) } : {}),
        address,
        ...(facts.reraNumber ? { identifier: facts.reraNumber } : {}),
        ...(amenities.length
            ? {
                  amenityFeature: amenities.slice(0, 20).map((name) => ({
                      "@type": "LocationFeatureSpecification",
                      name: toText(name),
                      value: true,
                  })),
              }
            : {}),
        ...(facts.priceMin
            ? {
                  offers: {
                      "@type": "AggregateOffer",
                      priceCurrency: "INR",
                      lowPrice: facts.priceMin,
                      ...(facts.priceMax ? { highPrice: facts.priceMax } : {}),
                      ...(facts.totalUnits ? { offerCount: facts.totalUnits } : {}),
                      availability: schemaAvailability(facts.status === "SOLD_OUT" ? "Sold out" : facts.availabilityLabel),
                      url: canonicalUrl(url),
                  },
              }
            : {}),
    };
}

/** Unit (resale/single listing) schema: a RealEstateListing with an Offer. */
export function unitSchema({ facts, images = [], url, description }) {
    if (!facts || !facts.token) return null;
    const name = facts.title || joinList([facts.configuration, facts.projectName].filter(Boolean), "in");
    const accommodationName = [facts.configuration, facts.projectName].filter(Boolean).join(" in ");

    return {
        "@context": "https://schema.org",
        "@type": "RealEstateListing",
        "@id": `${canonicalUrl(url)}#listing`,
        name: toText(name),
        url: canonicalUrl(url),
        ...(description ? { description: toText(description) } : {}),
        ...(images.length ? { image: images.slice(0, 8).map((src) => absoluteUrl(src)) } : {}),
        about: {
            "@type": "Accommodation",
            ...(accommodationName ? { name: accommodationName } : {}),
            ...(facts.bhk ? { numberOfRooms: facts.bhk } : {}),
            ...(facts.area
                ? { floorSize: { "@type": "QuantitativeValue", value: facts.area, unitCode: "FTK" } }
                : {}),
            ...(facts.location
                ? {
                      address: {
                          "@type": "PostalAddress",
                          addressLocality:
                              facts.location.locality ||
                              facts.location.region ||
                              facts.location.district ||
                              facts.location.city ||
                              "",
                          addressRegion: facts.location.state || "",
                          addressCountry: "IN",
                      },
                  }
                : {}),
        },
        ...(facts.price
            ? {
                  offers: {
                      "@type": "Offer",
                      price: facts.price,
                      priceCurrency: "INR",
                      availability: schemaAvailability(facts.availability),
                      url: canonicalUrl(url),
                  },
              }
            : {}),
    };
}

/** @param {{q: string, a: string}[]} faq */
export function faqSchema(faq) {
    const items = (faq || []).filter((entry) => entry && entry.q && entry.a);
    if (!items.length) return null;
    return {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: items.map((entry) => ({
            "@type": "Question",
            name: toText(entry.q),
            acceptedAnswer: { "@type": "Answer", text: toText(entry.a) },
        })),
    };
}

/** Price range helper re-exported so schema consumers use one wording. */
export const schemaPriceRange = priceRangeLabel;
