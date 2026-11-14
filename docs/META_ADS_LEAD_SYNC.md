# Meta Ads — Phase 2: Instant Forms & Complete Lead Integration

Companion to `META_ADS_PHASE1.md` (connection/discovery) and
`META_LEAD_SYNC_SETUP.md` (webhook subscription). This document covers the
form discovery → mapping → webhook/backfill → history pipeline added in
Phase 2. All tests are mocked; nothing here has been verified against a
live Meta app.

## 1. What was delivered

### 2A — Instant Form discovery
- `GET /api/v1/meta-ads/lead-forms` walks `/{pageId}/leadgen_forms` on the
  connected Pages (settings `pageIds`, legacy `META_PAGE_ID` fallback),
  bounded cursor walk (max 5 edges × 100 per Page per call).
- Optional `?pageId=` scopes discovery to one connected Page (400
  `PAGE_MISMATCH` otherwise); no Pages configured → 409 `META_NOT_CONFIGURED`.
- Honest degradation:
  - per-Page permission failures become `errors[]` entries (the rest of the
    listing still succeeds);
  - rate limits / dead tokens fail the whole request with the real code
    (`META_RATE_LIMITED`, `META_TOKEN_INVALID`);
  - unreadable `status` field retries once with a reduced field set and
    reports `statusUnavailable: true` with `status: null` — never a guess.
- Configured forms Meta no longer returns are still listed with
  `missingFromMeta: true` so an admin can always disable them.
- Saved config (sync state, mapping count, last sync) is merged onto the
  Meta-provided rows; Meta's `pageId`/`formName` win when present.

### 2B — Per-form sync configuration (DB-backed)
- `MetaLeadFormConfig` model — additive migration
  `20261112000000_meta_lead_forms_sync` (not applied to any database):
  unique `[organizationId, formId]`, `pageId`, `formName`, `isEnabled`,
  `fieldMapping Json`, `lastSyncedAt`, timestamps. No credentials stored.
- `POST /api/v1/meta-ads/lead-forms/:formId/config` (admin-only):
  validates the Page is connected and the form actually belongs to it
  (bounded Graph scan, 400 `FORM_PAGE_MISMATCH`), then upserts.
- **Default-enabled gate (webhook source only)**: no config row → the form
  keeps ingesting (Phase 1 parity). An explicit row with `isEnabled=false`
  → webhook deliveries for that form create NO lead; the event is recorded
  `IGNORED`/`FORM_DISABLED` and counted `skipped`. Backfill and retry are
  not gated (historical import is an explicit operator action).

### 2C — Field mapping
- `GET /lead-forms/:formId/questions` returns Meta's `questions` verbatim
  (`available:false` + empty list when Meta provides none — never invented)
  plus the saved `fieldMapping`.
- `PUT /lead-forms/:formId/mapping` (admin-only, max 100 rows) saves
  `{ questionKey, questionLabel?, crmField }` rows; `crmField: null` means
  intentionally unmapped. Duplicate CRM targets and unknown fields → 400.
  Concurrent first-save race on the unique key falls back to upsert (P2002).
- Standard CRM vocabulary (11 fields, single source of truth in
  `backend/src/constants/metaLeadMapping.js`, mirrored in
  `src/lib/metaLeadMapping.js` with a test that diffs the two):
  fullName*, mobile*, email, project, property, propertyType,
  configuration, budget, preferredLocation, siteVisitDate,
  additionalRequirements (* = mandatory).
- Import rules: original question label + answers always preserved in
  `Lead.metaAnswers` (`{questionKey, questionLabel, values, mappedField}`);
  only an answer mapped to `additionalRequirements` writes `message`;
  phone is validated (10–15 digits) but the original string is stored;
  budget goes through `parseBudgetRange` → `budgetMin`/`budgetMax`;
  project/property resolve by exact name against the org's inventory and
  are never invented.

### 2D — Webhook integration (reuse, not rewrite)
- `POST /api/v1/webhooks/meta/leadgen` unchanged in shape: HMAC
  verification, Page allow-list, batch per-entry isolation, 503
  `META_NOT_CONFIGURED` contract when no token exists.
- The handler now delegates each lead to the shared
  `MetaLeadImportService.importLead` (source `WEBHOOK`). Order contract:
  dedupe pre-check → form gate → token resolve → detail fetch (metaCode
  100 → `lead_deleted`) → mapping → campaign enrichment → phone-match
  attach → `LeadService.createLead` (P2002 → duplicate).
