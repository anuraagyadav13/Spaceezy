# Meta Ads — Step 0 (Hardening) + Phase 1 (Company Connection & Asset Discovery)

Status: **implemented and tested locally — NOT deployed**. No commit, push or deploy has been
performed for this work. Production is untouched and still runs the previous release.

Scope of this document: exactly what was built for Step 0 + Phase 1, how it behaves, what
remains to be configured in Meta, and what has *not* been verified against live Meta. Phase 2+
(campaign/ad-set/creative/form writes, budgets, publishing) is explicitly **out of scope** and
does not exist in this codebase — no write routes, no ad spend capability.

---

## 1. What was delivered

### Step 0 — hardening (before any new features)

| Change | File |
| --- | --- |
| Per-entry webhook batch isolation (one bad entry no longer aborts the batch) | `backend/src/services/metaAdsService.js` |
| Timing-safe verification-token compare (`crypto.timingSafeEqual`, length guard) | `backend/src/controllers/webhooks.js` |
| Rate limits for Meta-facing routes (env-tunable, retry-friendly `429` + `Retry-After`) | `backend/src/middleware/metaRateLimits.js` (new) |
| Read limiter applied before auth on `/meta-ads/*`; webhook POST limiter in app | `backend/src/routes/metaAds.js`, `backend/src/app.js` |
| Additive indexes for lead attribution lookups | `backend/prisma/schema.prisma` + migration `20261106100000_meta_attribution_indexes` |

Batch isolation semantics (tested):

- **Transient Meta failures (HTTP 429/5xx) rethrow immediately** — Meta's own delivery retry is
  preserved; entries already written stay written and are made idempotent by the
  `(organizationId, metaLeadId)` unique constraint (unchanged).
- **Permanent per-entry errors** (validation, page mismatch, …) are collected; the response
  gains a `failed` counter alongside `processed/ignored/duplicates`.
- Rejection logging is safe-identifier only: `console.warn('[meta-webhook] entry rejected',
  { code, status })` — no lead payloads, tokens or page contents.
- The original error is thrown only when *nothing* was processed
  (`processed === 0 && duplicates === 0 && ignored === 0`), so the HTTP status still reflects
  real failures.

Rate limits (per IP, per 15 minutes, read from env on every request):

| Limiter | Env var | Default | Applied to |
| --- | --- | --- | --- |
| `metaReadLimiter` | `META_RATE_LIMIT_READ_MAX` | 600 | all `GET /api/v1/meta-ads/*` (before `requireAuth`) |
| `metaWebhookLimiter` | `META_RATE_LIMIT_WEBHOOK_MAX` | 600 | `POST /api/v1/webhooks/meta/leadgen` |
| `metaConnectLimiter` | `META_RATE_LIMIT_CONNECT_MAX` | 120 | `POST /oauth/state`, `GET /oauth/callback` |

A 429 body is `{ success:false, message, code:"TOO_MANY_REQUESTS" }` with a `Retry-After`
header — Meta treats 429 as retryable, so legitimate bursty webhook deliveries are never
discarded. Defaults are deliberately generous so normal dashboard traffic is never shaped.

### Phase 1 — company-level connection & asset discovery

**Data model** — `MetaAdsSettings` (new model in `backend/prisma/schema.prisma`, migration
`20261106110000_meta_ads_settings`):

- One row per primary Organization: `organizationId @unique` (single-company convention —
  the first organization *is* the primary organization; this is deliberate, not multi-tenancy).
- Back-relation `Organization.metaAdsSettings`.
- `@@unique([organizationId, metaLeadId])` on `Lead` is preserved untouched.
- Migration SQL was hand-written byte-identical to
  `prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script` (Prisma 7) and
  validated with `prisma validate`.

**Encryption at rest** — reuses `backend/src/utils/whatsappSecrets.js` (AES-256-GCM, random
IV per encryption, versioned `v1.` envelope) with its **own key** `META_ADS_SETTINGS_KEY`
(placeholder in `backend/.env.example`, generated with `openssl rand -hex 32`, server env
only — never committed, never printed in logs/reports). WhatsApp keeps
`WHATSAPP_SETTINGS_KEY`; the two keys are isolated (a Meta envelope cannot be decrypted with
the WhatsApp key and vice versa — tested).

