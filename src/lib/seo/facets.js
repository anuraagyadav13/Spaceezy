/**
 * Landing-page (hub) generator.
 *
 * Hubs are DERIVED from the facets that exist in the database — location,
 * property type, BHK, villa configuration — never hand-written per city.
 * Adding a project in a new locality automatically creates:
 *
 *   /properties-in-{location}        all types
 *   /flats-in-{location}             residential
 *   /plots-in-{location}             plots
 *   /commercial-property-{location}  commercial
 *   /{n}-bhk-flats-in-{location}     one per BHK actually present
 *   /villas-in-{location}            when villa units exist
 *
 * plus the site-wide category hubs. Each hub carries its own indexability
 * decision (inventory threshold + unique data blocks), which drives robots,
 * the sitemap and internal navigation.
 */

import {
    joinList,
    pluralize,
    priceRangeLabel,
    slugify,
    toNumber,
    toText,
} from "./text";
import { configurationNames, parseBhk } from "./facts";
import aliasConfig from "../../../seo-aliases.json";

const int = (value, fallback) => {
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
};

export const HUB_THRESHOLDS = Object.freeze({
    /** Minimum projects + units for a hub to be indexable. */
    minItems: int(process.env.SEO_HUB_MIN_ITEMS, 1),
    /** Minimum data-derived content blocks a hub must render. */
    minBlocks: int(process.env.SEO_HUB_MIN_BLOCKS, 2),
});

/** Units often have no explicit `type` — infer it from real fields only. */
export function classifyUnitType(item) {
    if (item?.type) return item.type;
    const hay = `${item?.configuration || ""} ${item?.title || ""}`;
    if (toNumber(item?.bhk) > 0 || /\bbhk\b/i.test(hay)) return "Residential";
    if (/\bplot\b/i.test(hay)) return "Plot";
    if (/\b(shop|office|commercial|retail|showroom|godown|warehouse)\b/i.test(hay)) return "Commercial";
    return null;
}

const normalizePlaceName = (value) => toText(value).toLowerCase();

const PLACE_KINDS = [
    {
        key: "all",
        slug: (place) => `properties-in-${place.slug}`,
        h1: (place) => `Properties in ${place.name}`,
        filters: {},
    },
    {
        key: "flats",
        slug: (place) => `flats-in-${place.slug}`,
        h1: (place) => `Flats in ${place.name}`,
        filters: { type: "Residential", excludeVilla: true },
    },
    {
        key: "plots",
        slug: (place) => `plots-in-${place.slug}`,
        h1: (place) => `Plots in ${place.name}`,
        filters: { type: "Plot" },
    },
    {
        key: "commercial",
        slug: (place) => `commercial-property-in-${place.slug}`,
        h1: (place) => `Commercial Property in ${place.name}`,
        filters: { type: "Commercial" },
    },
    {
        key: "villas",
        slug: (place) => `villas-in-${place.slug}`,
        h1: (place) => `Villas in ${place.name}`,
        filters: { type: "Residential", villaOnly: true },
    },
];

export const GLOBAL_HUBS = [
    {
        slug: "flats-for-sale",
        h1: "Flats for Sale",
        filters: { type: "Residential", excludeVilla: true },
        parent: { name: "Properties", href: "/properties" },
    },
    {
        slug: "plots-for-sale",
        h1: "Plots for Sale",
        filters: { type: "Plot" },
        parent: { name: "Properties", href: "/properties" },
    },
    {
        slug: "commercial-properties",
        h1: "Commercial Properties",
        filters: { type: "Commercial" },
        parent: { name: "Properties", href: "/properties" },
    },
    {
        slug: "residential-properties",
        h1: "Residential Properties",
        filters: { type: "Residential" },
        parent: { name: "Properties", href: "/properties" },
    },
];

/**
 * Retired synonym URLs that must permanently redirect to their canonical hub.
 * The rows live in `/seo-aliases.json` so `next.config.ts` (edge redirects) and
 * this module (runtime resolution) can never drift apart. Adding an alias is a
 * data change, not a code change.
 */
const ALIAS_ROWS = Array.isArray(aliasConfig?.legacyAliases) ? aliasConfig.legacyAliases : [];

export const LEGACY_ALIAS_PATTERNS = Object.freeze(
    ALIAS_ROWS.map((row) => ({ source: row.source, destination: row.destination }))
);

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Compile "/flats-for-sale-in-:location" into a matcher + destination builder. */
function compileAlias({ source, destination }) {
    const names = [];
    const regexSource = source
        .split(/(:[A-Za-z0-9_]+)/g)
        .map((chunk) => {
            const token = /^:([A-Za-z0-9_]+)$/.exec(chunk);
            if (!token) return escapeRegex(chunk);
            names.push(token[1]);
            return "([^/]+)";
        })
        .join("");

    return {
        regex: new RegExp(`^${regexSource}$`),
        build: (values) =>
            destination.replace(/:([A-Za-z0-9_]+)/g, (_, name) => {
                const index = names.indexOf(name);
                return index === -1 ? "" : values[index];
            }),
    };
}

