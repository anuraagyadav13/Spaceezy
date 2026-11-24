# SEO system — architecture and operations

This document describes the data-driven SEO layer of the public Spaceezy website.
It replaces the old system of 16 hand-written landing folders. **No project,
locality, builder, price or phone number is hard-coded in page templates or
config** — those values come only from the public API, seed data, test fixtures
or the deployment-level business profile (`src/config/business.js`).

## 1. Sources of truth

| Concern | Single source |
| --- | --- |
| Canonical origin | `NEXT_PUBLIC_SITE_URL` → `src/lib/seo/site.js` (forced to HTTPS) |
| Brand / NAP | `src/config/business.js` (env-overridable; see §5) |
| Published inventory | `GET /api/v1/public/projects`, `/public/properties` (60 s ISR cache in `src/lib/seo/inventory.js`) |
| Hub URLs, counts, blocks, indexability | `src/lib/seo/facets.js` → `buildHubRegistry()` |
| Page title / description / robots | `src/lib/seo/metadata.js` → `buildMetadata()` and its composers |
| Quality gate | `src/lib/seo/quality.js` (shared by metadata, sitemap, admin warnings) |
| Sitemap / robots | `src/lib/seo/sitemap.js`, `src/app/sitemap.js`, `src/app/robots.js` |
| JSON-LD | `src/lib/seo/schema.js` (one generator per schema type) |
| Retired URL aliases | `seo-aliases.json` (read by both `next.config.ts` and `facets.js`) |
| Removed-project redirects | `seo-retired-projects.json` (read by `next.config.ts` and the project route) |
| Price / configuration / availability wording | `src/lib/seo/facts.js` |

No page composes its own title/description object. Every indexable page calls
`buildMetadata`, which enforces: absolute HTTPS canonical, title ≤ 60 chars,
description 120–155 chars truncated at a word boundary, OG/Twitter mirrors,
and robots directives derived from the gate.

## 2. URL model

One URL per search intent:

- `/properties-in-{location}` — all property types in a place
- `/flats-in-{location}`, `/plots-in-{location}`,
  `/commercial-property-in-{location}`, `/villas-in-{location}`
- `/{n}-bhk-flats-in-{location}` — only for BHKs that actually exist in the data
- Global category hubs: `/flats-for-sale`, `/plots-for-sale`,
  `/commercial-properties`, `/residential-properties`
- Detail pages: `/projects/{publicSlug}`, `/properties/{opaqueToken}`

Places are collected from **every** level present in the CRM data (region,
district, city), so a district hub keeps working even when its projects also
belong to a more specific region. When two levels produce the same slug, the
more specific level (region > district > city) wins.

### Retired URLs

`seo-aliases.json` maps old patterns to the surviving hub:

```
/flats-for-sale-in-:location       -> /flats-in-:location
/property-for-sale-in-:location    -> /properties-in-:location
```

`next.config.ts` turns each row into a permanent redirect (301/308 depending on
the Next.js version), and `facets.js` resolves the same rows at runtime for
`next start` edge cases. Retired URLs are never generated in nav or sitemap.
To retire another URL, add one row to that JSON file — no handler code.

When a project is deleted from the CRM, add its slug and destination location
hub to `seo-retired-projects.json` so its old URL permanently redirects instead
of becoming a soft 404. The list is empty today.

### Canonical rules

- `NEXT_PUBLIC_SITE_URL` is the only origin; http values are upgraded to https.
- Trailing slash is disabled (`trailingSlash: false`); Next permanently
  redirects slash variants to the canonical form.
- `/search`, `/enquiry`, private routes and all filter permutations
  (`?sort=`, `?page=`, `?minPrice=`, `?bhk=`, …) are `noindex,follow` with a
  canonical to the clean path and are disallowed in `robots.txt`.
- `http://` requests forwarded with `x-forwarded-proto: http` get one permanent
  redirect to the HTTPS origin (single hop).

## 3. Indexability gates

A page can be rendered and still be `noindex`; in that case it is omitted from
the sitemap and from navigation. This is deliberate — thin or incomplete
records must not be indexed, must not be auto-filled, and must not generate
filler copy.

**Hub** — indexable when it has at least `SEO_HUB_MIN_ITEMS` (default 1)
projects+units **and** at least `SEO_HUB_MIN_BLOCKS` (default 2) data-derived
blocks (counts, price range, configurations, availability status). Empty
categories answer 200 with honest empty-state copy and `noindex`.

**Project** — requires a public slug, name, location, at least one
configuration, a price range; by default also possession date, RERA number,
≥ `SEO_MIN_AMENITIES` (1) amenities, ≥ `SEO_MIN_GALLERY_IMAGES` (3) photos and
a description ≥ `SEO_MIN_DESCRIPTION_CHARS` (300) characters.

**Unit** — requires a token, title, price, configuration/BHK, area, location
and at least one photo. Sold units are always `noindex` and permanently
redirect to their parent project.

The backend surfaces the same rules in the CRM as publish warnings
(`backend/src/utils/seoPublishCheck.js`); a unit price below the project
minimum is rejected outright. Run `npm run seo:audit` to list published
records that are currently noindex and need data completion.

## 4. Lifecycle

