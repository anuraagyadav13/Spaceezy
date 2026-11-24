/**
 * Titles/descriptions for the hand-written marketing pages.
 *
 * They live here (one place, one builder) so a page can never ship without a
 * canonical, an OG mirror and a unique title. Utility pages are noindex by
 * configuration, not by remembering to add a robots tag.
 */

import { buildMetadata } from "./metadata";

export const STATIC_PAGE_SEO = Object.freeze({
    "/projects": {
        title: "Real Estate Projects | Spaceezy",
        description:
            "Browse published real estate projects on Spaceezy with live pricing, configurations and unit availability. Compare projects by location and enquire directly.",
        indexable: true,
        breadcrumb: "Projects",
    },
    "/properties": {
        title: "Properties for Sale & Rent | Spaceezy",
        description:
            "Browse published flats, plots and commercial units on Spaceezy with live prices, carpet area and availability status. Enquire directly from any listing.",
        indexable: true,
        breadcrumb: "Properties",
    },
    "/search": {
        title: "Property Search | Spaceezy",
        description:
            "Search published projects and units by keyword, location, configuration and budget. Search result pages are not indexed; use the collection pages instead.",
        indexable: false,
        breadcrumb: "Search",
    },
    "/enquiry": {
        title: "Enquire | Spaceezy",
        description:
            "Send an enquiry or request a site visit for a Spaceezy project or unit. This form page is not indexed; browse the collection pages to explore listings.",
        indexable: false,
        breadcrumb: "Enquire",
    },
    "/about": {
        title: "About Spaceezy",
        description:
            "Who Spaceezy is, how the team publishes projects and units, and how live pricing and availability are maintained for every listing on the website.",
        indexable: true,
        breadcrumb: "About",
    },
    "/contact": {
        title: "Contact Spaceezy",
        description:
            "Contact the Spaceezy team for project details, pricing and site visits. Phone, WhatsApp, email and office address are listed on this page.",
        indexable: true,
        breadcrumb: "Contact",
    },
    "/privacy-policy": {
        title: "Privacy Policy | Spaceezy",
        description:
            "How Spaceezy collects, uses, stores and protects the personal data submitted through the website, enquiry forms, WhatsApp conversations and the CRM.",
        indexable: true,
        breadcrumb: "Privacy Policy",
    },
    "/terms": {
        title: "Terms of Service | Spaceezy",
        description:
            "The terms that apply to browsing Spaceezy listings, submitting enquiries and using the property information published on the website and in the CRM.",
        indexable: true,
        breadcrumb: "Terms of Service",
    },
});

export function staticPageMetadata(path) {
    const entry = STATIC_PAGE_SEO[path];
    if (!entry) {
        throw new Error(`No SEO configuration for static page "${path}"`);
    }
    return buildMetadata({
        path,
        title: entry.title,
        description: entry.description,
        indexable: entry.indexable,
    });
}
