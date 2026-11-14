# Meta Ads — Phase 3+4: Campaign, Ad Set & Audience Management

Status: **implemented and tested locally — NOT committed, NOT pushed, NOT deployed.** No production
change has been made. All Meta API interactions in this phase were verified with **mocked
responses only** — no live Meta credentials exist in this workspace, so nothing here has been
verified against a real ad account.

Scope of this document: exactly what was built for Phase 3+4 (backend + frontend), the endpoints
added, the safety architecture, test results, and what remains unverified. Phase 1/2/2.5
(connection, lead sync, settings, offline-readiness) behavior is unchanged.

---

## 1. What was delivered

### Backend

| Change | File |
| --- | --- |
| Phase 3+4 validation schemas + creation-valid Meta enums (objectives, special ad categories, billing events, optimization goals, platforms/positions, targeting with placement rules) | `backend/src/validators/metaAds.js` |
| New management service: campaign detail/create/update/status, ad set list/detail/create (with `validate_only` pre-flight)/update/status, audience list/create/update/delete — all audited | `backend/src/services/metaCampaignService.js` (new) |
| Shared `effectiveConfig` / `requireAdAccount` statics for reuse by the new service | `backend/src/services/metaAdsService.js` |
| Campaign list extended: `spend_cap`, `created_time`, `updated_time`, `objective` IN-filter | `backend/src/services/metaAdsService.js` |
| 15 new controllers (`GET /options` + campaign/ad set/audience CRUD + status + dry-run) | `backend/src/controllers/metaAds.js` |
| 16 new routes with RBAC (`marketing:view` reads, `marketing:manage` writes) | `backend/src/routes/metaAds.js` |
| 9 new audit actions (`meta.campaign_*`, `meta.adset_*`, `meta.audience_*`) | `backend/src/utils/audit.js` |
| `ads_management` added to OAuth scopes + recommended permissions (advisory — read-only connections stay valid) | `backend/src/services/metaAdsSettingsService.js` |

### Frontend

| Change | File |
| --- | --- |
| Enum/label library, exact disconnected string, money helpers (₹ ↔ paise), targeting preview builder, status badge styles | `src/lib/metaAdsEnums.js` (new) |
| 15 API client functions for the new endpoints | `src/lib/api/metaAds.js` |
| Shared UI kit: SectionCard, Field, ErrorBox, Notice, Pager, Modal, **ConfirmDialog (acknowledgement-checkbox gating)**, StatusBadge, EmptyState, **DisconnectedCard (exact Phase 2.5A string)** | `src/app/dashboard/marketing/meta-ads/_components/metaAdsUi.jsx` (new) |
| Campaign dashboard/list with filters, cursor pagination, create form (modal) | `.../meta-ads/campaigns/page.jsx` (new) |
| Campaign detail: edit form, pause/activate controls, ad set list | `.../meta-ads/campaigns/[campaignId]/page.jsx` (new) |
| 4-step ad set wizard: delivery → targeting → audiences → review + validate + create | `.../campaigns/[campaignId]/adsets/new/page.jsx` (new) |
| Ad set detail/edit + pause/activate controls | `.../campaigns/[campaignId]/adsets/[adsetId]/page.jsx` (new) |
| Audience library: saved (read-only) + custom (create/rename/delete) | `.../meta-ads/audiences/page.jsx` (new) |
| Sidebar entries "Meta Campaigns" + "Audiences" (MARKETING group) | `src/components/layouts/AppSidebar.jsx` |
| Frontend tests: enum/money/targeting contracts + ConfirmDialog gating + DisconnectedCard | `src/lib/metaAdsEnums.test.js`, `.../_components/metaAdsUi.test.jsx` (new) |

## 2. Endpoints added