| Event | Behaviour |
| --- | --- |
| New project / unit published | Appears in inventory within 60 s; new place/configuration creates its hubs automatically; pages get metadata, schema, nav links and sitemap rows. |
| Record fails the gate | Page renders with `noindex`; excluded from sitemap and nav; admin warning lists the missing fields. |
| Unit sold | Page returns a permanent redirect to the parent project (or `/properties`); no sitemap row. |
| Unit reserved | Stays indexable with its status shown. |
| Project removed / inactive | Permanently redirect to its location hub (`/properties-in-{location}`) and drop from sitemap. |
| Location disappears from inventory | Its hubs stop being generated; nav and sitemap update on the next ISR cycle. |

## 5. Environment variables

| Variable | Purpose | Default |
| --- | --- | --- |
| `NEXT_PUBLIC_SITE_URL` | Canonical origin, HTTPS enforced | `https://spaceezy.com` |
| `NEXT_PUBLIC_BUSINESS_*` | Name, legal name, tagline, description, email, phone, WhatsApp, logo, OG image, street/locality/region/postcode/country, served city/region | see `src/config/business.js` |
| `API_URL` / `NEXT_PUBLIC_API_URL` | Public API base URL | `http://localhost:8000/api/v1` |
| `MEDIA_ORIGIN` | Origin serving `/media/*` for the image optimizer | derived from `API_URL` |
| `SEO_MIN_DESCRIPTION_CHARS` | Project description gate | `300` |
| `SEO_MIN_GALLERY_IMAGES` | Project gallery gate | `3` |
| `SEO_MIN_AMENITIES` | Project amenities gate | `1` |
| `SEO_REQUIRE_RERA` | Require RERA number for indexing | `true` |
| `SEO_REQUIRE_POSSESSION` | Require possession date for indexing | `true` |
| `SEO_HUB_MIN_ITEMS` | Minimum inventory per indexable hub | `1` |
| `SEO_HUB_MIN_BLOCKS` | Minimum data blocks per indexable hub | `2` |
| `INDEXNOW_KEY` / `INDEXNOW_KEY_LOCATION` | IndexNow key and its hosted URL (optional) | unset → ping is a no-op |

The defaults deliberately err on the side of not indexing incomplete pages.
For a staged roll-out on an old catalogue, set `SEO_REQUIRE_RERA=false` /
`SEO_REQUIRE_POSSESSION=false` (or lower the `SEO_MIN_*` values), run
`npm run seo:audit`, then tighten them as data is completed. No code change is
needed.

## 6. Internal linking, schema and images

- Hubs link down to matching projects/units and sideways to sibling hubs;
  detail pages link up to location/project hubs and sideways to related
  inventory. Project pages always emit at least three crawlable internal links
  when matching inventory exists.
- Breadcrumbs are real `<a href>` links on the page and mirror the
  `BreadcrumbList` JSON-LD. Only content visible on the page is described in
  schema (`Organization`/`RealEstateAgent`, `WebPage`, `ItemList`,
  `ApartmentComplex`/`Place`, `RealEstateListing`, `FAQPage`).
- Images use `next/image` with `fill`, `sizes`, data-derived `alt`, `priority`
  on LCP images, and AVIF/WebP output. `/media/*` is rewritten to the API
  origin so the optimizer can fetch private-bucket photos; absolute URLs are
  served unoptimized.

## 7. Commands

```bash
npx vitest run                 # all unit tests (incl. 24 SEO system tests)
npm run lint                   # 0 errors
npm run build                  # production build
npm start                      # serve the built site on :3000

npm run seo:test               # SEO unit tests only
npm run seo:crawl              # crawl a running site (SEO_BASE_URL=…)
npm run seo:audit              # published-but-noindex inventory report
npm run seo:audit -- --strict  # fail CI if any published record is noindex
npm run seo:redirects          # FAIL if a redirect target is noindex/non-200
npm run seo:indexnow           # notify IndexNow (no-op without a key)

# Read-only impact report against the production public API (no deploy/DB writes):
npx vite-node scripts/seo-production-audit.mjs
# JSON-LD @type inventory for before/after comparisons:
SEO_BASE_URL=https://spaceezy.com node scripts/seo-schema-report.mjs
powershell -ExecutionPolicy Bypass -File e2e\verify-seo.ps1
```

`npm run seo:crawl` checks sitemap↔canonical agreement, unique
titles/descriptions, one H1, crawlable internal links (no `http://`, no
redirect chains > 1 hop), ≥3 inbound links per project, JSON-LD validity and
noindex exclusions. `npm run seo:redirects` is the build/release gate: it
expands every alias pattern against the places that actually exist and fails
if a source is not a single permanent hop or its destination is not a 200,
canonical, indexable sitemap URL. `E2E_SITE_ORIGIN` overrides the expected
canonical domain in the PowerShell E2E script; `E2E_WEB_BASE` / `E2E_API_BASE`
override the server addresses.

`/media/*` is allow-listed against images referenced by published projects
and units (`backend/src/utils/publicMedia.js`, 60 s cache). CRM-only drafts,
archived-listing photos and orphan uploads answer 404 even if the object
exists in the private bucket. `backend/tests/media-published-only.test.js`
covers that guarantee.

Utility pages (`/search`, `/enquiry`) are noindex, absent from the sitemap,
removed from sitewide nav/footer, and all remaining links to them carry
`rel="nofollow"`; conversion paths stay usable without passing link equity.


## 8. Adding content

For CRM steps (no code changes needed) see
[`SEO_ADD_PROJECT_LOCATION.md`](./SEO_ADD_PROJECT_LOCATION.md). For the rollout,
redirect and rollback plans see [`SEO_ROLLOUT_PLAN.md`](./SEO_ROLLOUT_PLAN.md).
