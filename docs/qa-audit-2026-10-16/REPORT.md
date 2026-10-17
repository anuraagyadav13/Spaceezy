# SpaceEzy CRM — Functional, Integration & Logical QA Audit

**Date:** 2026-10-16 · **Auditor:** Automated QA session (read-only discovery + safe local/prod-probe testing)
**Scope:** `https://spaceezy.com` (read-only smoke) + local repository `C:\Users\anute\Desktop\SpaceEzy\Spaceezy` (branch `main` @ `6157d04` + preserved uncommitted WhatsApp Center / sidebar-toggle work)
**Working tree:** preserved unchanged (no fixes applied; audit deliverables only). Production untouched (no deploys, no migrations, no env changes, no prod logins).

---

## 1. Executive summary

**Overall readiness verdict: NOT READY** for production-approval sign-off. The platform is live in production and its core transactional spine (leads, inventory, bookings atomicity, authN/authZ boundaries, webhook signatures, validation envelopes) is demonstrably solid, but a cluster of P1 issues — fabricated business data in shipped dashboards, broken lead-list controls, PII-exposure gaps, a WhatsApp provider source-of-truth split that can silently bypass "mock" mode, and credentials tracked in git — must be resolved before this can be called production-grade.

| Metric | Count |
|---|---|
| Frontend routes inventoried | 96 pages (68 dashboard, 27 public, 1 login) |
| Backend API endpoints inventoried | ~110 across 17 route modules + 5 webhook endpoints |
| UI actions in button-to-backend matrix | 118 rows (`button-backend-matrix.csv`) |
| Matrix PASS | 62 |
| Matrix PARTIAL | 14 |
| Matrix FAIL | 38 |
| Matrix NOT TESTED (browser/UI) | 3 |
| Matrix BLOCKED (org isolation — single-org DB) | 1 |
| Prisma models / migrations | 26 / 16, **zero drift**, no destructive SQL |
| Modules audited | 14 (auth, team, leads, inventory, site-visits, bookings, customers, quotations, calls, WhatsApp center, WhatsApp notify, Meta ads, public site/SEO, admin/reports) |

**Verification actually executed (2026-10-16):**

| Check | Result |
|---|---|
| Backend Jest suite (`jest --runInBand`) | **553/553 PASS**, 26 suites, exit 0 (⚠ jest open-handle warning) |
| ESLint (root) | **0 errors**, 71 warnings, exit 0 |
| `next build` | **exit 0** |
| `prisma validate` | valid |
| Live local API probes (~70 calls) | auth, authz, validation, IDOR, WhatsApp flow, webhooks, rate limits, upload, booking lifecycle, notify outbox |
| Read-only local DB inspection | counts/statuses only (via Prisma, read queries) |
| Prod read-only smoke (8 URLs) | `/`, `/login`, `/projects`, `/robots.txt`, `/sitemap.xml`, `/api/v1/health`, `/api/v1/public/projects` → 200; `/api/v1/leads` → 401 |
| Headless Chrome renders (local) | login (password field), home (hero images + SEO title), projects, unauthenticated `/dashboard` → login |

**Explicitly NOT executed:** browser DOM interaction (no Playwright/Cypress in repo; harness-only checks), production authenticated testing (no prod credentials used), real WhatsApp/Meta sends (no customer contact; one accidental Meta API call in local env failed auth and delivered nothing), cross-org isolation runtime test (single-org DB).

---

## 2. Critical findings (P0)

1. **P0-VERIFY — Demo admin credentials are tracked in git history** (`backend/.tmp-lead-debug.js`, `backend/.tmp-users-debug.js`, `backend/seed.js`, `e2e/verify-public-share.ps1`). `backend/seed.js` creates `admin@spaceezy.com` with a hard-coded weak password and is **not environment-gated**. If production was ever seeded with this script, anyone with repo access owns the prod admin account. **Action:** immediately verify the prod admin password differs, rotate it, delete the tracked debug scripts, and add an env guard to `backend/seed.js`. (Password value intentionally omitted from this report.)

---

## 3. Critical findings (P0-adjacent / highest P1s)

