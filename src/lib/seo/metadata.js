/**
 * Central metadata layer: one builder + one composer per page type.
 *
 * Every page (home, hub, project, unit, static) goes through `buildMetadata`,
 * which guarantees:
 *   - an absolute HTTPS canonical on every page,
 *   - a title of at most ~60 characters and a description of 120-155,
 *     truncated on word boundaries,
 *   - Open Graph / Twitter mirrors of the same values,
 *   - robots directives driven by the indexability rules.
 *
 * No page may hand-write a title/description object any more.
 */

import { BUSINESS } from "../../config/business";
import {
    SITE_NAME,
    SITE_TITLE_FALLBACK,
    SITE_DESCRIPTION,
    SITE_URL,
    canonicalUrl,
} from "./site";
import {
    compactPrice,
    composeDescription,
    joinList,
    pluralize,
    priceRangeLabel,
    toText,
    truncateAtWord,
} from "./text";
import { projectFacts, unitFacts } from "./facts";
import { projectQuality, unitQuality } from "./quality";

export const TITLE_MAX = 60;
export const DESCRIPTION_MIN = 120;
export const DESCRIPTION_MAX = 155;

const INDEXABLE_ROBOTS = {
    index: true,
    follow: true,
    googleBot: {
        index: true,
        follow: true,
        "max-image-preview": "large",
        "max-snippet": -1,
        "max-video-preview": -1,
    },
};

const NOINDEX_ROBOTS = { index: false, follow: true };

const absoluteImage = (image) => {
    try {
        return new URL(image || BUSINESS.ogImage, `${SITE_URL}/`).toString();
    } catch {
        return `${SITE_URL}/images/og-default.jpg`;
    }
};

/**
 * The single metadata builder used by every route.
 */
export function buildMetadata({
    path = "/",
    title,
    description,
    image = BUSINESS.ogImage,
    type = "website",
    indexable = true,
    publishedTime,
    modifiedTime,
}) {
    const canonical = canonicalUrl(path);
    const finalTitle = truncateAtWord(title || SITE_TITLE_FALLBACK, TITLE_MAX);
    const finalDescription = truncateAtWord(description || SITE_DESCRIPTION, DESCRIPTION_MAX);
    const imageUrl = absoluteImage(image);

    return {
        title: finalTitle,
        description: finalDescription,
        alternates: { canonical },
        robots: indexable ? INDEXABLE_ROBOTS : NOINDEX_ROBOTS,
        openGraph: {
            type,
            url: canonical,
            siteName: SITE_NAME,
            locale: "en_IN",
            title: finalTitle,
            description: finalDescription,
            images: [{ url: imageUrl, width: 1200, height: 630, alt: finalTitle }],
            ...(publishedTime ? { publishedTime } : {}),
            ...(modifiedTime ? { modifiedTime } : {}),
        },
        twitter: {
            card: "summary_large_image",
            title: finalTitle,
            description: finalDescription,
            images: [imageUrl],
        },
    };
}

/** Static pages opt into the same defaults, with no duplicated objects. */
export function staticMetadata({ path, title, description, indexable = true }) {
    return buildMetadata({ path, title, description, indexable });
}

export function homeMetadata() {
    return buildMetadata({
        path: "/",
        title: SITE_TITLE_FALLBACK,
        description: composeDescription({
            parts: [SITE_DESCRIPTION],
            filler: `Browse ${SITE_NAME} projects and units with live prices, configurations and availability.`,
            min: DESCRIPTION_MIN,
            max: DESCRIPTION_MAX,
        }),
    });
}

const FILLER = `${BUSINESS.name} lists published projects and units with current prices and availability.`;

