/**
 * SEO system tests — synthetic fixtures only.
 *
 * A brand-new location, a brand-new project and a configuration that has never
 * existed before are pushed through the generators with no code changes. The
 * tests assert the systemic promises:
 *
 *   - the new project gets hubs, metadata, canonical, schema and sitemap rows;
 *   - an empty category is noindex, absent from nav/sitemap;
 *   - every indexable page has a unique title and description;
 *   - canonicals, sitemap URLs and internal links agree;
 *   - retired synonyms resolve to one canonical URL in a single hop;
 *   - price/config/availability come from one facts function.
 */

import { describe, it, expect } from "vitest";

import {
    configurationNames,
    parseBhk,
    projectFacts,
    unitFacts,
} from "./facts";
import {
    buildHubRegistry,
    indexableHubs,
    navHubs,
    resolveLegacySlug,
    resolveHubSlug,
    LEGACY_ALIAS_PATTERNS,
    HUB_THRESHOLDS,
    HUB_PREFERENCES,
} from "./facets";
import { buildSitemapEntries, NEVER_INDEXABLE_PREFIXES } from "./sitemap";
import {
    buildMetadata,
    projectMetadata,
    unitMetadata,
    hubMetadata,
    TITLE_MAX,
    DESCRIPTION_MIN,
    DESCRIPTION_MAX,
} from "./metadata";
import { staticPageMetadata, STATIC_PAGE_SEO } from "./staticPages";
import { projectSchema, unitSchema, breadcrumbSchema, itemListSchema, webPageSchema } from "./schema";
import { canonicalPath, canonicalUrl, SITE_URL } from "./site";
import { truncateAtWord, compactPrice } from "./text";
import { projectQuality } from "./quality";
import { retiredProjectPath } from "./retired";

// ---------------------------------------------------------------------------
// Fixtures: a location, a project and a configuration that do not exist today.
// ---------------------------------------------------------------------------

const NEW_LOCATION = {
    region: "Testville Enclave",
    district: "Testpur",
    state: "Teststate",
    locality: "Testville Enclave",
    city: "Testpur",
};

const LONG_DESCRIPTION =
    "A synthetic project description used only by the automated SEO tests. It is deliberately longer than " +
    "three hundred characters so the content-quality gate can be satisfied without inventing marketing copy: " +
    "the sentences describe the fields that actually exist in the fixture data (location, configurations, " +
    "price range, availability, amenities and possession) and nothing else at all.";

const NEW_PROJECT = {
    slug: "testville-heights",
    name: "Testville Heights",
    projectType: "Residential",
    status: "UNDER_CONSTRUCTION",
    developer: "Fixture Developers",
    location: NEW_LOCATION,
    locationLabel: "Testville Enclave, Testpur, Teststate",
    address: "Plot 1, Testville Enclave",
    description: LONG_DESCRIPTION,
    descriptionLength: LONG_DESCRIPTION.length,
    images: [
        "https://cdn.example.test/testville-1.jpg",
        "https://cdn.example.test/testville-2.jpg",
        "https://cdn.example.test/testville-3.jpg",
    ],
    imageCount: 3,
    amenities: ["Gymnasium", "Children's Play Area"],
    amenitiesCount: 2,
    startingPrice: 6120000,
    maximumPrice: 9120000,
    possessionDate: "2028-03-31T00:00:00.000Z",
    rera: { number: "UPRERATEST0001", authority: "UP RERA" },
    availability: { totalUnits: 12, availableUnits: 9, reservedUnits: 2, soldUnits: 1 },
    configurations: ["3 BHK", "5 BHK"],
    updatedAt: "2026-11-01T10:00:00.000Z",
};

