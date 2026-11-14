# Meta Ads — Phase 5: Creative Library, Ad Management & Previews

Status: **implemented and tested locally — NOT committed, NOT pushed, NOT deployed.** No
production change has been made. Every Meta API contract used in this phase was verified against
Facebook's published `.md` reference docs (Ads/Marketing API), and **all tests use mocked Graph
responses only** — no live Meta credentials exist in this workspace, so nothing here has been
verified against a real ad account.

Scope of this document: exactly what was built for Phase 5 (backend + frontend), the endpoints
added, the safety architecture, the calculations/limits, test results, and what remains
unverified. Phase 0–4 behavior (connection, credentials, lead sync, campaigns, ad sets,
audiences) is unchanged.

---

## 1. What was delivered

### Backend

| Change | File |
| --- | --- |
| New creative/ad service: image & video media lifecycle, creative CRUD, ad lifecycle (create/list/detail/update/status/duplicate/delete), preview generation | `backend/src/services/metaCreativeService.js` (new, ~740 lines) |
| New controllers (23 handlers): media, creatives, ads, previews | `backend/src/controllers/metaAdsCreative.js` (new) |
| Graph helpers reused — `graphRequest` / `graphFormRequest` / `effectiveConfig` / `requireToken` / `requireAdAccount` (no duplication) | `backend/src/services/metaGraph.js`, `backend/src/services/metaAdsService.js` |
| Validation schemas: creative body, CTA enum, ad create/update, status change (`confirm:true` for ACTIVE), deletes (`?confirm=true`), preview formats, upload limits | `backend/src/validators/metaAds.js` (extended) |
| Routes: 27 new/extended routes with RBAC + rate limits on uploads/deletes | `backend/src/routes/metaAds.js` (extended) |
| `GET /options` extended: `ctaTypes`, `adFormats`, `previewFormats`, `mediaTypes`, `limits` | `backend/src/controllers/metaAds.js` |
| Audit actions for creative/ad mutations | `backend/src/utils/audit.js` |
| Upload/delete routes behind `metaConnectLimiter` (120 requests / 15 min) | `backend/src/middleware/metaRateLimits.js` |

**No new Prisma tables were added in Phase 5.** Creatives, ads and media live in Meta's account;
this CRM reads them on demand. (Phase 6 analytics also adds no tables — see
`META_ADS_ANALYTICS_OPTIMIZATION.md`.)

### Frontend

| Change | File |
| --- | --- |
| API client: uploads (180 s timeout), creative/ad CRUD, previews, `?confirm=true` deletes | `src/lib/api/metaAds.js` (extended) |
| Enum/label library: CTA labels, preview formats, limits, formatters, sandboxed preview-frame extractor, recommendation labels | `src/lib/metaAdsEnums.js` (extended) |
| Design-system exports added: `PageContainer`, `PageHeader`, `RestrictedCard`, `StatCard`, `Tabs`, `Stepper`, `AdminId`, button classes, `formatCell` | `.../meta-ads/_components/metaAdsUi.jsx` (extended) |
| **Creative Studio** — Photos / Videos / Ad creatives tabs, upload with type+size gates, rename, permanent delete (confirmed) | `.../meta-ads/creatives/page.jsx` (new) |
| **Creative builder** — 3-step wizard (media → copy/CTA → validate & save), Page/Instagram pickers, char counters, draft preview + actual Meta preview | `.../meta-ads/creatives/new/page.jsx` (new) |
| **Creative detail** — content, details, sandboxed previews, rename/delete, "Use in a new advertisement" | `.../meta-ads/creatives/[creativeId]/page.jsx` (new) |
| **Ads Manager** — filters (campaign/ad set/status), pagination, pause/activate/rename/duplicate/delete | `.../meta-ads/ads/page.jsx` (new) |
| **Ad creation wizard** — campaign → ad set → creative (preselect via `?creativeId=`) → validate → create paused | `.../meta-ads/ads/new/page.jsx` (new) |
| **Ad detail + preview** — status, lifecycle actions, actual Meta previews, shareable preview link | `.../meta-ads/ads/[adId]/page.jsx` (new) |
| Sidebar: Creative Studio, Advertisements, Ads Overview | `src/components/layouts/AppSidebar.jsx` |