- Full attribution written on the lead: `metaLeadId`, `metaPageId`,
  `metaFormId`, `metaAdId`, `metaAdsetId`, `metaCampaignId`,
  `metaCampaignName`, `metaPlatform` (only when Meta reports
  Facebook/Instagram), `metaCreatedAt`. Campaign name comes from a real
  Graph lookup — never fabricated.

### 2E — Historical backfill
- `POST /api/v1/meta-ads/lead-sync/backfill` (`marketing:manage`):
  `{ pageId, formId, since?, until? }` (paired YYYY-MM-DD dates,
  since ≤ until).
- Bounded: page size 50 × max 10 pages = 500 leads per run; date range
  travels to Meta (`since`/`until` unix) and is re-checked locally;
  transient failures (429 / ≥500) retry 3× with exponential backoff;
  10 consecutive permanent failures trip a circuit breaker (bounded work).
- Accurate counts returned and stored on the run: fetched / imported /
  duplicates / skipped / failed + `failures[]` (id + error code only).

### 2F — One import service, dedupe, idempotency
- Webhook, backfill and retry all go through
  `MetaLeadImportService.importLead` — no second lead-creation path.
- `@@unique([organizationId, metaLeadId])` preserved; `P2002` on lead
  create is counted as a duplicate; a pre-check short-circuits before any
  Meta call. Conservative matching only — no fuzzy identity merging.

### 2G — CRM workflow integration
- Leads are created through the existing `LeadService.createLead`:
  org scoping, `source = Meta`, NEW status, self-claim + claim limits,
  WhatsApp notification enqueue and the standard "Lead created" NOTE all
  behave exactly as for a manually created lead. One extra NOTE records
  the Meta sync context. No round-robin; no separate Meta-leads table.

### 2H — Frontend (tabbed UI)
New page `src/app/dashboard/marketing/meta-ads/lead-sync` with four tabs
(sidebar item **Lead Sync**, header link on the Meta Ads page):

| Tab | Contents |
|---|---|
| Lead Forms | discovery list, per-Page error banner, `statusUnavailable`/`truncated` notices, enable/disable toggle (ADMIN), Map fields / Backfill shortcuts |
| Field Mapping | form picker, one dropdown per Meta question → CRM field, required-CRM-field badges, duplicate-target validation, unmapped-but-preserved notes, Save (ADMIN) |
| Lead Sync | bounded backfill form (paired date validation), last-run result panel with counts + failure codes |
| Sync History | filterable run table (type/status/form), counts, `failedEvents` summary, per-row **Retry failed** (marketing:manage) |

- Reuses the existing API client (`src/lib/api/metaAds.js` helpers), React
  Query keys under `["meta-ads", …]`, `showToast`, `usePermissions`
  gates: `marketing:view` to read, `hasRole(["SUPER_ADMIN","ADMIN"])` for
  config/mapping, `marketing:manage` for backfill/retry. No duplicate
  settings page; connection management stays on Meta Connection.
- Client mirrors the CRM vocabulary in `src/lib/metaLeadMapping.js`
  (kept in sync by `src/lib/metaLeadMapping.test.js`, which requires the
  backend constants file and diffs it).

### 2I — Sync observability (no new infrastructure)
- `MetaLeadSyncRun` (source, status, counts, errorCode, started/completed)
  and `MetaLeadSyncEvent` (idempotencyKey = Meta lead ID alone, metaLeadId,
  pageId, formId, source, status, attemptCount, errorCode, runId,
  leadId, timestamps).
- Event/run/`lastSyncedAt` writes are best-effort (failures log a code via
  `console.warn` and never break lead ingestion); status never downgrades
  from `IMPORTED`. No raw PII in events, runs, audit or responses.
- Retry re-imports a run's `FAILED` events through the shared import path
  (capped at 100); an already-imported lead short-circuits as duplicate,
  so retry can never create a second row. No Redis, no new queue.

## 2. API surface (Phase 2)

