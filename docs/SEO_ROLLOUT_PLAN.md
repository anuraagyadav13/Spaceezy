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
  filtered URLs; chunking is ready for >45k URLs.
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
  sitewide nav, with `rel="nofollow"` on remaining conversion links.
- Tooling/tests: 26 SEO unit tests plus crawl, audit, redirect-gate and
  IndexNow scripts; CRM publish-check and media allow-list tests; CI-friendly
  E2E script updates.

## Verification (local)

| Check | Result |
| --- | --- |
| `npx vitest run` | 5 files, 81 tests passed (26 SEO system tests) |
| backend `npm test -- --runInBand` | 50 suites, 983 tests passed |
| `npm run lint` | 0 errors (49 pre-existing warnings) |
| `npm run build` | succeeded, `/[hubSlug]` present |
| `npm run seo:crawl` against built site | 21 sitemap URLs, 21 pages crawled, 11 link targets, 0 errors/warnings |
| `npm run seo:redirects` | 4 alias expansions pass; injected bad destination fails the gate (exit 1) |
| `npm run seo:audit` | 1 published project currently noindex (see below) |
| `e2e\verify-seo.ps1` against built site | 213 passed, 0 failed (incl. static-route precedence, unknown-slug 404, utility noindex/no-follow) |
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
| KEEP | 15 | static pages + 9 hubs + 1 unit + Eligo project |
| REDIRECT (intended) | 2 | `/flats-for-sale-in-wave-city`, `/property-for-sale-in-wave-city` |
| NOINDEX | 2 | `dream-homes-e84e51` (possession, 1 image), `grand-carnesia-e215b6` (0 configurations, 1 image, 0-char description) |

Every currently indexed **hub** stays indexable: item counts are 1–4 and data
blocks 2–4, above the defaults of 1 item / 2 blocks. All empty hubs have
0 items / 0 blocks and are excluded.

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

Result with the proposal: **16 KEEP, 2 intended REDIRECT, 1 NOINDEX**
(Grand Carnesia only). Thin/empty pages remain excluded because the
description, configuration, RERA and amenity gates are unchanged.

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
2. **Data completion.** `npm run seo:audit` reports 1 published project
   (Aurora Heights) below the gate: description 175 chars (< 300) and 2
   gallery images (< 3). A content editor should complete these fields; the
   page is intentionally noindex until then. Note also that the local backend
   process is a stale build, so the new DTO fields are not yet exposed there —
   restart/redeploy the backend to see the full warnings.
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
