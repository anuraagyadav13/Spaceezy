# Meta Ads — Phase 0–6 UI/UX Audit & Production Readiness Redesign

Status: **implemented and tested locally — NOT committed, NOT pushed, NOT deployed.** No
production change has been made. This document records the full UI audit of every Meta Ads
screen, the design system applied, the before/after changes, the backend endpoints each screen
is wired to, quality-gate results, and the limitations that remain.

---

## 1. Design principles applied

SpaceEzy branding is preserved (purple/white, rounded-3xl cards, `font-black uppercase
tracking-wider` micro-labels, lucide icons). The redesign adds **no new dependencies** — only
existing components, Tailwind utilities and lucide icons.

1. **Plain language everywhere.** No raw API payloads, technical IDs, JSON, permission codes
   (`marketing:manage`), Graph API terminology, ISO country-code jargon or currency subunits in
   normal user flows.
2. **Business-first.** Screens lead with what the owner cares about: spend, leads, cost per
   lead, bookings, ROI.
3. **Honest states.** Disconnected / loading / empty / error / unattributed states are explicit.
   **No fabricated data is ever rendered** — a metric with no data shows `—` with a reason.
4. **Client vs administrator separation.** Technical configuration is admin-only; secrets are
   never sent to the frontend (the API returns booleans like `hasAccessToken`, never values).
5. **Safety preserved.** Ads are always created PAUSED; activation/deletion/budget changes need
   explicit confirmation; nothing auto-publishes or auto-spends.

## 2. Shared design system

`src/app/dashboard/marketing/meta-ads/_components/metaAdsUi.jsx` — one kit used by every Meta
Ads screen (all pre-existing exports kept; additions are additive):

| Export | Purpose |
| --- | --- |
| `PageContainer`, `PageHeader` | Consistent page shell, back-link, title, subtitle, actions slot |
| `SectionCard` | Card with icon / title / subtitle / action |
| `StatCard` | KPI tile for dashboards |
| `Tabs`, `Stepper` | Wizard + tab navigation |
| `Field`, `inputClass`, `labelClass` | Consistent form labelling + hints |
| `ErrorBox`, `Notice`, `LoadingRow`, `EmptyState`, `DisconnectedCard` | Complete state coverage |
| `StatusBadge`, `formatCell` | Plain-language status pills and cell formatting |
| `Modal`, `ConfirmDialog` | Dialogs; **activation/deletion require an acknowledgement checkbox** |
| `Pager` | Cursor pagination with plain-language labels |
| `AdminId` | Renders Meta IDs **only for administrators**; hidden from client users |
| `btnPrimaryClass`, `btnSecondaryClass`, `btnDangerClass` | Consistent buttons |

Guard tests: `src/app/dashboard/marketing/meta-ads/_components/metaAdsUi.test.jsx` (9) and
`src/lib/metaAdsEnums.test.js` (14) — both must stay green.

## 3. Screen inventory — before / after

### 3.1 Meta connection & settings — `meta-ads/settings`

| Before | After |
| --- | --- |
| Business and technical settings mixed on one screen for everyone | Technical sections (App credentials, webhook, connection diagnostics, credential management) are **admin-only**; non-admins see a single *"Advanced configuration — managed by administrators"* card |
| Raw permission codes/chips shown to all | Missing-permission codes, granted-permission chips and `Pages_show_list` wording are **admin-only**; client users get *"Some required Meta permissions are missing. An administrator must review the connection…"* |
| Raw ad-account / Page / Instagram IDs in selection rows | IDs rendered only for admins (`isAdmin ? \`ID ${id}\` : null`) |
| "Configuration source: Server environment (legacy)" exposed to all | Config-source and env-legacy wording admin-only; plain *"Saved in the CRM"* otherwise |
| "Connecting stores the connection in the CRM (legacy environment configuration stops being used)" | Admin-only variant; client users see *"Connecting Meta saves the connection securely in the CRM."* |

Client users still get the full business flow: **Connect Meta** button, connection status,
account/Page/Instagram selection, sync controls, health/token-expiry summary.

### 3.2 Lead forms & sync — `meta-ads/lead-sync`