All under `/api/v1/meta-ads`. Reads require `marketing:view`; mutations require `marketing:manage`.
Query/body shapes are zod-validated before any handler or Graph call.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/options` | Form enums (single source of truth, mirrors validators) |
| GET | `/campaigns` (existing, extended) | List + `objective` filter + spendCap/createdTime/updatedTime |
| GET | `/campaigns/:campaignId` | Campaign detail |
| POST | `/campaigns` | Create — **always `status=PAUSED`** (schema-forced) |
| PATCH | `/campaigns/:campaignId` | Edit name / objective / budgets / spend cap |
| POST | `/campaigns/:campaignId/status` | Pause or activate — **`confirm:true` required for ACTIVE** |
| GET | `/adsets` | List by `campaignId` edge or account edge (+ status filter) |
| GET | `/adsets/:adsetId` | Ad set detail (incl. targeting, promoted_object) |
| POST | `/adsets` | Create — **`validate_only` dry-run first, then create PAUSED** |
| POST | `/adsets/validate` | Explicit dry-run only (no mutation, no audit) |
| PATCH | `/adsets/:adsetId` | Edit name/budget/schedule/billing/optimization/bid/targeting |
| POST | `/adsets/:adsetId/status` | Pause or activate — **`confirm:true` required for ACTIVE** |
| GET | `/audiences` | Saved + custom audiences (separate Meta edges) |
| POST | `/audiences` | Create blank CUSTOM container |
| PATCH | `/audiences/:audienceId` | Rename / description |
| DELETE | `/audiences/:audienceId` | Permanent delete — **`?confirm=true` required** |

## 3. Safety architecture (defense in depth)

Creation can never start spend — enforced in four independent layers:

1. **Zod schemas**: create payloads accept `status` only as `['ACTIVE','PAUSED']` and reject any
   non-`PAUSED` value with a friendly message; status-change bodies require `confirm: true` for
   `ACTIVE`; audience DELETE requires `?confirm=true` (`z.literal('true')`). Invalid input never
   reaches a handler or the Graph API.
2. **Service layer**: `buildCampaignBody`/`buildAdSetBody` hard-set `status: 'PAUSED'` on every
   create, independent of input.
3. **Frontend**: no activation control exists on create flows; activation opens a ConfirmDialog
   whose Confirm button stays disabled until the user ticks *"I understand … may start ad spend"*,
   and only then sends `{ status:'ACTIVE', confirm:true }`.
4. **Meta's own validation**: ad set creation always runs
   `execution_options: ['validate_only']` first — a documented, non-mutating dry-run. If Meta
   rejects the payload (targeting, placements, budget rules…), the mutation is never sent. The
   wizard additionally exposes this as an explicit "Validate targeting" step that gates its
   Create button (any later edit re-locks it).

Additional rules:

- No creative upload, no ad publishing, no auto-activation anywhere in the codebase.
- Audience deletion is permanent in Meta's API → mandatory acknowledgement dialog + query flag.
- Single-company connection preserved: same `effectiveConfig` chain, token only in the
  `Authorization` header, missing credential fails closed with `409 META_NOT_CONFIGURED`.
  Responses carry identifiers/statuses/config only — never credentials (leak assertions in tests).
- Audit rows written for every mutation (entity types `MetaCampaign` / `MetaAdSet` /
  `MetaAudience`; actions listed in §5) — **no new DB tables**; the existing `AuditLog` table is
  reused. Meta remains the source of truth for campaigns/ad sets/audiences.

## 4. Validation & targeting rules

- **Field validation (zod)**: budgets are digit-string/positive-int subunits (₹→paise on the
  client); daily XOR lifetime budget; lifetime requires `end_time`; `end_time` after `start_time`;
  `LEAD_GENERATION` optimization requires `promoted_object.page_id`; names 1–400 chars.
- **Targeting**: `geo_locations.countries` required (2-letter ISO); `age_min/max` both-or-neither,
  13–65, min ≤ max; genders `[1]=male, [2]=female`; audiences as `[{id}]` references.
- **Placement rules** (mirroring Meta's Placement Targeting doc): Audience Network cannot be
  alone; Threads requires Instagram; facebook positions require the facebook publisher; feed-
  dependent positions (marketplace/search/profile_feed/notification) and story require a feed /
  IG-story partner as documented.
- **Provider-side**: every ad set create/dry-run is validated by Meta itself via `validate_only`
  (documented on the adsets edge: success `{success:true}` or a descriptive error).
  The account-level `targetingvalidation` edge was deliberately **not** used — it validates only
  interest/behavior IDs, not geo/age/placements/custom audiences.
- `GET /meta-ads/options` serves the exact enums the validators accept, so the UI can never offer
  a value the API would reject.

## 5. Audit actions added

`meta.campaign_created`, `meta.campaign_updated`, `meta.campaign_status` (status metadata
includes the new status, so activations are greppable), `meta.adset_created`,
`meta.adset_updated`, `meta.adset_status`, `meta.audience_created`, `meta.audience_updated`,
`meta.audience_deleted`. Metadata contains names/fields/IDs only — no credentials.

## 6. DB changes

**None.** No migration, no schema change, no new table. `npx prisma validate` passes; production
database untouched. (Unrelated pre-existing P2022 migrations were applied earlier to the local
dev DB only — see that report.)

## 7. Test results (all local, mocked)

| Suite | Result |
| --- | --- |
| Backend `npx jest` | **42 suites / 841 tests — all pass** (baseline 41/818 → +1 suite, +23 tests) |
| New backend suite `tests/meta-campaign-management.test.js` | 21 tests: RBAC 403 across all 15 routes, PAUSED-by-construction, invalid-payload loops never fetch Meta, activation confirm rules, `validate_only` sequencing (2 calls) and failure blocking (1 call, no mutation, no audit), dry-run endpoint, campaign-edge list + filtering, audience confirm-delete, audit actions, no token leakage |
| Updated `tests/phase11-meta-ads.test.js` | Read-only-404 contract replaced by the Phase 3 validation-gate contract |
| Frontend `npm run test` (Vitest) | **4 files / 44 tests — all pass** (baseline 21 → +23: enum/money/targeting contracts, exact disconnected string, ConfirmDialog gating, DisconnectedCard) |
| `npx eslint` | **0 errors / 54 warnings** (exact baseline) |
| `npx tsc --noEmit` | clean |
| `npx prisma validate` | schema valid |
| `npm run build` | production build succeeds; all 5 new routes compiled |

## 8. Mocked vs live — what is and is not verified

Verified **with mocked Graph responses** (deterministic stubs in Jest): request paths, methods,
payload shapes (`daily_budget` int64 strings, targeting object, `execution_options`), headers
(token in `Authorization` only), error propagation, RBAC, validation gates, audit writes.

**Not verified / not claimed:** anything against a live Meta ad account. No live credentials
exist in this workspace. Enum validity reflects the official Marketing API reference docs as of
this writing; Meta may still reject a payload at the provider level — which is exactly why every
ad set create re-runs `validate_only` server-side.

**Disconnected vs demo data:** the UI renders the exact Phase 2.5A string
*"Meta account not connected — configure Meta App credentials to enable live integration."* and
**zero** campaign/audience content when disconnected. There is no sample/demo/mock data anywhere
in these pages — connected-state lists contain only live Meta data.

## 9. Limitations & follow-ups

- **Budget type switching and budget clearing are not exposed on edit** (Meta requires specific
  sentinels for that); the type select is disabled with an explanatory hint.
- **Saved audiences are read-only** (Meta documents the `saved_audiences` edge as listing-only);
  custom audiences are manageable, but membership/lookalike creation is not in this phase.
- **Ad set edit preserves placements/audiences as-is** (shown read-only); changing them = the
  create wizard or Ads Manager.
- **`ads_management` scope**: added to OAuth + recommended permissions as *advisory*. Existing
  read-only connections keep reporting; until reconnected with the scope, Meta will deny writes
  (surfaced verbatim; the campaigns page shows an advisory banner when the permission is missing).
- **No creative/ads layer**: ads themselves (creatives, copy, publishing) are a future phase and
  do not exist in this codebase.
- Frontend currency assumes the account currency is INR for display; the API contract is always
  integer subunits.
- Connect-later path requires **no architectural rework**: point the settings row (or env) at a
  real token with `ads_read` + `ads_management` and re-run the mocked suites against recorded
  fixtures.

---

*Phase 3+4 complete. Awaiting review — nothing has been committed, pushed or deployed.*