- **P1 — WhatsApp "mock" mode can be silently bypassed by env config.** Send path (`whatsappService.js:127-147`): DB row with `providerMode:"mock"` → `useDbMeta=false` → falls back to the **env provider**. With `WHATSAPP_PROVIDER=meta` + env token present, UI-configured mock mode still performs **real** outbound sends. Verified live locally: `/whatsapp/status` reported `meta/configured:true/simulated:false` while `/whatsapp/settings` reported `mock/not-configured`; a Center send attempted the real Meta API (auth error, nothing delivered). In prod, env currently lacks a token so the blast radius is contained — until someone adds one.
- **P1 — Fake business data is shipped in production dashboards.** `reports/bookings` (₹3.2 Cr / ₹35.0 L literals), `reports/site-visits` (hardcoded 12/4), `reports` + `reports/leads` (always-zero metrics from wrong field names), `reports/custom` (mock charts, fake "Saved!" state, fake CSV export), `admin/audit` (fake rows despite a real `AuditLog` model), `marketing/sources`, `marketing/website`, `admin/roles`, `admin/workflows` (permanent "Active" badge). Violates the standing "no fake business data" rule.
- **P1 — Leads list is mostly a false affordance.** Search box, Stage/Source/Assigned filters, sort headers, pagination Prev/Next, bulk Assign, bulk Update Stage, Export, and row actions have **no handlers** (`leads/page.jsx:314-463`). Bulk-assign API itself works (mock-tested) but the UI never calls it.
- **P1 — PII exposure gaps vs the intended masking policy.** The leads list masks phone (`+919*****…`) for exec roles, but `GET /leads/duplicates` returns **full phone/email of every org lead** to any `lead:view` role (`leadService.js:1542-1577`). Additionally by-ID reads for bookings/quotations/site-visits/customers (and the **site-visit list**) return unmasked lead/customer phone/email to exec roles.
- **P1 — Unauthenticated WhatsApp webhook org-enumeration oracle.** Org resolution runs **before** signature verification (`whatsappService.js:440-461`); `UNKNOWN_SENDER`/`AMBIGUOUS_SENDER` errors leak configured WABA/phone-number IDs to unauthenticated callers (live risk in prod where settings are configured; locally fail-closed with 503).
- **P1 — No rate limit/lockout on `POST /auth/login`** (only public site + WhatsApp settings routes are rate-limited). Credential-stuffing surface against a CRM holding customer PII.
- **P1 — Notify outbox silently no-ops on misconfiguration.** `notifyEnabled:true` without `notifyTemplateName` → `resolveTemplate` throws → `enqueueForLead` catches everything → `{skipped:'error'}` and **no row, no log surfaced to any UI** (observed live). Also: even with a template, the library default (`Property Snapshot`) hard-fails for leads without property/project data (`FAILED: Notification variables unresolved…`, observed) — notifications for bare leads are structurally impossible with that template.
- **P1 — In-memory notify retries.** Retry timers are `setTimeout` chains (`whatsappNotifyService.js:15-22,267-269`); restart loses all retry state; stale `PENDING` rows are never swept by any job (no job runner exists).

---

## 4. Button-to-backend matrix

Full CSV: [`button-backend-matrix.csv`](./button-backend-matrix.csv) (118 rows: page/element → expected behavior → API → backend path → permission → success/failure states → actual test → PASS/FAIL/PARTIAL/NOT TESTED/BLOCKED → evidence).

Highest-signal rows: leads dead controls (8× FAIL), reports fake data (5× FAIL), duplicates PII (FAIL), site-visit/booking/quotation/customer by-ID PII (FAIL), WhatsApp status-vs-settings divergence (FAIL), notify silent no-op (FAIL), booking lifecycle (PASS×5 live), public enquiry dedupe + rate limit (PASS live), webhook signatures (PASS live), secrets redaction (PASS live).

---

## 5. Module results

### A. Authentication & team — **PASS with gaps**
Live: login/logout envelope, HttpOnly+SameSite cookie, 401 redirect, generic bad-password message, UUID validation, EMP 403 on `employee:create`/settings/user-delete, emp lead-scoping (unassigned lead → 403). Gaps: no login rate limit; `userService.deleteUser` has no self-deactivation/last-admin/SUPER_ADMIN guard (`userService.js:124-136`); expired-session purge not verified (232 local sessions accumulated); prod `Secure` cookie flag not runtime-verified.

### B. Projects & inventory — **PASS**
Mock suites (phase1/phase8/p0-property) + live availability transitions. Upload endpoint returns honest `501 S3_NOT_CONFIGURED` locally (magic-byte sniffing, 6MB cap, org-prefixed keys). Gaps: upload route has **no permission** (auth only); `/media` streams any org's key without session/org binding; local `.env.production` copy shows `AWS_S3_BUCKET` empty (prod value not verified).

### C. Leads & assignment — **PASS (API) / FAIL (list UI)**
Live: create 201, validation 400s, list masking, by-id scoping, enum validation, `limit` accepted **unbounded** (999999999 → 200; P2). Mock suites cover transitions, scope building, bulk-assign, claim limits, pipeline, duplicates grouping, merge. UI list controls dead (P1 above). Orphan routes (URL-only reachable): import, duplicates, follow-ups, assignment, untouched, re-engaged, activities, pipeline, commissions (stub "ready for development").