| Before | After |
| --- | --- |
| Form picker appended raw form IDs for everyone | `FormPicker` has a `showIds` prop — IDs shown only to admins (3 usages) |
| Sync failure panel listed raw failure codes + Meta lead IDs for everyone | `RunResultPanel` has `showDetails` — admins see the list, others see *"N leads could not be imported — an administrator can view the details."* |
| Discovery errors rendered `Page {pageId}: {message} ({code})` for all | Admin-only page ID + code; plain message otherwise |
| Form table showed `formId` + raw `pageId` columns for all | Form ID and Page ID cells admin-only; client users see the form name and *"Meta Page"* |
| Mapping tab exposed question keys/types and Page IDs | Keys/types admin-only (`{isAdmin && …}`); Page line reads *"From your connected Meta Page"* |
| History table showed raw `formId` / `errorCode` | Admin-only; client users see the resolved form name and *"See admin"* |
| "scope by Page in the API" / "the token can read leadgen forms" | Rewritten plain; admin-only variant retained for admins |
| "Meta would not return the form status field" | "Meta did not provide a status for these forms — they show “—” instead of a guessed value." |
| No view-only explanation | Non-admins get a clear *"View-only access — an administrator can enable/disable forms and save field mappings."* |

The workflow itself is now: **pick a form → map questions visually → run sync → see results**,
with technical detail available to admins only.

### 3.3 Campaigns — `meta-ads/campaigns` + detail

| Before | After |
| --- | --- |
| Raw `campaign.id` shown under every name | `<AdminId>` (admin-only) |
| "Whole or 2-decimal amount in rupees; sent to Meta as paise." | *"Enter the amount in rupees (e.g. 5000)."* |
| Header `· ID {campaignId}` | Objective line only + `<AdminId>` below the subtitle |
| Ad set table showed raw `optimizationGoal` / `billingEvent` enums | `OPTIMIZATION_GOAL_LABELS` / `BILLING_EVENT_LABELS` plain-language labels |
| "2-decimal rupee amount; sent to Meta as paise." (detail edit) | *"Enter the amount in rupees (e.g. 5000)."* |

### 3.4 Ad set creation wizard — `campaigns/[campaignId]/adsets/new`

| Before | After |
| --- | --- |
| "A Facebook Page ID is required for the Lead generation optimization goal" | *"Choose the Facebook Page that will run your lead form ads"* |
| Raw text input labelled **"Facebook Page ID"** (placeholder `111222333444`) | **Page picker** loaded from `/meta-ads/pages` — choose your Page by name (with an honest *"No Pages are visible…"* state linking to connection settings) |
| "At least one 2-letter country code is required, e.g. IN" | *"Enter at least one country, e.g. IN"* |
| Field hint "Comma-separated 2-letter ISO codes." | *"Which countries to reach — e.g. IN, AE"* |
| Hint "Meta values: 1 = male, 2 = female." | *"Who should see your ads."* (labels already read All/Male/Female) |
| Hint "Sent to Meta as paise." | *"Enter the amount in rupees (e.g. 5000)."* |
| "Creating ad sets requires **marketing:manage permission**. Ask an administrator." | *"Creating ad sets requires marketing management access. Ask an administrator."* |
| Review step showed **`JSON.stringify(buildTargetingPayload(form), null, 2)`** in a `<pre>` block | Plain-language **Targeting summary** card: countries, age range, gender, where ads appear, placements, devices |

### 3.5 Ad set detail — `campaigns/[campaignId]/adsets/[adsetId]`

| Before | After |
| --- | --- |
| `Ad set ID {adsetId}` in the header | Plain subtitle + `<AdminId>` (admin-only) |
| Raw Facebook Page ID text input | **Page picker** (same as wizard) |
| "Comma-separated 2-letter codes." / "Sent to Meta as paise." / "A Facebook Page ID is required…" | Plain equivalents as above |

### 3.6 Audiences — `meta-ads/audiences`

| Before | After |
| --- | --- |
| Raw `audience.id` under every audience name | `<AdminId>` (admin-only) |
| Pager label *"Cursor paging (100 per page)"* | *"Page N · 100 audiences per page"* |
| Empty state *"Meta returned none for this type."* | *"None found for this type yet — create a custom audience to get started."* |