const NEW_UNIT = {
    token: "test-token-0001",
    title: "5 BHK Residence in Testville Heights",
    configuration: "5 BHK",
    bhk: 5,
    type: "Residential",
    purpose: "Sale",
    area: 2840,
    price: 9120000,
    availability: "Available",
    image: "https://cdn.example.test/unit-1.jpg",
    images: ["https://cdn.example.test/unit-1.jpg", "https://cdn.example.test/unit-2.jpg"],
    imageCount: 2,
    location: NEW_LOCATION,
    locationLabel: "Testville Enclave, Testpur, Teststate",
    project: { name: NEW_PROJECT.name, slug: NEW_PROJECT.slug },
    updatedAt: "2026-11-02T09:30:00.000Z",
};

const EMPTY_PROJECT = {
    ...NEW_PROJECT,
    slug: "empty-category-project",
    name: "Empty Category Project",
    // A type that no other project in the fixture inventory uses.
    projectType: "Warehouse_Test",
    configurations: ["Warehouse"],
    location: { ...NEW_LOCATION, region: "Emptyville", district: "Testpur" },
    locationLabel: "Emptyville, Testpur, Teststate",
};

const INVENTORY = {
    locations: [],
    projects: [NEW_PROJECT, EMPTY_PROJECT],
    properties: [NEW_UNIT],
};

// Deliberately small inventory: every hub resolves to the SAME single item.
const DEDUPE_LOCATION = {
    region: "Twinville",
    district: "Twindistrict",
    state: "Teststate",
    locality: "Twinville",
    city: "Twindistrict",
};
const DEDUPE_PROJECT = {
    ...NEW_PROJECT,
    slug: "twinville-one",
    name: "Twinville One",
    projectType: "Residential",
    configurations: ["2 BHK"],
    location: DEDUPE_LOCATION,
    locationLabel: "Twinville, Twindistrict, Teststate",
    startingPrice: 5000000,
    maximumPrice: 5000000,
    rera: { number: "TEST-DUPE-1", authority: "Test RERA" },
};
const DEDUPE_INVENTORY = { projects: [DEDUPE_PROJECT], properties: [] };

// ---------------------------------------------------------------------------
// Facts: one source of truth for price/config/availability
// ---------------------------------------------------------------------------