## 2. Endpoints added

All under `/api/v1/meta-ads`. Reads require `marketing:view`; mutations require
`marketing:manage`. Every request body/query is zod-validated before any handler or Graph call.

### Media (images & videos)

| Method | Path | Purpose / limits |
| --- | --- | --- |
| GET | `/creative/images` | List account images (paged) |
| POST | `/creative/images` | Upload — base64 `bytes`, **8 MB cap**, MIME allow-list; rate-limited |
| DELETE | `/creative/images/:hash` | Delete — requires `?confirm=true`; rate-limited |
| GET | `/creative/videos` | List account videos (paged) |
| POST | `/creative/videos` | Upload — multipart `source`, **50 MB cap** single request; rate-limited |
| DELETE | `/creative/videos/:videoId` | Delete — requires `?confirm=true`; rate-limited |

### Creatives

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/creatives` | List (paged) |
| GET | `/creatives/:creativeId` | Detail incl. `objectStorySpec` |
| POST | `/creatives/validate` | **Dry-run only** — Meta `validate_only`, no mutation, no audit |
| POST | `/creatives` | Create — pre-flight dry-run first; requires a Page (`ADPRO2__AD_MUST_HAVE_PAGE`) |
| PATCH | `/creatives/:creativeId` | Update name / status (node-level) |
| DELETE | `/creatives/:creativeId` | Permanent — requires `?confirm=true`; rate-limited |

### Ads

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/ads` | List by account, `campaignId` edge or `adsetId` edge; `status` → `effective_status` |
| GET | `/ads/:adId` | Detail incl. creative link + `preview_shareable_link` |
| POST | `/ads/validate` | **Dry-run only** (`validate_only` + `synchronous_ad_review`) |
| POST | `/ads` | Create — **always `status=PAUSED`** (schema-forced), dry-run first |
| PATCH | `/ads/:adId` | Rename / edit |
| POST | `/ads/:adId/status` | Pause or activate — **`confirm:true` required for ACTIVE** |
| POST | `/ads/:adId/duplicate` | Duplicate — **`status_option: PAUSED` forced server-side** |
| DELETE | `/ads/:adId` | Permanent — requires `?confirm=true`; rate-limited |

### Previews

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/ads/:adId/previews` | Actual Meta previews by `ad_format` |
| GET | `/creatives/:creativeId/previews` | Actual Meta previews for a creative |
| POST | `/previews/creative` | Draft composition preview from a creative body (`marketing:view`) |

## 3. Safety architecture (advertising safety)

1. **Nothing is ever auto-activated.** Creation schemas force `status=PAUSED` and `superRefine`
   rejects any payload that attempts to create an ACTIVE ad or creative. The server re-runs its
   own `validate_only` dry-run immediately before the real write.
2. **Activation is a deliberate, confirmed action.** `POST /:id/status` with `status=ACTIVE`
   requires a body `confirm:true` (zod-enforced). Pausing does not — pausing only ever reduces
   risk. The UI wraps activation in `ConfirmDialog` with a mandatory acknowledgement checkbox.
3. **Deletion is permanent in Meta's API** → requires `?confirm=true` **and** an acknowledgement
   checkbox in the UI, with a red-toned dialog.
4. **Duplicate never delivers.** `status_option: 'PAUSED'` is forced server-side, so a copy can
   never start spending on its own.
5. **Budget changes / activation / deletion all need explicit confirmation** — there is no
   bulk-activate path anywhere in the API.
6. **Permission + Meta error checks precede every write**: `requireToken`, `requireAdAccount`,
   Graph error propagation (never swallowed), and `adminOnly()` where configuration is involved.
7. **No raw API payloads in normal user flows.** `AdminId` renders Meta identifiers only for
   `SUPER_ADMIN`/`ADMIN`; ordinary client users see names, plain statuses and plain errors.
8. **Rate limiting** on upload/delete (`metaConnectLimiter`, 120 / 15 min) to protect the
   integration from runaway loops.

## 4. Preview rendering (security)

Meta returns **provider iframe HTML** (valid 24 h). This app **never injects provider HTML into
the DOM**. `extractPreviewFrameSrc(html)` extracts the iframe `src` with a regex, validates it
via `URL` (http/https only), and renders it as:

```jsx
<iframe sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
        referrerPolicy="no-referrer" />