### 3.7 Sidebar navigation

| Before | After |
| --- | --- |
| Flat list mixing business + technical items: Meta Ads, Meta Campaigns, Audiences, **Meta Connection**, Lead Sync | Business items first (Lead Sources, Campaigns, Website Enquiries), then a coherent Meta Ads set: **Ads Overview → Ad Campaigns → Creative Studio → Advertisements → Audiences → Lead Forms & Sync → Performance** |
| "Meta Connection" visible to everyone | **Admin-only** (`adminOnly: true`); non-admins no longer see a technical entry point |
| No permission gating at all | Per-item `permission` gating — users without `marketing:view` don't see Meta Ads items; empty groups are hidden entirely |

All 15 links verified to resolve to real routes (see §6 build output).

### 3.8 New screens (Phases 5–6) built directly in the design system

| Screen | Route | Highlights |
| --- | --- | --- |
| Business dashboard | `/meta-ads` | 10 StatCards (spend, leads, CPL, qualified, site visits, quotations, bookings, cost/booking, booking value, ROI), attribution-gap notice, campaign table, quick actions, exact disconnected state |
| Analytics | `/meta-ads/analytics` | Preset/custom range, KPI grid, 6-step funnel, attribution check, campaign comparison, advisory recommendations + disclaimer + benchmarks |
| Creative Studio | `/meta-ads/creatives` | Photos/Videos/Ad creatives tabs, upload with client+server type/size gates, rename, permanent delete with confirmation |
| Creative builder | `/meta-ads/creatives/new` | 3-step wizard, Page/Instagram pickers, character counters, sticky draft preview, actual Meta preview, validate-gated save |
| Creative detail | `/meta-ads/creatives/[creativeId]` | Content + details, sandboxed previews, rename/delete, *"Use in a new advertisement"* |
| Ads Manager | `/meta-ads/ads` | Campaign/ad-set/status filters, cursor pagination, one-click pause, activate-with-confirm, rename, duplicate, delete-with-ack |
| Ad creation | `/meta-ads/ads/new` | Campaign → ad set → creative (preselect `?creativeId=`) → validate with Meta → create **paused** |
| Ad detail + preview | `/meta-ads/ads/[adId]` | Status, lifecycle actions with confirms, sandboxed actual Meta previews, shareable preview link |

## 4. Functional integrity (nothing was removed to simplify the UI)

- **Every button is wired to a real backend endpoint** (§5). No dead links, no placeholder
  handlers, no `alert()` stubs.
- **Permissions preserved**: frontend gates mirror the backend RBAC matrix exactly
  (`marketing:view` / `marketing:manage` / `adminOnly()`).
- **Validation preserved**: client-side checks mirror the zod schemas; server-side validation is
  the authority and its errors surface verbatim in `ErrorBox`.
- **Safety preserved**: ads/creatives always created PAUSED; `validate_only` pre-flight gates
  the Create buttons; activation requires `confirm:true` + acknowledgement checkbox; deletion
  requires `?confirm=true` + acknowledgement; duplicate forces PAUSED; **no auto-publish, no
  auto-spend, no auto-optimisation anywhere**.
- **No backend functionality was removed, weakened or bypassed.** The redesign is
  presentation-layer only (plus admin gating of existing routes' UI, which the backend already
  enforces).

## 5. Backend APIs connected by the UI

All under `/api/v1/meta-ads` (reads `marketing:view`, writes `marketing:manage`, configuration
`adminOnly()`):