| Method | Path | Permission |
|---|---|---|
| GET | `/api/v1/meta-ads/lead-forms` (`?pageId&limit`) | `marketing:view` |
| GET | `/api/v1/meta-ads/lead-forms/:formId/questions` | `marketing:view` |
| POST | `/api/v1/meta-ads/lead-forms/:formId/config` | ADMIN only |
| PUT | `/api/v1/meta-ads/lead-forms/:formId/mapping` | ADMIN only |
| GET | `/api/v1/meta-ads/lead-sync/history` (`?formId&pageId&source&status&limit`) | `marketing:view` |
| POST | `/api/v1/meta-ads/lead-sync/backfill` | `marketing:manage` |
| POST | `/api/v1/meta-ads/lead-sync/retry` | `marketing:manage` |
| POST | `/api/v1/webhooks/meta/leadgen` | HMAC (unchanged) |

Audit actions added (counts/IDs only, no secrets, no PII):
`meta.lead_forms_updated`, `meta.lead_mapping_updated`,
`meta.leads_backfilled`, `meta.lead_sync_retried`.

## 3. Database (additive migration, NOT applied)

```prisma
model MetaLeadFormConfig {
  id             String   @id @default(uuid())
  organizationId String
  formId         String
  pageId         String?
  formName       String?
  isEnabled      Boolean  @default(true)
  fieldMapping   Json?
  lastSyncedAt   DateTime?
  // + back-relations on Organization
  @@unique([organizationId, formId])
}
model MetaLeadSyncRun   { … counts + status + errorCode + timestamps }
model MetaLeadSyncEvent { … idempotencyKey unique-per-org + status + errorCode }
// Lead.metaAnswers Json?   (original question/answer preservation)
```

`npx prisma validate` and `npx prisma generate` pass. The migration file
exists in `backend/prisma/migrations/20261112000000_meta_lead_forms_sync/`
but has **not** been applied to any database (tests mock Prisma).

## 4. Testing

- Backend (`npx jest` from `backend/`): **41 suites / 818 tests pass**
  (baseline 782 + 36 new).
  - `meta-lead-forms.test.js` (17): discovery merge/pagination/status
    fallback/per-Page degrade/rate limit, config 409/400/form-belong
    checks, questions honesty, mapping save + duplicate/unknown/P2002,
    RBAC (exec 403 everywhere, manager view-only).
  - `meta-lead-sync.test.js` (19): mapped webhook → createLead with
    metaAnswers, unmapped → message null, disabled-form gate, default
    enabled parity, duplicate short-circuit, 503 no-token, 429 transient,
    backfill counts/date filter/pagination/idempotency/listing failure/
    circuit breaker (11 fetch calls for 12 rows)/validation, retry
    import/duplicate/404/400, history filters + bounded limit, PII-free
    events/runs/audit.
  - All Graph traffic stubbed with mocked `fetch`; no real Meta call.
- Frontend (`npm run test`): **2 files / 21 tests pass** (baseline 11 +
  10 new in `src/lib/metaLeadMapping.test.js`, including the backend
  vocabulary diff).
- `npx eslint`: 0 errors, 54 warnings (baseline). `npx tsc --noEmit`: 0.
  `npm run build`: OK (route `/dashboard/marketing/meta-ads/lead-sync`).
  `npm run check:secrets` (backend): 608 files pass.

## 5. NOT VERIFIED (honest limits)

- Real-Meta behaviour (discovery shapes, form status field, backfill
  listing, webhook delivery) is **not** verified — every test mocks the
  Graph API. Run the controlled test in `META_LEAD_SYNC_SETUP.md` against
  a test form before relying on this in production.
- No ads, campaigns, audiences, creatives or budgets were created or
  published in any phase.
- The migration has not been applied to any environment.
- Form gating applies to the webhook path only (documented limitation);
  backfill/retry deliberately import regardless of `isEnabled`.
- `metaPlatform` is only written when Meta reports the platform in the
  webhook value — it is not derived from the ad or guessed.

## 6. Safety confirmations

- No credentials/tokens/secrets in any API response, audit row, sync
  event/run or UI — discovery errors carry codes and messages only.
- `marketing:view` / `marketing:manage` and admin gates enforced
  server-side on every route (UI gates mirror them).
- Additive schema changes only; no destructive Prisma commands; no
  production DB/env changes; no deploy/commit/push performed.
- Existing webhook contracts preserved: batch per-entry isolation,
  HMAC verification, 503 not-configured behaviour, duplicate handling,
  `markSynced` never creates a row.