### D. Site visits, bookings, customers — **PASS (lifecycle) / FAIL (PII)**
Live booking lifecycle on real local DB: create → property `RESERVED` → duplicate booking `409 CONFLICT` → cancel → `CANCELLED` + property `AVAILABLE` → rebook `201`. Atomic sold-out rejection confirmed. Gaps: unmasked PII on by-ID reads (bookings/quotations/customers) and site-visit list; site visits/calendar/overdue UI not browser-tested (mock-covered).

### E. WhatsApp Center — **PARTIAL**
Live: conversation create (bound to lead+org), history fetch shape, template library (7 templates), settings save with secret redaction (`has*` booleans only), test-connection honest `409`, send failure surfaces honest `502 WHATSAPP_PROVIDER_ERROR` (no fake success). **Success-path send NOT TESTED** (local env points at real Meta with an invalid token; no real messages sent). Divergence: `/status` (env) vs `/settings` (DB) disagree; frontend gates "Open WhatsApp" on the env-derived status (`leads/[id]/page.jsx:36`) while integrations badge prefers DB — inconsistent UX. Template-select fires a success toast with no API call. Uncommitted Center rebuild (3-column, quick actions, notes) verified only via lint/build/harness.

### F. Meta Ads & lead ingestion — **PASS (edge)**
Live: bad-signature → `401 WEBHOOK_SIGNATURE_INVALID` (signature checked first). Mock suites: verify handshake, ingestion, dedupe via unique `(organizationId, metaLeadId)`. Gaps: ingestion routes to `organization.findFirst()` (first-org); Meta verify compare is non-constant-time; batch entries processed sequentially (one bad entry aborts rest).

### G. Automatic lead notifications — **PARTIAL (works, fragile)**
Live E2E: lead create → outbox row persisted → processed → `FAILED` with captured error (`variables unresolved…`), attempts recorded, lead intact. Dedup key `(org, lead, recipient)` + P2002 handling verified in code/tests. Failures: silent no-op without template (P1); retries in-memory only (P1); enqueue errors swallowed (`catch → skipped:'error'`); delivery-status bridge only upgrades SENT→DELIVERED/READ.

### H. Search, reports, admin, integrations — **FAIL (reports/admin content)**
Reports/marketing/audit/roles/workflows pages serve fabricated or always-zero data (P1). Integrations settings card is correctly wired (role-gated, redacted, audited). Locations reads are tested (phase7); region writes mutate a **global** master with no orgId — any tenant admin affects all tenants (P1 for multi-tenant future). Global search box and notification bell are dead.

### Cross-module journeys (Phase 4)
| Journey | Result |
|---|---|
| Lead create → assignment → notify outbox → recipient/template validation | **PASS** end-to-end locally (incl. honest FAILED row) |
| Website enquiry → lead persistence → dedupe | **PASS** (repeat submission returns same lead id; DB count=1) |
| Meta leadgen → sig verify → dedupe | **PASS** (sig 401 live; dedupe mock-tested) |
| Lead → conversation → message persistence → history | **PARTIAL** (persist/history PASS; provider success path untested) |
| Booking → inventory decrement → cancel → rollups | **PASS** live |
| Employee deactivation → eligibility | **PARTIAL** (mock tests; no self-guard) |
| Image upload → retrieval → access rules | **PARTIAL** (honest 501 locally; prod S3 unverified) |
| Settings save → reload → redaction → test-connection | **PASS** live |
| Invalid request → error → no unintended mutation | **PASS** live (400s; no rows created on validation failure) |
| Duplicate/concurrent requests → idempotent outcome | **PASS** sequential (enquiry dedupe, booking 409, notify P2002); true parallelism NOT TESTED |

### Phase 5 — DB & API integrity
Schema↔migrations zero drift (26 tables, 19 enums); FK/unique constraints sound (incl. notify dedupe key, `publicSlug`, `publicToken`, `phoneNumberId` globally unique — noted multi-tenant smell); org scoping on 19/26 models with justified indirect scoping; transaction boundaries present in booking/lead paths; orderBy allow-listed (no injection found); validation gaps: unbounded `limit`, raw `from/to` dates on follow-ups/activities/pipeline; swallowed errors catalogued (notify enqueue, audit-log write, status bridges — all fail-closed for responses but can lose side data).

### Phase 6 — Security & failure testing
Protected routes 401 unauthenticated (live local + prod); permission denials 403 (live); UUID IDOR validation; webhook HMACs timing-safe and fail-closed (live rejections); secrets never in responses (live); cookie HttpOnly+SameSite (live); rate limiting live-confirmed on public enquiries (429) and code-verified on settings; graceful degradation live-confirmed (S3 501, WhatsApp 503/502/409 honest errors). Gaps: login/webhook rate limits absent; WhatsApp pre-auth oracle; media no org binding; uploads no permission; tracked credential scripts.

