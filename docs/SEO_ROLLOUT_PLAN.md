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
  and extra fields in public DTOs (no Prisma migration needed).
- Tooling/tests: 25 SEO unit tests plus crawl, audit and IndexNow scripts;
  CRM publish-check tests; CI-friendly E2E script updates.

## Verification (local)

| Check | Result |
| --- | --- |
| `npx vitest run` | 5 files, 80 tests passed (25 SEO system tests) |
| backend `npm test -- --runInBand` | 49 suites, 978 tests passed |
| `npm run lint` | 0 errors (49 pre-existing warnings) |
| `npm run build` | succeeded, `/[hubSlug]` present |
| `npm run seo:crawl` against built site | 21 sitemap URLs, 21 pages crawled, 12 link targets, 0 errors/warnings |
| `npm run seo:audit` | 1 published project currently noindex (see below) |
| `e2e\verify-seo.ps1` against built site | 195 passed, 0 failed |
| Redirect spot-check | retired aliases and trailing slash → 308 to canonical hub |
| `npm run seo:indexnow` with no key | safe no-op |

Crawl was run against `http://localhost:3000` after a fresh build; the crawler
maps canonical sitemap origins to the test server so it never silently crawls
production.

## Migration / redirect plan (for merge + deploy)

1. Merge the PR to `main`; **no database migration is required**. Deploy the
   backend image first (new DTO fields and publish validation), then the Next
   image. Both containers should use the same `SEO_*` env values.
2. Set `NEXT_PUBLIC_SITE_URL=https://spaceezy.com` in `.env.production` (plus
   business NAP overrides if needed). Keep the default gate initially; if the
   back-catalogue is incomplete, stage it with `SEO_REQUIRE_RERA=false` and
   `SEO_REQUIRE_POSSESSION=false`, then tighten after `npm run seo:audit`.
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