| UI area | Endpoints consumed |
| --- | --- |
| Connection/settings | `GET /status`, `GET|PUT /settings`, `POST /oauth/state`, `GET|POST /settings/sync`, `POST /settings/rotate`, `DELETE /settings/secrets/:field`, `POST /settings/test-{connection,token,permissions,webhook}`, `GET /ad-accounts`, `GET /pages`, `GET /instagram-accounts` |
| Lead forms & sync | `GET /lead-forms`, `GET /lead-forms/:formId/questions`, `POST /lead-forms/:formId/config`, `PUT /lead-forms/:formId/mapping`, `GET /lead-sync/history`, `POST /lead-sync/backfill`, `POST /lead-sync/retry` |
| Campaigns | `GET /campaigns`, `GET /campaigns/:id`, `POST /campaigns`, `PATCH /campaigns/:id`, `POST /campaigns/:id/status`, `GET /options` |
| Ad sets | `GET /adsets`, `GET /adsets/:id`, `POST /adsets`, `POST /adsets/validate`, `PATCH /adsets/:id`, `POST /adsets/:id/status` |
| Audiences | `GET /audiences`, `POST /audiences`, `PATCH /audiences/:id`, `DELETE /audiences/:id?confirm=true` |
| Creative Studio | `GET|POST /creative/images`, `DELETE /creative/images/:hash?confirm=true`, `GET|POST /creative/videos`, `DELETE /creative/videos/:videoId?confirm=true`, `GET /creatives`, `POST /creatives/validate`, `POST /creatives`, `GET /creatives/:id`, `PATCH /creatives/:id`, `DELETE /creatives/:id?confirm=true` |
| Ads Manager | `GET /ads`, `GET /ads/:id`, `POST /ads/validate`, `POST /ads`, `PATCH /ads/:id`, `POST /ads/:id/status`, `POST /ads/:id/duplicate`, `DELETE /ads/:id?confirm=true` |
| Previews | `GET /ads/:id/previews`, `GET /creatives/:id/previews`, `POST /previews/creative` |
| Dashboard & analytics | `GET /analytics/overview`, `GET /analytics/conversions`, `GET /analytics/performance`, `GET /analytics/recommendations` |

**Secrets never reach the frontend**: settings responses expose `hasAppSecret` / `hasAccessToken`
booleans and masked state only.

## 6. Quality gates

| Gate | Result |
| --- | --- |
| Backend Jest (44 suites) | ✅ **892 / 892 passing** (baseline 42/841 — no existing test weakened) |
| Frontend Vitest (4 files) | ✅ **44 / 44 passing** |
| ESLint `src/**` | ✅ **0 errors** (54 pre-existing warnings, all in unrelated files) |
| TypeScript `tsc --noEmit` | ✅ clean |
| Prisma `validate` + `generate` | ✅ schema valid, client generated |
| `next build` (production) | ✅ compiled successfully; all **15** Meta Ads routes present |
| Secret scan (42 changed files) | ✅ **0 matches** (no tokens/keys/private keys introduced) |

New/changed frontend files linted and compiled: 15 route files, `_components/metaAdsUi.jsx`,
`src/lib/api/metaAds.js`, `src/lib/metaAdsEnums.js`, `src/components/layouts/AppSidebar.jsx`.

## 7. Remaining limitations

1. **No live Meta credentials in this workspace** — every Meta interaction is mocked. The UI is
   prepared for a real connection but **live behaviour is unverified** and must not be claimed as
   verified.
2. The disconnected state uses the exact required string:
   `Meta account not connected — configure Meta App credentials to enable live integration.`
3. **Creative-level reach/frequency/CTR/CPC/CPM are `null`** (not summable) — this is deliberate
   honesty, not a missing feature.
4. Attribution depends on `Lead.metaCampaignId/metaAdsetId/metaAdId` being populated; gaps are
   **reported** (`unattributedLeads`, `crmBeyondMeta`, `missingMetaAdId`, `missingMetaAdsetId`)
   never hidden or invented.
5. Ad set **budget-type switching** is disabled (unsupported by Meta's API) with an explicit hint.
6. Ad previews are Meta-rendered and **expire after 24 hours**; extended placements may be
   rejected by Meta for a given ad type (shown per-format as an honest error).
7. `datePreset → range` conversion is a local approximation, disclosed in API `notes[]`.
8. The sidebar hides technical items by role, but **route-level enforcement is the backend's
   RBAC** — the UI gate is a usability layer, not the security boundary.
9. Nothing has been committed, pushed or deployed; all Phase 0–6 work sits uncommitted in the
   working tree awaiting approval.