export function projectMetadata(project) {
    const facts = projectFacts(project);
    const quality = projectQuality(project);
    const place = facts.locationLabel || placeLabel(facts.location);

    const baseTitle = place ? `${facts.name} in ${place}` : facts.name;
    const title = truncateAtWord(`${baseTitle} | ${SITE_NAME}`, TITLE_MAX);

    const description = composeDescription({
        max: DESCRIPTION_MAX,
        min: DESCRIPTION_MIN,
        filler: FILLER,
        parts: [
            `${facts.name}${facts.developer ? ` by ${facts.developer}` : ""}${place ? ` in ${place}` : ""}.`,
            facts.configurations.length
                ? `${joinList(facts.configurations)} available.`
                : "",
            priceRangeLabel(facts.priceMin, facts.priceMax)
                ? `Prices ${priceRangeLabel(facts.priceMin, facts.priceMax)}.`
                : "",
            facts.availabilityLabel ? `${facts.availabilityLabel}.` : "",
            facts.reraNumber ? `RERA ${facts.reraNumber}.` : "",
        ],
    });

    return {
        ...buildMetadata({
            path: `/projects/${facts.slug}`,
            title,
            description,
            image: projectImage(project),
            type: "article",
            indexable: quality.ok,
            modifiedTime: facts.updatedAt || undefined,
        }),
        // Exposed for the page's JSON-LD/breadcrumbs without a second fetch.
        seo: { facts, quality },
    };
}

export function unitMetadata(property) {
    const facts = unitFacts(property);
    const quality = unitQuality(property);
    const place = placeLabel(facts.location);

    const title = truncateAtWord(
        `${facts.title}${facts.projectName ? ` | ${facts.projectName}` : ""} | ${SITE_NAME}`,
        TITLE_MAX
    );

    const description = composeDescription({
        max: DESCRIPTION_MAX,
        min: DESCRIPTION_MIN,
        filler: FILLER,
        parts: [
            facts.title ? `${facts.title}.` : "",
            facts.projectName ? `In ${facts.projectName}${place ? `, ${place}` : ""}.` : place ? `In ${place}.` : "",
            facts.configuration ? `${facts.configuration}.` : "",
            facts.area ? `${facts.area} sq.ft.` : "",
            facts.price ? `Price ${compactPrice(facts.price)}.` : "",
            facts.availability ? `${facts.availability}.` : "",
        ],
    });

    return {
        ...buildMetadata({
            path: `/properties/${facts.token}`,
            title,
            description,
            image: unitImage(property),
            type: "article",
            indexable: quality.ok && !facts.isSold,
            modifiedTime: facts.updatedAt || undefined,
        }),
        seo: { facts, quality },
    };
}

export function hubMetadata(hub) {
    // The intent (h1) is always part of the description, so two hubs that
    // happen to share inventory counts can never share a meta description.
    const description = composeDescription({
        max: DESCRIPTION_MAX,
        min: DESCRIPTION_MIN,
        parts: [`${hub.h1}.`, ...(hub.blocks || [])],
        filler: `Browse ${hub.h1.toLowerCase()} on ${SITE_NAME} with live prices, configurations and availability.`,
    });

    return buildMetadata({
        path: hub.path,
        title: h1ToTitle(hub.h1),
        description,
        indexable: hub.indexable,
        modifiedTime: hub.lastModified || undefined,
    });
}

/** "<h1> | Spaceezy" truncated at a word boundary. */
export function h1ToTitle(h1) {
    const suffix = ` | ${SITE_NAME}`;
    const raw = toText(h1);
    const full = `${raw}${suffix}`;
    if (full.length <= TITLE_MAX) return full;
    return truncateAtWord(raw, TITLE_MAX - suffix.length) + suffix;
}

export function placeLabel(location) {
    if (!location) return "";
    return [location.region || location.locality, location.district || location.city, location.state]
        .filter(Boolean)
        .filter((value, index, list) => list.indexOf(value) === index)
        .join(", ");
}

export function projectImage(project) {
    const images = Array.isArray(project?.images) ? project.images : [];
    return project?.heroImage || project?.image || images[0] || BUSINESS.ogImage;
}

export function unitImage(property) {
    const images = Array.isArray(property?.images) ? property.images : [];
    return property?.image || images[0] || BUSINESS.ogImage;
}

/** Summary sentence used by hub pages and their meta descriptions. */
export function inventorySummary(hub) {
    const parts = [];
    if (hub.counts.projects) parts.push(`${hub.counts.projects} ${pluralize(hub.counts.projects, "project")}`);
    if (hub.counts.properties) parts.push(`${hub.counts.properties} ${pluralize(hub.counts.properties, "unit")}`);
    return parts.join(" and ");
}