---

## 6. Cross-module inconsistencies

1. **WhatsApp config split-brain:** env (`/status`, send fallback) vs DB (`/settings`, verify token) — UI gates and real sends can disagree (see P1).
2. **PII policy split-brain:** leads list masks; duplicates/site-visits/bookings/customers by-ID do not.
3. **Reports vs services:** report pages assume `lead.stage`/`assignedTo` scalar; API returns `status`/`assignedTo` object → silent zeros while pages look healthy.
4. **AuditLog written by 7 services but the Audit Logs page shows fabricated rows** — data exists in DB, UI never reads it.
5. **First-org routing** for public enquiries/Meta leadgen vs session-scoped CRM — invisible today (1 org), wrong under multi-tenancy.

---

## 7. Remediation plan

**P0 — do immediately**
1. Verify/rotate prod admin password if ever seeded from `backend/seed.js`; delete `backend/.tmp-*.js` from git; env-guard both seed scripts. Tests: CI grep for tracked secrets; deploy checklist item.

**P1 — before calling this production-grade**
1. Make DB `providerMode:"mock"` authoritative for sends (remove env fallback when a DB row exists); align `/status` with effective config; gate "Open WhatsApp" on effective config. Tests: unit matrix row-present×mode×env.
2. Replace or clearly label all fabricated dashboard data (reports, audit, marketing, roles, workflows); wire audit page to real `AuditLog`. Tests: report pages with seeded DB fixtures assert real numbers.
3. Wire or remove dead leads-list controls (search/filters/sort/pagination/bulk/export). Tests: e2e once a browser framework exists; at minimum hook unit tests.
4. Apply `maskContact`+role scoping to `/leads/duplicates`, site-visit list/by-id, booking/quotation/customer by-id. Tests: exec-role sees masked; owner sees full.
5. Verify WhatsApp webhook signature before org resolution; genericize pre-auth errors. Test: unsigned POST never reveals configured IDs.
6. Rate-limit `POST /auth/login` (+ exponential lockout or at least IP limiter). Test: Nth attempt 429.
7. Notify outbox: surface `skipped:'error'` (audit/log/admin indicator); choose a lead-capable default template; add a persistent sweeper for stale PENDING; persist retry schedule. Tests: misconfigured settings produce visible signal; restart preserves retry state.

**P2 — reliability & multi-tenant hygiene**
1. Cap `limit` params; validate `from/to` dates (follow-ups, activities, pipeline).
2. Permission-gate uploads; bind `/media` reads to org or signed URLs.
3. Org-guard location-master writes (or reserve to platform SUPER_ADMIN).
4. Replace first-org resolution with configured tenant mapping (public + Meta leadgen).
5. Add `/media/` location to the SSL nginx template; create root `.env.production` handling; set `AWS_S3_BUCKET` verification in deploy checklist.
6. Guard `deleteUser` against self/last-admin/SUPER_ADMIN targets; remove misleading no-API success toasts (template select, custom reports export/save).
7. Fix reports field mismatches or remove pages from nav; link orphan routes or delete them; implement or hide `/dashboard/commissions`.

**P3 — polish**
Jest open-handle cleanup (`--detectOpenHandle`s); expired-session purge job; constant-time Meta verify compare; remove `legacy JSON credential scraping` in `app.js:43-59`; frontend test setup (vitest+RTL) and a browser framework justification decision; document demo-credential policy.

---

## 8. Production-readiness verdict

### **NOT READY** (for production-approval sign-off)

Rationale: automated suites pass (553/553) and the transactional core held up under live probing, but (a) a P0-grade credential-hygiene item needs owner verification, (b) production UI presents fabricated business metrics, (c) a WhatsApp config split can silently bypass mock mode, and (d) PII-masking is inconsistently enforced. Recommended next gate: resolve P0 + P1 list, re-run this audit's probe pack, then declare **READY FOR STAGING VERIFICATION**. Note that production is *already live*; the findings above are therefore also an active-risk list for the running system.

---

## 9. Test-environment residue (local dev DB only)

Created during probing on the **local** database (safe to delete): 4 `QA Audit Probe*` leads, 1 public-enquiry probe lead, 1 QA customer + 2 bookings (both `CANCELLED`, property restored `AVAILABLE`), 1 WhatsApp conversation + 0 outbound messages delivered, 1 `whatsappNotification` row (`FAILED`), 1 local `whatsappSettings` row (`mock`, notify on, template `Property Snapshot`, recipient `+919811100999`). No production data was created or modified; no real messages/calls/campaigns were sent.