- Secrets travel only as ciphertext (`accessTokenEnc`, `appSecretEnc`).
- API responses expose booleans only (`hasStoredToken`, `hasStoredSecret`) — never values.
- A **decrypt failure fails closed**: the stored row is authoritative, so a missing key or a
  tampered envelope yields `503/500 SETTINGS_DECRYPT_FAILED` with **no** fallback to any
  environment token, and no Meta call is made.

**Configuration precedence** (`backend/src/services/metaAdsSettingsService.js`):

- **No settings row → legacy env behavior** (`META_ACCESS_TOKEN`, `META_AD_ACCOUNT_ID`,
  `META_PAGE_ID`, `META_APP_SECRET`…) — existing deployments keep working unchanged.
- **Row exists → row is authoritative.** Environment credentials are never consulted again
  (webhook secret included: a row secret overrides the env secret; an env-signed delivery is
  rejected with `401 WEBHOOK_SIGNATURE_INVALID`).
- `markSynced()` updates an existing row only (P2025 → no-op); **sync never creates a row**,
  so a legacy env deployment can never be silently flipped into CRM-managed mode by clicking
  Refresh. Row creation happens only through an explicit user action (`PUT /settings` or a
  completed OAuth connect).

**OAuth connect (stateless, server-side exchange):**

- `POST /api/v1/meta-ads/oauth/state` returns `{ authorizeUrl }` — a Meta dialog URL carrying
  a signed state `v1.<exp>.<nonce>.<sig>` (HMAC-SHA256, key = `META_ADS_SETTINGS_KEY`,
  10-minute TTL). **No token, code or secret ever appears in a URL, response or log.**
- `GET /api/v1/meta-ads/oauth/callback` is registered **before** `requireAuth()` (Meta
  redirects the browser as a top-level navigation; the `SameSite=Lax` session cookie rides
  along and is resolved manually). It verifies the state, exchanges the code **server-side**
  against `oauth/access_token`, encrypts the received token, stores `tokenExpiresAt` from
  `expires_in`, audits `meta.oauth_connected`, and always answers with a `302` to
  `${FRONTEND_URL}/dashboard/marketing/meta-ads/settings?oauth=<flag>` where flag is one of
  `connected | denied | failed | login_required | forbidden` — a safe status only; the
  callback's own `code`/`state`/`error` are never reflected back.