const LEGACY_RESOLVERS = LEGACY_ALIAS_PATTERNS.map(compileAlias);

/** Canonical slug for a retired synonym, or null. */
export function resolveLegacySlug(slug) {
    const value = `/${toText(slug).toLowerCase().replace(/^\/+/, "")}`;
    for (const resolver of LEGACY_RESOLVERS) {
        const match = resolver.regex.exec(value);
        if (match) return resolver.build(match.slice(1)).replace(/^\//, "");
    }
    return null;
}

/**
 * Places are collected at every level that exists (region, district, city) so
 * a district hub like `/properties-in-{district}` keeps working even when its
 * projects also belong to a more specific region. One project can therefore
 * appear under a locality hub and under its parent district hub — that is the
 * intended hierarchy, not duplicate content.
 */
export function collectPlaces(inventory) {
    const map = new Map();

    const addLevel = (level, name, parent, state) => {
        const label = toText(name);
        if (!label) return;
        const slug = slugify(label);
        if (!slug) return;
        const existing = map.get(slug);
        // Region wins over district, district over city, for a shared slug.
        const rank = { region: 3, district: 2, city: 1 };
        if (!existing || rank[level] > rank[existing.level]) {
            map.set(slug, { level, name: label, parent: parent || "", state: state || "", slug, label: "" });
        }
    };

    const add = (location) => {
        if (!location) return;
        addLevel("region", location.region, location.district || location.city, location.state);
        addLevel("district", location.district, location.state, location.state);
        addLevel("city", location.city, location.state, location.state);
    };

    for (const project of inventory.projects || []) add(project.location);
    for (const unit of inventory.properties || []) add(unit.location);

    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
}

function matchesPlace(location, place) {
    if (!place) return true;
    if (!location) return false;
    const name = normalizePlaceName(place.name);
    if (place.level === "region") return normalizePlaceName(location.region) === name;
    if (place.level === "district") {
        return normalizePlaceName(location.district) === name || normalizePlaceName(location.city) === name;
    }
    return normalizePlaceName(location.city) === name;
}

function typeMatches(type, wanted) {
    if (!wanted) return true;
    if (!type) return false;
    if (type === wanted) return true;
    // Mixed-use projects serve both residential and commercial intents.
    return type === "Mixed_Use";
}

const itemConfigurationNames = (item, isProject) => {
    if (isProject) return configurationNames(item.configurations);
    return [item.configuration].map(toText).filter(Boolean);
};

const isVillaItem = (item, isProject) =>
    itemConfigurationNames(item, isProject).some((name) => /\bvillas?\b/i.test(name));

function matchesFilters(item, isProject, filters = {}) {
    if (filters.type) {
        const type = isProject ? item.projectType : item.type || classifyUnitType(item);
        if (filters.type === "Plot") {
            if (isProject && type !== "Plot") return false;
            if (!isProject && classifyUnitType(item) !== "Plot") return false;
        } else if (!typeMatches(type, filters.type)) {
            return false;
        }
    }
    if (filters.villaOnly && !isVillaItem(item, isProject)) return false;
    if (filters.excludeVilla && isVillaItem(item, isProject)) return false;
    if (filters.bhk) {
        const hasBhk = isProject
            ? configurationNames(item.configurations).some((name) => parseBhk(name) === filters.bhk)
            : toNumber(item.bhk) === filters.bhk;
        if (!hasBhk) return false;
    }
    return true;
}

export function filterHub({ projects = [], properties = [] }, { place = null, filters = {} } = {}) {
    return {
        projects: projects.filter(
            (project) => matchesPlace(project.location, place) && matchesFilters(project, true, filters)
        ),
        properties: properties.filter(
            (unit) => matchesPlace(unit.location, place) && matchesFilters(unit, false, filters)
        ),
    };
}

const positiveNumbers = (values) => values.map(toNumber).filter((n) => n !== null && n > 0);

/** Data-derived content blocks. Every sentence states a fact from the payload. */
export function buildHubBlocks(hub) {
    const { projects, properties, place } = hub;
    const located = place?.name ? ` in ${place.name}` : "";
    const blocks = [];

    if (projects.length || properties.length) {
        const parts = [];
        if (projects.length) parts.push(`${projects.length} ${pluralize(projects.length, "project")}`);
        if (properties.length) parts.push(`${properties.length} ${pluralize(properties.length, "unit")}`);
        blocks.push(`Spaceezy has ${joinList(parts, "and")} published${located}.`);
    }

    const prices = positiveNumbers([
        ...projects.flatMap((project) => [project.startingPrice, project.maximumPrice]),
        ...properties.map((unit) => unit.price),
    ]).sort((a, b) => a - b);

    if (prices.length) {
        const range = priceRangeLabel(prices[0], prices[prices.length - 1]);
        if (range) blocks.push(`Published prices${located} range from ${range}.`);
    }

    const configurationSet = new Set();
    for (const project of projects) {
        for (const name of configurationNames(project.configurations)) configurationSet.add(name);
    }
    for (const unit of properties) {
        const label = toText(unit.configuration) || (toNumber(unit.bhk) ? `${unit.bhk} BHK` : "");
        if (label) configurationSet.add(label);
    }
    if (configurationSet.size) {
        blocks.push(`Configurations available${located}: ${joinList(Array.from(configurationSet).slice(0, 6))}.`);
    }

    const availableUnits = properties.filter((unit) => unit.availability === "Available").length;
    const reservedUnits = properties.filter((unit) => unit.availability === "Limited Availability").length;
    if (availableUnits || reservedUnits) {
        const parts = [];
        if (availableUnits) parts.push(`${availableUnits} available now`);
        if (reservedUnits) parts.push(`${reservedUnits} reserved`);
        blocks.push(`Unit status${located}: ${joinList(parts, "and")}.`);
    }

    return blocks;
}

function latestTimestamp(items) {
    let latest = null;
    for (const item of items) {
        const value = item?.updatedAt || item?.lastModified;
        if (!value) continue;
        const time = new Date(value).getTime();
        if (!Number.isFinite(time)) continue;
        if (!latest || time > latest) latest = time;
    }
    return latest ? new Date(latest).toISOString() : null;
}

function hubBreadcrumbs(hub, registry) {
    const crumbs = [{ name: "Home", href: "/" }];
    if (hub.place) {
        const allSlug = `properties-in-${hub.place.slug}`;
        const allHub = registry?.get(allSlug);
        if (hub.kind !== "all" && allHub && allHub.indexable) {
            crumbs.push({ name: allHub.h1, href: allHub.path });
        }
        crumbs.push({ name: hub.h1, href: null });
        return crumbs;
    }
    if (hub.parent) crumbs.push({ name: hub.parent.name, href: hub.parent.href });
    crumbs.push({ name: hub.h1, href: null });
    return crumbs;
}

function relatedSlugs(hub, registry) {
    const candidates = [];
    if (hub.place) {
        for (const spec of PLACE_KINDS) {
            if (spec.key === hub.kind) continue;
            candidates.push(spec.slug(hub.place));
        }
        if (hub.bhk) {
            for (const n of hub.siblingBhks || []) candidates.push(`${n}-bhk-flats-in-${hub.place.slug}`);
        }
    } else {
        for (const other of GLOBAL_HUBS) if (other.slug !== hub.slug) candidates.push(other.slug);
        for (const place of registry?.places || []) candidates.push(`properties-in-${place.slug}`);
    }

    return candidates.filter((slug) => {
        const other = registry.get(slug);
        return other && other.indexable && other.slug !== hub.slug;
    });
}

const TYPE_SPECIFICITY = Object.freeze({
    bhk: 5,
    villas: 4,
    flats: 3,
    plots: 3,
    commercial: 3,
    category: 2,
    all: 1,
});

const PLACE_SPECIFICITY = Object.freeze({ region: 3, district: 2, city: 1 });

/**
 * Two hubs with the same project/unit set are duplicate search intents. Keep
 * the most specific one indexable and canonicalise the rest to it.
 *
 * Tie-break, in order:
 *   1. location specificity: region > district > city > global category;
 *   2. facet specificity: BHK > villa > flat/plot/commercial > type-only > all;
 *   3. more data-derived blocks;
 *   4. lexicographically smaller path (deterministic).
 */
function dedupeIdenticalItems(hubs) {
    const groups = new Map();
    for (const hub of hubs) {
        // Empty hubs are already noindex via the inventory threshold; grouping
        // them would give a nonsensical canonical to an unrelated place.
        if (!hub.counts || hub.counts.total < 1) continue;
        const signature = JSON.stringify([
            ...(hub.projects || []).map((project) => `p:${project.slug}`).sort(),
            ...(hub.properties || []).map((unit) => `u:${unit.token}`).sort(),
        ]);
        if (!groups.has(signature)) groups.set(signature, []);
        groups.get(signature).push(hub);
    }

    const score = (hub) =>
        (PLACE_SPECIFICITY[hub.place?.level] || 0) * 10 +
        (TYPE_SPECIFICITY[hub.kind] || 1);

    for (const group of groups.values()) {
        if (group.length < 2) continue;
        const ranked = [...group].sort(
            (a, b) =>
                score(b) - score(a) ||
                b.blocks.length - a.blocks.length ||
                a.path.localeCompare(b.path)
        );
        const [winner, ...duplicates] = ranked;
        winner.duplicateGroupSize = group.length;
        for (const hub of duplicates) {
            hub.indexable = false;
            hub.duplicateOf = winner.path;
            hub.canonicalPath = winner.path;
        }
    }
}

/** Build the complete hub registry from live inventory. */
export function buildHubRegistry(inventory) {
    const projects = inventory.projects || [];
    const properties = inventory.properties || [];
    const places = collectPlaces({ projects, properties });

    const hubs = [];
    const bhkByPlace = new Map();

    for (const place of places) {
        const residential = filterHub(
            { projects, properties },
            { place, filters: { type: "Residential" } }
        );
        const bhks = new Set();
        for (const project of residential.projects) {
            for (const name of configurationNames(project.configurations)) {
                const n = parseBhk(name);
                if (n) bhks.add(n);
            }
        }
        for (const unit of residential.properties) {
            const n = toNumber(unit.bhk);
            if (n) bhks.add(n);
        }
        bhkByPlace.set(place.slug, Array.from(bhks).sort((a, b) => a - b));
    }

    const push = (hub) => {
        const filtered = filterHub({ projects, properties }, hub);
        const blocks = buildHubBlocks({ ...hub, ...filtered });
        const total = filtered.projects.length + filtered.properties.length;
        const indexable = total >= HUB_THRESHOLDS.minItems && blocks.length >= HUB_THRESHOLDS.minBlocks;
        const lastModified = latestTimestamp([...filtered.projects, ...filtered.properties]);

        hubs.push({
            ...hub,
            ...filtered,
            counts: { projects: filtered.projects.length, properties: filtered.properties.length, total },
            blocks,
            description: blocks[0] || "",
            metaDescription: joinList(blocks.slice(0, 2)) || "",
            indexable,
            lastModified,
        });
    };

    for (const place of places) {
        for (const spec of PLACE_KINDS) {
            push({
                slug: spec.slug(place),
                path: `/${spec.slug(place)}`,
                h1: spec.h1(place),
                kind: spec.key,
                place,
                filters: spec.filters,
            });
        }
        for (const bhk of bhkByPlace.get(place.slug) || []) {
            const slug = `${bhk}-bhk-flats-in-${place.slug}`;
            push({
                slug,
                path: `/${slug}`,
                h1: `${bhk} BHK Flats in ${place.name}`,
                kind: "bhk",
                bhk,
                place,
                siblingBhks: bhkByPlace.get(place.slug) || [],
                filters: { type: "Residential", bhk },
            });
        }
    }

    for (const spec of GLOBAL_HUBS) {
        push({
            slug: spec.slug,
            path: `/${spec.slug}`,
            h1: spec.h1,
            kind: "category",
            parent: spec.parent,
            place: null,
            filters: spec.filters,
        });
    }

    dedupeIdenticalItems(hubs);

    const registry = new Map(hubs.map((hub) => [hub.slug, hub]));
    registry.places = places;

    for (const hub of hubs) {
        hub.breadcrumbs = hubBreadcrumbs(hub, registry);
        hub.related = relatedSlugs(hub, registry).map((slug) => {
            const target = registry.get(slug);
            return { href: target.path, label: target.h1 };
        });
    }

    return registry;
}

/** Resolve a URL slug to a hub, following legacy synonyms to their target. */
export function resolveHubSlug(registry, slug) {
    const direct = registry.get(toText(slug).toLowerCase());
    if (direct) return { hub: direct, redirectTo: null };
    const canonical = resolveLegacySlug(slug);
    if (canonical && registry.has(canonical)) {
        return { hub: registry.get(canonical), redirectTo: `/${canonical}` };
    }
    return { hub: null, redirectTo: null };
}

/** Only indexable hubs are exposed in navigation and the sitemap. */
export function indexableHubs(registry) {
    return Array.from(registry.values()).filter((hub) => hub.indexable);
}

export function navHubs(registry) {
    const hubs = indexableHubs(registry);
    return {
        locations: hubs
            .filter((hub) => hub.place)
            .sort((a, b) => b.counts.total - a.counts.total)
            .slice(0, 8)
            .map((hub) => ({ href: hub.path, label: hub.h1 })),
        categories: GLOBAL_HUBS.map((spec) => registry.get(spec.slug))
            .filter((hub) => hub && hub.indexable)
            .map((hub) => ({ href: hub.path, label: hub.h1 })),
    };
}
