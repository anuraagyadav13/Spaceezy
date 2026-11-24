# SEO system rollout — PR summary, redirect plan, rollback

Branch: `seo/systemic-layer` (from `main` at `ff3df8e`).
Status: **implemented and verified locally; not deployed, no production data or
migrations changed.** A PR should be opened for review before merge/deploy.

## What changed

- Replaced 16 hand-written landing folders with one data-driven route
  (`/[hubSlug]`) and a shared template. Hub URLs, copy, counts, metadata,
  breadcrumbs, schema, navigation and sitemap rows are generated from the
  public API inventory. No project/locality/builder/price literal remains in
  page templates or config.
- Added a central metadata builder used by every route: one canonical origin
  from `NEXT_PUBLIC_SITE_URL` (HTTPS only), unique titles ≤ 60 chars and
  descriptions 120–155 chars, OG/Twitter mirrors, robots from the gate.
- Added a per-page and per-hub quality gate. Incomplete records stay 200 but
  `noindex`, leave the sitemap and navigation, and surface as CRM warnings.
- Sitemap/robots are generated from data with real `lastModified` from the
  record, no build-time stamps, no `changefreq`/`priority`, no utility or
  filtered URLs. Noindex utility pages stay crawlable in robots.txt so Google
  can see their noindex; only private routes and filter params are disallowed.
- Duplicate-intent hubs (identical item sets) collapse to the most specific
  location+type hub (optionally overridden by an empty-by-default
  `seo-hub-preferences.json`); the rest are out of nav/sitemap and canonicalise
  to the winner **without noindex**.
- One JSON-LD generator per schema type (Organization/RealEstateAgent,
  WebPage, BreadcrumbList, ItemList, project/unit types, FAQPage). Only
  visible/data-backed facts are marked up.
- Data-driven internal links with real `<a href>`: hubs link down/sideways,
  detail pages link up/sideways; ≥3 crawlable links to projects; breadcrumbs
  match schema.
- Images moved to `next/image` (AVIF/WebP, `sizes`, `priority` for LCP,
  data-derived alt), with a `/media` rewrite to the API origin so private
  CRM photos can be optimized.
- Retired URL patterns are redirected from one alias file; removed projects
  get a one-line redirect map to their location hub; sold units permanently
  redirect to the parent project; trailing-slash and http→https rules emit
  one permanent redirect.
- Backend: shared publish warnings, a hard block for unit prices below the
  project minimum, controlled configuration labels with a dry-run normaliser,
  extra fields in public DTOs, and a `/media` allow-list that only streams
  images attached to published listings (no Prisma migration needed).
- Utility pages (`/search`, `/enquiry`) are noindex, out of the sitemap and
  sitewide nav, with `rel="nofollow"` on remaining conversion links. Filter/sort
  URLs are not noindex — they canonicalise to the clean path and stay disallowed
  in robots.txt.
- Tooling/tests: 28 SEO unit tests plus crawl, audit, redirect-gate and
  IndexNow scripts; CRM publish-check and media allow-list tests; CI-friendly
  E2E script updates.

## Verification (local)

| Check | Result |
| --- | --- |
| `npx vitest run` | 5 files, 83 tests passed (28 SEO system tests) |
| backend `npm test -- --runInBand` | 50 suites, 983 tests passed |
| `npm run lint` | 0 errors (49 pre-existing warnings) |
| `npm run build` | succeeded, `/[hubSlug]` present |
| `npm run seo:crawl` against built site | 14 sitemap URLs, 14 pages crawled, 17 link targets, 0 errors/warnings |
| `npm run seo:redirects` | alias expansions pass, including a canonical-only duplicate hub; injected bad destination fails the gate (exit 1) |
| `npm run seo:audit` | local fixture project noindex; production report below is the deploy baseline |
| `e2e\verify-seo.ps1` against built site | 203 passed, 0 failed (static-route precedence, unknown-slug 404, utility noindex/no-follow, filter canonical-only, crawlable noindex utility pages) |
| `npm run seo:indexnow` with no key | safe no-op |

Crawl was run against `http://localhost:3000` after a fresh build; the crawler
maps canonical sitemap origins to the test server so it never silently crawls
production.

## Production-data impact (read-only)

The SSH path to the server is still blocked, so instead of a DB dump the audit
used the **production public API and sitemap over GET only**
(`npx vite-node scripts/seo-production-audit.mjs`, `SEO_AUDIT_API=https://spaceezy.com/api/v1`).
No data was changed.

Source: 3 published projects, 1 published unit, 19 currently indexed URLs.
With the current default gate (after adding `expectedCompletionDate` as a valid
possession signal):