describe("facts", () => {
    it("normalises both list and detail configuration shapes", () => {
        expect(configurationNames(["3 BHK", "5 BHK"])).toEqual(["3 BHK", "5 BHK"]);
        expect(
            configurationNames([{ name: "3 BHK", bhk: 3 }, { name: "5 BHK", bhk: 5 }])
        ).toEqual(["3 BHK", "5 BHK"]);
    });

    it("parses BHK from real labels only", () => {
        expect(parseBhk("5 BHK")).toBe(5);
        expect(parseBhk("1.5 BHK")).toBe(1.5);
        expect(parseBhk("Penthouse")).toBe(null);
    });

    it("derives identical prices from list and detail DTOs", () => {
        const listFacts = projectFacts({
            ...NEW_PROJECT,
            configurations: ["3 BHK", "5 BHK"],
            availability: undefined,
            totalUnits: 12,
            availableUnits: 9,
        });
        const detailFacts = projectFacts({
            ...NEW_PROJECT,
            configurations: [
                { name: "3 BHK", bhk: 3, priceMin: 6120000, priceMax: 6120000 },
                { name: "5 BHK", bhk: 5, priceMin: 9120000, priceMax: 9120000 },
            ],
        });

        expect(listFacts.priceMin).toBe(detailFacts.priceMin);
        expect(listFacts.priceMax).toBe(detailFacts.priceMax);
        expect(listFacts.bhk).toEqual([3, 5]);
        expect(listFacts.availableUnits).toBe(9);
    });

    it("marks a sold unit through the shared unit facts", () => {
        expect(unitFacts({ ...NEW_UNIT, availability: "Sold" }).isSold).toBe(true);
        expect(unitFacts(NEW_UNIT).isSold).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// Metadata: length, uniqueness, canonical
// ---------------------------------------------------------------------------

describe("metadata", () => {
    it("truncates on word boundaries and never exceeds the cap", () => {
        const text = truncateAtWord("alpha beta gamma delta", 12);
        expect(text.length).toBeLessThanOrEqual(12);
        expect(text.endsWith("gamma") || text.endsWith("beta")).toBe(true);
    });

    it("bodies live page descriptions inside 120-155 characters", () => {
        const registry = buildHubRegistry(INVENTORY);
        const pages = [
            buildMetadata({ path: "/", title: "Home", description: "x".repeat(400) }),
            projectMetadata(NEW_PROJECT),
            unitMetadata(NEW_UNIT),
            ...indexableHubs(registry).map((hub) => hubMetadata(hub)),
            ...Object.entries(STATIC_PAGE_SEO)
                .filter(([, entry]) => entry.indexable)
                .map(([path]) => staticPageMetadata(path)),
        ];

        for (const page of pages) {
            expect(page.description.length).toBeGreaterThanOrEqual(DESCRIPTION_MIN);
            expect(page.description.length).toBeLessThanOrEqual(DESCRIPTION_MAX);
        }
    });

    it("builds a project page with canonical, unique-ish title and live facts", () => {
        const meta = projectMetadata(NEW_PROJECT);

        expect(meta.alternates.canonical).toBe(canonicalUrl(`/projects/${NEW_PROJECT.slug}`));
        expect(meta.title.length).toBeLessThanOrEqual(TITLE_MAX);
        expect(meta.description.length).toBeLessThanOrEqual(DESCRIPTION_MAX);
        expect(meta.description).toContain("Testville Heights");
        expect(meta.seo.quality.ok).toBe(true);
        expect(meta.openGraph.url).toBe(meta.alternates.canonical);
    });

    it("emits noindex for a project that fails the content gate", () => {
        const meta = projectMetadata({
            ...NEW_PROJECT,
            description: "Too short.",
            descriptionLength: 10,
            images: [],
            imageCount: 0,
        });
        expect(meta.robots.index).toBe(false);
        expect(meta.seo.quality.ok).toBe(false);
    });

    it("emits noindex for a sold unit", () => {
        expect(unitMetadata({ ...NEW_UNIT, availability: "Sold" }).robots.index).toBe(false);
    });

    it("keeps every indexable page's title and description unique", () => {
        const registry = buildHubRegistry(INVENTORY);

        const pages = [
            buildMetadata({ path: "/", title: "Spaceezy | Premium Real Estate", description: "Home page description for the uniqueness check." }),
            ...Object.keys(STATIC_PAGE_SEO).map((path) => staticPageMetadata(path)),
            ...indexableHubs(registry).map((hub) => hubMetadata(hub)),
            projectMetadata(NEW_PROJECT),
            projectMetadata({ ...EMPTY_PROJECT }),
            unitMetadata(NEW_UNIT),
        ];

        const titles = pages.map((page) => page.title);
        const descriptions = pages.map((page) => page.description);

        expect(new Set(titles).size).toBe(titles.length);
        expect(new Set(descriptions).size).toBe(descriptions.length);
    });

    it("uses one canonical origin for every absolute URL", () => {
        expect(SITE_URL.startsWith("https://")).toBe(true);
        expect(canonicalUrl("/projects/x/").startsWith(`${SITE_URL}/projects/x`)).toBe(true);
        expect(canonicalPath("//projects//x/?page=2#top")).toBe("/projects/x");
    });
});

// ---------------------------------------------------------------------------
// Hubs: generated from facets, indexable only when the data supports it
// ---------------------------------------------------------------------------

describe("hub generation", () => {
    const registry = buildHubRegistry(INVENTORY);

    it("creates hubs for a brand-new location and a brand-new BHK", () => {
        expect(registry.has("properties-in-testville-enclave")).toBe(true);
        expect(registry.has("flats-in-testville-enclave")).toBe(true);
        expect(registry.has("5-bhk-flats-in-testville-enclave")).toBe(true);
    });

    it("uses one URL per intent and keeps the retired synonyms out of the registry", () => {
        expect(registry.has("flats-for-sale-in-testville-enclave")).toBe(false);
        expect(registry.has("property-for-sale-in-testville-enclave")).toBe(false);
        const hrefs = indexableHubs(registry).map((hub) => hub.path);
        expect(hrefs.some((path) => path.startsWith("/flats-for-sale-in-"))).toBe(false);
        expect(hrefs.some((path) => path.startsWith("/property-for-sale-in-"))).toBe(false);
    });

    it("makes an empty category noindex and hides it from navigation", () => {
        const empties = Array.from(registry.values()).filter((hub) => hub.counts.total === 0);
        expect(empties.length).toBeGreaterThan(0);
        for (const hub of empties) {
            expect(hub.indexable).toBe(false);
            expect(hubMetadata(hub).robots.index).toBe(false);
        }

        const nav = navHubs(registry);
        const navHrefs = [...nav.locations, ...nav.categories].map((item) => item.href);
        for (const hub of empties) {
            expect(navHrefs).not.toContain(hub.path);
        }
    });

    it("builds hub copy only from data blocks", () => {
        const hub = registry.get("properties-in-testville-enclave");
        expect(hub.blocks.length).toBeGreaterThanOrEqual(HUB_THRESHOLDS.minBlocks);
        // Configurations are named only because the fixture data has them.
        expect(hub.blocks.join(" ")).toContain("3 BHK and 5 BHK");
        // No configuration claim that the data does not contain.
        const outside = registry.get("properties-in-emptyville");
        expect(outside.blocks.join(" ")).not.toContain("5 BHK");
    });

    it("gives every project at least three crawlable internal links", () => {
        const containing = indexableHubs(registry).filter((hub) =>
            [...hub.projects, ...hub.properties].some(
                (item) => item.slug === NEW_PROJECT.slug || item.token === NEW_UNIT.token
            )
        );
        const reverseLinks = [
            { href: "/projects", label: "Projects index" },
            { href: "/properties", label: "Properties index" },
            ...containing.map((hub) => ({ href: hub.path, label: hub.h1 })),
            ...(registry.get("properties-in-testville-enclave")?.related || []),
        ];
        expect(reverseLinks.length).toBeGreaterThanOrEqual(3);
        expect(new Set(reverseLinks.map((link) => link.href)).size).toBeGreaterThanOrEqual(3);
    });
});

// ---------------------------------------------------------------------------
// Sitemap and redirects
// ---------------------------------------------------------------------------

describe("sitemap", () => {
    it("includes the new indexable pages with real lastmod", () => {
        const registry = buildHubRegistry(INVENTORY);
        const entries = buildSitemapEntries({ inventory: INVENTORY, registry });
        const urls = entries.map((entry) => entry.url);

        expect(urls).toContain(canonicalUrl(`/projects/${NEW_PROJECT.slug}`));
        expect(urls).toContain(canonicalUrl(`/properties/${NEW_UNIT.token}`));
        // The properties/all-types hub has the same item set as the 5 BHK
        // hub; the BHK hub wins, so that is the indexable sitemap row.
        expect(urls).toContain(canonicalUrl("/5-bhk-flats-in-testville-enclave"));

        const projectEntry = entries.find((entry) => entry.url === canonicalUrl(`/projects/${NEW_PROJECT.slug}`));
        expect(projectEntry.lastModified).toBe(new Date(NEW_PROJECT.updatedAt).toISOString());
    });

    it("never includes noindex, sold, inactive or utility URLs", () => {
        const registry = buildHubRegistry(INVENTORY);
        const entries = buildSitemapEntries({
            inventory: {
                ...INVENTORY,
                projects: [
                    ...INVENTORY.projects,
                    { ...NEW_PROJECT, slug: "inactive-project", status: "INACTIVE" },
                    { ...NEW_PROJECT, slug: "thin-project", descriptionLength: 12, images: [], imageCount: 0 },
                ],
                properties: [
                    ...INVENTORY.properties,
                    { ...NEW_UNIT, token: "sold-token", availability: "Sold" },
                ],
            },
            registry,
        });
        const urls = entries.map((entry) => entry.url);

        expect(urls).not.toContain(canonicalUrl("/projects/inactive-project"));
        expect(urls).not.toContain(canonicalUrl("/projects/thin-project"));
        expect(urls).not.toContain(canonicalUrl("/properties/sold-token"));
        for (const entry of entries) {
            expect(NEVER_INDEXABLE_PREFIXES.some((prefix) => new URL(entry.url).pathname.startsWith(prefix))).toBe(false);
            expect(entry.url.startsWith("https://")).toBe(true);
        }
    });

    it("agrees with the canonical URL of every indexable page", () => {
        const registry = buildHubRegistry(INVENTORY);
        const entries = buildSitemapEntries({ inventory: INVENTORY, registry });
        for (const entry of entries) {
            const path = new URL(entry.url).pathname;
            expect(entry.url).toBe(canonicalUrl(path));
        }
    });
});

describe("retired URL aliases", () => {
    it("resolves every alias to a canonical slug in a single hop", () => {
        expect(LEGACY_ALIAS_PATTERNS.length).toBeGreaterThan(0);
        for (const alias of LEGACY_ALIAS_PATTERNS) {
            const sourceSlug = alias.source.replace(/^\//, "").replace(":location", "testville-enclave");
            const target = resolveLegacySlug(sourceSlug);
            expect(target).toBeTruthy();
            // The target itself is not another alias: exactly one redirect.
            expect(resolveLegacySlug(target)).toBe(null);
        }
    });

    it("returns the hub and a redirect target for a legacy slug", () => {
        const registry = buildHubRegistry(INVENTORY);
        const result = resolveHubSlug(registry, "flats-for-sale-in-testville-enclave");
        expect(result.redirectTo).toBe("/flats-in-testville-enclave");
        expect(result.hub.slug).toBe("flats-in-testville-enclave");
    });

    it("leaves active projects alone (retired-project map is empty)", () => {
        expect(retiredProjectPath(NEW_PROJECT.slug)).toBe(null);
    });
});

// ---------------------------------------------------------------------------
// Structured data
// ---------------------------------------------------------------------------

describe("structured data", () => {
    it("validates the shape of every generator output", () => {
        const facts = projectFacts(NEW_PROJECT);
        const project = projectSchema({
            facts,
            images: NEW_PROJECT.images,
            url: `/projects/${NEW_PROJECT.slug}`,
            description: NEW_PROJECT.description,
            amenities: NEW_PROJECT.amenities,
        });
        const unit = unitSchema({
            facts: unitFacts(NEW_UNIT),
            images: NEW_UNIT.images,
            url: `/properties/${NEW_UNIT.token}`,
            description: LONG_DESCRIPTION,
        });
        const breadcrumb = breadcrumbSchema([
            { name: "Home", href: "/" },
            { name: "Projects", href: "/projects" },
            { name: NEW_PROJECT.name, href: `/projects/${NEW_PROJECT.slug}` },
        ], `/projects/${NEW_PROJECT.slug}`);
        const webPage = webPageSchema({
            url: `/projects/${NEW_PROJECT.slug}`,
            name: NEW_PROJECT.name,
            breadcrumbUrl: `/projects/${NEW_PROJECT.slug}`,
        });
        const itemList = itemListSchema({
            name: "Projects in Testville Enclave",
            url: "/properties-in-testville-enclave",
            items: [{ name: NEW_PROJECT.name, url: `/projects/${NEW_PROJECT.slug}`, price: facts.priceMin }],
        });

        for (const schema of [project, unit, breadcrumb, itemList]) {
            expect(schema["@context"]).toBe("https://schema.org");
            expect(typeof schema["@type"]).toBe("string");
        }
        expect(project["@type"]).toBe("ApartmentComplex");
        expect(project.offers.lowPrice).toBe(NEW_PROJECT.startingPrice);
        expect(project.identifier).toBe("UPRERATEST0001");
        expect(unit["@type"]).toBe("RealEstateListing");
        expect(unit.offers.price).toBe(NEW_UNIT.price);
        // Google resolves the WebPage breadcrumb reference by @id; it must be
        // the same list emitted on the page, not a global #breadcrumb node.
        expect(breadcrumb["@id"]).toBe(webPage.breadcrumb["@id"]);
        // Only visible/real values are marked up.
        expect(JSON.stringify(project)).not.toContain("aggregateRating");
    });

    it("keeps JSON-LD prices identical to the page facts", () => {
        const facts = projectFacts(NEW_PROJECT);
        const schema = projectSchema({ facts, url: `/projects/${NEW_PROJECT.slug}` });
        expect(schema.offers.lowPrice).toBe(facts.priceMin);
        expect(schema.offers.highPrice).toBe(facts.priceMax);
        expect(compactPrice(facts.priceMin)).toBeTruthy();
    });
});

// ---------------------------------------------------------------------------
// Content-quality gate
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Duplicate-intent hubs: identical item sets must not compete with each other.
// ---------------------------------------------------------------------------

describe("duplicate hub intents", () => {
    it("uses no manual preferences in the default rollout", () => {
        expect(HUB_PREFERENCES).toEqual([]);
    });

    it("keeps the most specific hub and canonicalises/removes the rest", () => {
        const registry = buildHubRegistry(DEDUPE_INVENTORY);
        const entries = buildSitemapEntries({ inventory: DEDUPE_INVENTORY, registry });
        const sitemapPaths = entries.map((entry) => new URL(entry.url).pathname);
        const nav = navHubs(registry);
        const navHrefs = [...nav.locations, ...nav.categories].map((item) => item.href);

        const group = ["properties-in-twinville", "flats-in-twinville", "2-bhk-flats-in-twinville"];
        for (const slug of group) expect(registry.has(slug)).toBe(true);

        // Region + BHK is the most specific location+type combination.
        const winner = registry.get("2-bhk-flats-in-twinville");
        expect(winner.indexable).toBe(true);
        expect(winner.canonicalPath).toBeUndefined();
        expect(sitemapPaths).toContain(winner.path);

        for (const slug of group.filter((value) => value !== winner.slug)) {
            const loser = registry.get(slug);
            // Canonical-only: crawlable/indexable robots, no noindex.
            expect(loser.indexable).toBe(true);
            expect(loser.canonicalPath).toBe(winner.path);
            expect(loser.duplicateOf).toBe(winner.path);
            expect(hubMetadata(loser).robots.index).not.toBe(false);
            expect(hubMetadata(loser).alternates.canonical).toBe(canonicalUrl(winner.path));
            expect(sitemapPaths).not.toContain(loser.path);
            expect(navHrefs).not.toContain(loser.path);
        }

        // Global category hubs with the same item set lose to the location+BHK hub too.
        for (const slug of ["flats-for-sale", "residential-properties"]) {
            const global = registry.get(slug);
            expect(global.indexable).toBe(true);
            expect(global.canonicalPath).toBeTruthy();
            expect(sitemapPaths).not.toContain(global.path);
            expect(navHrefs).not.toContain(global.path);
        }
    });
});

// ---------------------------------------------------------------------------
// Full fixture: a never-before-seen location/project/configuration, plus an
// empty category. No code, template or config change is involved.
// ---------------------------------------------------------------------------

describe("full synthetic fixture", () => {
    it("propagates a new project everywhere and suppresses an empty category", () => {
        const registry = buildHubRegistry(INVENTORY);
        const entries = buildSitemapEntries({ inventory: INVENTORY, registry });
        const urls = entries.map((entry) => entry.url);

        // 1. New location + new BHK produce indexable hubs. The BHK hub is
        // the most specific intent when several hubs share the item set.
        const hub = registry.get("5-bhk-flats-in-testville-enclave");
        expect(hub).toBeTruthy();
        expect(hub.indexable).toBe(true);
        expect(hub.path).toBe("/5-bhk-flats-in-testville-enclave");
        expect(registry.has("properties-in-testville-enclave")).toBe(true);

        // 2. Project page metadata: canonical + HTTPS + title/description.
        const meta = projectMetadata(NEW_PROJECT);
        expect(meta.alternates.canonical).toBe(canonicalUrl(`/projects/${NEW_PROJECT.slug}`));
        expect(meta.alternates.canonical.startsWith("https://")).toBe(true);
        expect(meta.robots.index).toBe(true);
        expect(hubMetadata(hub).alternates.canonical).toBe(canonicalUrl(hub.path));

        // 3. Schema uses exactly the same facts as the page.
        const facts = projectFacts(NEW_PROJECT);
        const schema = projectSchema({
            facts,
            images: NEW_PROJECT.images,
            url: `/projects/${NEW_PROJECT.slug}`,
            description: NEW_PROJECT.description,
            amenities: NEW_PROJECT.amenities,
        });
        expect(schema.offers.lowPrice).toBe(facts.priceMin);
        expect(schema.offers.highPrice).toBe(facts.priceMax);
        expect(meta.description).toContain(compactPrice(facts.priceMin));
        expect(hub.blocks.join(" ")).toContain(compactPrice(facts.priceMin));

        // 4. Sitemap row with the record's own timestamp.
        expect(urls).toContain(canonicalUrl(`/projects/${NEW_PROJECT.slug}`));
        expect(urls).toContain(canonicalUrl(`/properties/${NEW_UNIT.token}`));
        expect(urls).toContain(canonicalUrl(hub.path));
        expect(entries.find((e) => e.url === canonicalUrl(`/projects/${NEW_PROJECT.slug}`)).lastModified)
            .toBe(new Date(NEW_PROJECT.updatedAt).toISOString());

        // 5. At least three distinct crawlable links point at the project.
        const containing = indexableHubs(registry).filter((h) =>
            [...h.projects, ...h.properties].some((item) => item.slug === NEW_PROJECT.slug || item.token === NEW_UNIT.token)
        );
        const inbound = new Set([
            "/projects",
            "/properties",
            ...containing.map((h) => h.path),
            ...(hub.related || []).map((l) => l.href),
        ]);
        expect(inbound.size).toBeGreaterThanOrEqual(3);

        // 6. Empty category: noindex, hidden from nav, absent from sitemap.
        const emptyHub = registry.get("plots-in-testville-enclave");
        expect(emptyHub).toBeTruthy();
        expect(emptyHub.counts.total).toBe(0);
        expect(emptyHub.indexable).toBe(false);
        expect(hubMetadata(emptyHub).robots.index).toBe(false);
        const nav = navHubs(registry);
        expect([...nav.locations, ...nav.categories].map((i) => i.href)).not.toContain(emptyHub.path);
        expect(urls).not.toContain(canonicalUrl(emptyHub.path));
    });
});

describe("quality gate", () => {
    it("requires location, configuration, price, possession, RERA, images, amenities and description", () => {
        expect(projectQuality(NEW_PROJECT).ok).toBe(true);

        const result = projectQuality({
            ...NEW_PROJECT,
            location: null,
            locationLabel: "",
            configurations: [],
            startingPrice: null,
            maximumPrice: null,
            possessionDate: null,
            rera: { number: null },
            amenities: [],
            images: [],
            imageCount: 0,
            description: "",
            descriptionLength: 0,
        });

        expect(result.ok).toBe(false);
        expect(result.missing).toEqual(
            expect.arrayContaining([
                "location (region/district/city)",
                "unit configurations",
                "price range",
                "possession date",
                "RERA number",
                "amenities",
                "page description",
            ])
        );
    });
});