```

Two clearly-labelled preview types exist so users are never misled:

- **Draft preview** — local composition of the ad copy; explicitly labelled *"not Meta's
  rendering"*.
- **Actual Meta preview** — from `generatepreviews`, labelled *"Rendered by Meta — valid for 24
  hours"*. If Meta rejects a placement, the per-format error is shown honestly instead of a
  placeholder image.

Default formats: `DESKTOP_FEED_STANDARD`, `MOBILE_FEED_STANDARD`, `INSTAGRAM_STANDARD`,
`INSTAGRAM_STORY`. Extended placements (stories/reels variants) sit behind an explicit toggle
because Meta may reject them for a given ad type.

## 5. Format & validation rules

- **Images**: JPEG/PNG/WebP/… allow-list, ≤ 8 MB, base64 `bytes` to Graph.
- **Videos**: MP4/MOV allow-list, ≤ 50 MB, multipart `source` (single-request limit documented
  by Meta).
- **CTA**: closed enum — the 15 values documented by Meta, exposed via `GET /options` and
  mirrored in `src/lib/metaAdsEnums.js` (single source of truth on both sides).
- **Ad creation**: requires an existing `adsetId` + `creativeId`; name ≤ 200 chars.
- **Creative creation**: requires `pageId` (Facebook Page) for `object_story_spec`; optional
  `instagramUserId` for Instagram identity.
- **Client-side gates mirror server limits** (type + size checked before upload) so users get an
  instant, plain-language message instead of a round trip.

## 6. RBAC

| Role | Read | Mutate |
| --- | --- | --- |
| SUPER_ADMIN, ADMIN | `marketing:view` | `marketing:manage` |
| SALES_MANAGER | `marketing:view` | — (view-only) |
| SALES_EXECUTIVE, CHANNEL_PARTNER | — | — |

Frontend and backend matrices are identical; the frontend gates on
`hasPermission("marketing:view"|"marketing:manage")` and administrators additionally via
`hasRole(["SUPER_ADMIN","ADMIN"])`.

## 7. Test results

| Suite | Tests | Status |
| --- | --- | --- |
| `backend/tests/meta-creative-ads.test.js` | 32 | ✅ passing |
| Full backend suite (44 suites) | 892 | ✅ passing (baseline 42/841) |
| Frontend (`metaAdsEnums` + `metaAdsUi` + lead-mapping + forgot-password) | 44 | ✅ passing |
| ESLint (`src/**`) | 0 errors | ✅ (54 pre-existing warnings in unrelated files) |
| `tsc --noEmit` | clean | ✅ |
| `prisma validate` + `generate` | valid | ✅ |
| `next build` | all 15 Meta Ads routes compiled | ✅ |
| Secret scan (42 changed files) | 0 matches | ✅ |

Tests cover: image/video upload limits & MIME gates, creative create/validate, ad create (PAUSED
enforcement), status change confirmation gating, duplicate-forces-PAUSED, delete `confirm`
requirement, preview format handling, RBAC denials, and rate limiting. All Graph calls are
mocked; no test touches the network.

## 8. Limitations & what a live connection must verify

- **No live Meta credentials exist here** — every Graph interaction in this phase is mocked.
  Live behaviour (upload acceptance, review turnaround, preview availability, CTA approval) is
  **unverified**.
- The disconnected state is reported accurately and exactly:
  `Meta account not connected — configure Meta App credentials to enable live integration.`
- Account-level ad listing has **no `filtering` parameter** (verified in Meta's docs) — status
  filtering uses the `effective_status` query parameter instead, and campaign/ad-set scoped
  listings use their native `/{id}/ads` edges.
- `insights` has **no creative level** (verified) — creative performance is derived by joining
  ad-level rows to their creatives (see the analytics doc).
- Preview iframes are valid for **24 hours**; a stale preview must be re-requested.
- Meta review outcomes (`PENDING_REVIEW`, `DISAPPROVED`) are surfaced verbatim from Meta — this
  app never rewrites or guesses them.
- Ad set **budget-type switching** (daily ↔ lifetime) is not supported by Meta's API and is
  therefore disabled in the UI with an explicit hint.