| Verdict | Count | URLs / reason |
| --- | --- | --- |
| KEEP | 10 | static pages + 2 hubs + 1 unit + Eligo project |
| REDIRECT (intended) | 2 | `/flats-for-sale-in-wave-city`, `/property-for-sale-in-wave-city` |
| CANONICAL (no noindex) | 5 | duplicate-intent hubs, canonicalised to the winner (listed below) |
| NOINDEX | 2 | `dream-homes-e84e51` (possession, 1 image), `grand-carnesia-e215b6` (0 configurations, 1 image, 0-char description) |

With the duplicate-intent rule, 5 currently ranking hubs canonicalise to the
winning hub (crawlable and indexable, out of sitemap/nav, **no noindex**):

| Suppressed hub | Canonical winner |
| --- | --- |
| `/properties-in-ghaziabad` | `/flats-in-ghaziabad` |
| `/flats-for-sale` | `/flats-in-ghaziabad` |
| `/residential-properties` | `/flats-in-ghaziabad` |
| `/properties-in-wave-city` | `/3-bhk-flats-in-wave-city` |
| `/flats-in-wave-city` | `/3-bhk-flats-in-wave-city` |

Surviving hubs have 1–4 items and 2–4 blocks, above the 1/2 thresholds; empty
hubs have 0/0 and are excluded.

### Threshold proposal

| Setting | Default | Proposed | Numbers behind it |
| --- | --- | --- | --- |
| `SEO_HUB_MIN_ITEMS` | 1 | **1 (keep)** | smallest live hub has 1 item; empty hubs have 0 |
| `SEO_HUB_MIN_BLOCKS` | 2 | **2 (keep)** | smallest live hub has 2 blocks; empty hubs have 0 |
| `SEO_MIN_DESCRIPTION_CHARS` | 300 | **300 (keep)** | Dream Homes 1623, Eligo 1138 pass; Grand Carnesia 0 fails |
| `SEO_MIN_GALLERY_IMAGES` | 3 | **1** | Eligo 3, Dream Homes 1, Grand Carnesia 1 — 3 would hide a ranking page with a 1623-char description and 47 amenities |
| `SEO_MIN_AMENITIES` | 1 | **1 (keep)** | all three projects have 25–55 amenities |
| `SEO_REQUIRE_RERA` | true | **true (keep)** | all three projects have a RERA number |
| `SEO_REQUIRE_POSSESSION` | true | **false** | only Eligo has a date; Dream Homes has none but strong content; Grand Carnesia still fails on description/configurations |
| code change (already in branch) | `possessionDate` only | accept `expectedCompletionDate` too | Eligo has `expectedCompletionDate` populated and `possessionDate: null` |

Result with the proposal: **11 KEEP, 5 CANONICAL, 2 intended REDIRECT,
1 NOINDEX** (Grand Carnesia only). Thin/empty pages remain excluded because the
description, configuration, RERA and amenity gates are unchanged.
`seo-hub-preferences.json` is empty — no manual preference was applied.

### Structured-data validator (before → after)

`node scripts/seo-schema-report.mjs` against each origin; `@type` inventory:

| Page type | Before (production) | After (branch) |
| --- | --- | --- |
| Home | RealEstateAgent, Organization, WebSite | unchanged |
| Projects list | BreadcrumbList, Organization, WebSite | + ItemList |
| Properties list | Organization, WebSite | + BreadcrumbList, ItemList |
| Hub | BreadcrumbList, WebPage, ItemList, FAQPage, Organization, WebSite | FAQPage removed (no visible FAQ on hubs) |
| Project detail | BreadcrumbList, FAQPage, Organization, WebSite | + ApartmentComplex (project facts in schema) |
| Property detail | BreadcrumbList, Residence, Organization, WebSite | Residence → RealEstateListing |
| Search / Enquiry | Organization, WebSite | unchanged (no fabricated schema) |

### Rich Results Test (branch build, CODE input)

Google Rich Results Test cannot fetch `localhost`, so the JSON-LD blocks from
the built branch pages were pasted into the tool's CODE tab (re-run after the
canonical-only change):

| Page | Result | Errors | Warnings | Detected |
| --- | --- | --- | --- | --- |
| `/2-bhk-flats-in-andheri-west` (hub) | 3 valid items detected | 0 | 0 | Breadcrumbs (1 valid), Local businesses (1 valid), Organization (1 valid) |
| `/projects/aurora-heights-fc88b8` (project) | 3 valid items detected | 0 | 0 | Breadcrumbs (1 valid), Local businesses (1 valid), Organization (1 valid) |