- Connect requires `marketing:manage` (checked against the resolved session's role).

**Graph layer** — `backend/src/services/metaGraph.js`: version strings validated against
`^v\d{1,2}\.\d{1,2}$`; `graphRequest({ token, version })` overrides so callers always pass the
*effective* credentials explicitly (db mode can never silently pick up an env token); the
token travels **only** in the `Authorization: Bearer` header (asserted in tests), never in
URLs.

**Discovery (read-only):**

- Ad accounts: `GET /meta-ads/ad-accounts` (cursor pagination).
- Pages: `GET /meta-ads/pages` (cursor pagination, includes
  `instagramBusinessAccountId` when linked).
- Instagram: `GET /meta-ads/instagram-accounts` — walks the accessible Pages; a Page with no
  linked Instagram is reported honestly as `available:false, reason:"NOT_CONNECTED"`, and a
  per-account Meta failure marks only that row `available:false` with its error code (never
  the whole discovery).
- `POST /meta-ads/settings/sync` refreshes all three, records `syncedAt` on an existing row,
  audits `meta.assets_synced` with counts, and returns `{ configSource, adAccounts, pages,
  instagramAccounts, syncedAt }`.

**Status extensions** — `GET /meta-ads/status` now also returns `configSource`
(`db|env`), `tokenExpiresAt`, `tokenExpired`, `reauthRequired`, and
`missingRecommendedPermissions` (advisory: `pages_show_list, pages_read_engagement,
leads_retrieval, instagram_basic`). A known-expired token short-circuits to
`reason:"TOKEN_EXPIRED"` **without calling Meta**. In db mode the `missing` labels are
`storedCredentials` / `selectedAdAccountIds` (env mode keeps the legacy
`META_ACCESS_TOKEN` / `META_AD_ACCOUNT_ID` labels).

**Multi-Page webhook:**

- Page allow-list = settings row `pageIds` when a row exists (empty row = explicitly
  unconfigured), legacy single `META_PAGE_ID` when no row exists.
- Unknown page → `400 PAGE_MISMATCH`; no configuration → `503 META_NOT_CONFIGURED` (503, not
  409, so Meta's delivery keeps retrying); still routed to the primary organization.
- Leads enter the **existing self-claim queue only** — status `NEW`, never auto-assigned
  (no round-robin), WhatsApp notify behavior untouched.

**RBAC:** `marketing:view` on all GETs (viewers see status/discovery/selections);
`marketing:manage` on `PUT /settings`, `POST /settings/sync`, `POST /oauth/callback`'s role
gate and `POST /oauth/state`.

---

## 2. API surface (Phase 1)

All under `/api/v1/meta-ads`, behind `metaReadLimiter` + `requireAuth` (except the callback):

| Method | Path | Permission | Notes |
| --- | --- | --- | --- |
| GET | `/status` | `marketing:view` | connection state, permissions, expiry |
| GET | `/ad-accounts` | `marketing:view` | discovery, `?limit&after` |
| GET | `/campaigns` | `marketing:view` | existing reporting |
| GET | `/insights` | `marketing:view` | existing reporting (live only — no caching tables) |
| GET | `/settings` | `marketing:view` | display-safe view + `source: db\|env` |
| PUT | `/settings` | `marketing:manage` | encrypts secrets, normalizes/de-dupes IDs |
| POST | `/settings/sync` | `marketing:manage` | refresh discovery + `syncedAt` |
| POST | `/oauth/state` | `marketing:manage` | returns `authorizeUrl` (signed state) |
| GET | `/oauth/callback` | session + `marketing:manage` | pre-auth; 302 with safe `?oauth=` flag |
| GET | `/pages` | `marketing:view` | discovery, `?limit&after` |
| GET | `/instagram-accounts` | `marketing:view` | discovery, `?limit` |

Webhook (unchanged paths): `GET|POST /api/v1/webhooks/meta/leadgen`.

Audit actions added: `meta.settings_updated`, `meta.oauth_connected`, `meta.assets_synced`
(metadata carries field names and counts only — never values).

---

## 3. Frontend

- **New page** `src/app/dashboard/marketing/meta-ads/settings/page.jsx` (Suspense-wrapped
  `useSearchParams`, matching the repo convention):
  - **Connection card** — status badge, signed-in user, ad account, configuration source,
    token expiry, required vs recommended permission chips, reauth notice, Connect/Reconnect
    (full-page navigation to the Meta dialog), safe error boxes with Retry.
  - **`?oauth=` banner** — read once at mount, flag stripped from the URL immediately
    (`router.replace`), shown as connected/denied/failed/login_required/forbidden; a
    successful connect invalidates the `["meta-ads"]` query family.
  - **Multi-selects** — ad accounts, Facebook Pages, Instagram accounts (cursor-paged for
    the first two; "Select shown" is a union so other-page selections are never lost;
    unlinked/unavailable Instagram rows are disabled with an honest reason).
  - **Save bar** — dirty tracking with Save + Discard; save persists all three selections.
  - **Sync card** — last sync time, configuration source, connection state, Refresh button,
    loading/empty/error states and a success summary with counts.
  - **RBAC** — `marketing:view` gates the page (`marketing:manage` hides/restricts every
    control with a "View only" badge).
  - React Query with invalidation (`["meta-ads","settings"]`, `["meta-ads","status"]`,
    `["meta-ads"]`); **no localStorage tokens anywhere**; no duplicate API client (all calls
    go through the existing `apiClient` in `src/lib/api/client.js`, which unwraps
    `{success,data}`).
- `src/lib/api/metaAds.js` — added `fetchMetaSettings`, `saveMetaSettings`,
  `syncMetaAssets`, `fetchMetaPages`, `fetchMetaInstagramAccounts`, `startMetaOAuth`.
- `src/components/layouts/AppSidebar.jsx` — MARKETING group gained **Meta Connection**.
- `src/app/dashboard/marketing/meta-ads/page.jsx` — header gained a **Connection settings →**
  link. The existing meta-ads/campaigns dashboards are otherwise untouched and keep working.

---

## 4. Meta Developer configuration still required (manual, outside this repo)

1. App Dashboard → **Settings → Basic → App Domains**: add the deployment domain
   (`spaceezy.com` in production). Without it Meta rejects the dialog with
   *"Can't load URL — The domain of this URL isn't included in the app's domains."*
2. App Dashboard → **Facebook Login → Settings**: set the Valid OAuth Redirect URI to
   `${BACKEND_URL}/api/v1/meta-ads/oauth/callback`. The admin-only *OAuth configuration
   diagnostic* (Settings page, or `GET /api/v1/meta-ads/settings/oauth-diagnostics`)
   prints both exact values — see [`META_ADS_PRODUCTION_SETUP.md`](./META_ADS_PRODUCTION_SETUP.md).
3. **App Review → Permissions and Features**: ensure the app can request
   `ads_read`, `ads_management`, `leads_retrieval`, `pages_show_list`,
   `pages_read_engagement`, `instagram_basic` (system user or the connecting admin must
   hold them). `public_profile`/`email` are not requested — unsupported for System User
   tokens. With a Facebook Login for Business configuration
   (`META_OAUTH_CONFIG_ID`), permissions come from the configuration instead of `scope`
   — see [`META_ADS_PRODUCTION_SETUP.md`](./META_ADS_PRODUCTION_SETUP.md) §3.
4. **Webhooks**: subscribe the `leadgen` field pointing at
   `${BACKEND_URL}/api/v1/webhooks/meta/leadgen` (verify handshake unchanged).
5. Set `META_ADS_SETTINGS_KEY` (and the `META_RATE_LIMIT_*` vars if tightening) in the
   **server** env file — placeholder only in `backend/.env.example`. Optionally set
   `META_OAUTH_CONFIG_ID` to switch the authorize URL to Facebook Login for Business
   (`config_id` instead of `scope`).

---

## 5. Testing

| Suite | Tests |
| --- | --- |
| `backend/tests/meta-ads-phase1.test.js` (new) | 34 |
| `backend/tests/meta-step0-batch-verify.test.js` (new) | 16 |
| `backend/tests/meta-rate-limits.test.js` (new, isolated limiter store) | 4 |
| `phase11-meta-ads` + `phase12-meta-lead-sync` (regression, updated mocks) | 35 |
| 6 Meta/secrets suites combined | **113/113** |
| Full backend suite | **38 suites / 750 tests, all pass** |
| Frontend (root `npm test`, vitest) | **11/11 pass** |

Coverage highlights: env-vs-db precedence, decrypt-failure fail-closed (no env fallback, no
Meta call), token only in the `Authorization` header (URL assertions), encrypted-at-rest
round-trip + wrong-key/tamper rejection, no secrets in responses/audit/logs, OAuth state
sign/verify/tamper/expiry, callback session + RBAC gates, safe 302 flags (code/state never
reflected), server-side exchange, multi-Page allow-list + legacy env fallback + row-secret
authority, batch isolation counts + transient-vs-permanent classification, all three rate
limiters incl. `Retry-After`.

Verification commands run (all passing):

- root `npm run lint` → **0 errors, 54 warnings** (identical to the pre-existing baseline)
- root `npx tsc --noEmit` → exit 0
- root `npm run build` → compiled successfully; route `/dashboard/marketing/meta-ads/settings` present
- `npx prisma validate` → schema valid
- `npm run check:secrets` (backend) → 608 files scanned, passed
- backend `node --check` on every touched file → clean

---

## 6. NOT VERIFIED (honest limits)

- **Live Meta behavior is NOT VERIFIED.** Everything above runs against mocked
  `fetch`/Prisma. No live OAuth handshake, no live token exchange, no live Graph discovery,
  and no real Meta webhook delivery has been exercised from this environment.
- The real redirect flow (session cookie across the Meta round-trip, `SameSite=Lax` on the
  actual domain) and the app's Facebook Login/redirect-URI configuration need a staging pass
  against a real Meta app.
- Rate-limit counters are in-memory per process (fine for a single API instance; a
  multi-instance deployment would need a shared store to enforce global per-IP budgets).
- Instagram discovery pages through `me/accounts` only (limit 100); no cursor pagination for
  that list yet.
- Production migration has **not** been run. When approved, deploy with:
  `npx prisma migrate deploy` (backend, after a verified DB backup) — never `migrate dev` on
  production, never destructive prisma commands.

## 7. Safety confirmations

- No ads created, no campaigns/ad sets/creatives/forms written, **no ad spend capability**
  exists (read-only routes only; write routes are absent by design).
- No production DB or env changes; no `migrate deploy` executed.
- No commits, no pushes, no deploys performed for this work — the tree holds uncommitted
  Step 0 + Phase 1 changes awaiting review.
- No secrets, keys or token values appear in this document, the code, logs, audit metadata
  or API responses.