An earlier run reported `Missing field "itemListElement"` on Breadcrumbs: the
`WebPage.breadcrumb` `@id` pointed at a page-specific URL while the emitted
`BreadcrumbList` used a global `#breadcrumb` `@id`. `breadcrumbSchema()` now
accepts the page path so both IDs match, and a unit test asserts that equality.
`ApartmentComplex` and `FAQPage` are valid schema.org types but have no Google
rich-result preview, so they do not appear in the "Detected" list — no errors.

## Migration / redirect plan (for merge + deploy)

1. Merge the PR to `main`; **no database migration is required**. Deploy the
   backend image first (new DTO fields and publish validation), then the Next
   image. Both containers should use the same `SEO_*` env values.
2. Set `NEXT_PUBLIC_SITE_URL=https://spaceezy.com` in `.env.production` (plus
   business NAP overrides if needed). Use the proposed rollout values from the
   production-data section (`SEO_MIN_GALLERY_IMAGES=1`,
   `SEO_REQUIRE_POSSESSION=false`; all other gates at their defaults), then
   tighten once content is completed. `npm run seo:audit` lists what is left.
3. Existing URLs stay live. Retired shapes already redirect in one hop:
   - `/flats-for-sale-in-{place}` → `/flats-in-{place}`
   - `/property-for-sale-in-{place}` → `/properties-in-{place}`
   - trailing-slash variants → slashless canonical
   - http → https (single hop)
4. When a project is deleted from the CRM, add its slug and destination hub to
   `seo-retired-projects.json` in the same change.
5. Run configuration-label normalisation with the dry run first:
   `node backend/scripts/normalize-configuration-labels.js` (add `--apply`
   only after reviewing the output). This changes labels only, never prices.
6. After deploy: `npm run seo:crawl` against the production origin,
   `npm run seo:audit`, then `npm run seo:indexnow` once an IndexNow key is
   hosted (otherwise it is a no-op). Submit the sitemap in Search Console.

## Rollback plan

- **Application rollback:** redeploy the previous image/tag for backend and
  frontend. No schema change means no database rollback is needed.
- **Gate too strict:** set `SEO_REQUIRE_RERA=false`,
  `SEO_REQUIRE_POSSESSION=false`, lower `SEO_MIN_DESCRIPTION_CHARS`,
  `SEO_MIN_GALLERY_IMAGES`, `SEO_MIN_AMENITIES`, `SEO_HUB_MIN_ITEMS` and
  `SEO_HUB_MIN_BLOCKS` in the env and restart, without a code deploy.
- **Redirect problem:** remove the offending row from `seo-aliases.json` or
  `seo-retired-projects.json` and redeploy; every redirect is data-driven.
- **Canonical/origin problem:** correct `NEXT_PUBLIC_SITE_URL` and restart;
  no template contains a hard-coded domain.
- **Data normalisation:** the normaliser has a `--dry-run` default; if a bad
  `--apply` happens, restore the affected labels from the pre-run output log
  (it prints before/after values) — no other fields are touched.

## Not complete / needs a human

1. **Deploy credentials.** Production deploy of the website CRM is still
   blocked: SSH key rejected at `3.7.59.115`, timeouts at `13.235.68.163` and
   `3.6.26.222`; AWS CLI credentials are invalid. Need working SSH access or a
   deployment pipeline before any of the above reaches production.
2. **Data completion.** The read-only production audit reports one published
   project below the content gate: `grand-carnesia-e215b6` (0 configurations,
   0-char description, 1 image). A content editor should complete those fields;
   the page is intentionally noindex until then. The local dev database is a
   different fixture set (Aurora Heights) and is not the production baseline.
3. **Mobile LCP before/after report.** Image work is in place, but a real
   mobile Lighthouse run at 360–430px was not possible in this environment
   (the browser tool needs a visible desktop window). Someone with Chrome
   DevTools must record before/after numbers on the deployed URL; target
   LCP < 2.5 s.
4. **IndexNow key.** `scripts/indexnow.mjs` is ready, but an IndexNow key and
   its hosted `https://<host>/<key>.txt` file must be provided by ops.
5. **PR creation.** `gh` CLI is unavailable, so the PR was not opened by a tool.
   The branch is pushed; open
   `https://github.com/anuraagyadav13/Spaceezy/pull/new/seo/systemic-layer`
   and paste this document as the PR description.
6. **Search Console monitoring.** No access to the property was available;
   someone must watch coverage/URL-inspection after release.
