# Meta Ads — Frontend Credential Management (Settings Sections A–E)

Mirrors the WhatsApp Settings architecture: all Meta integration credentials
and webhook configuration are manageable from the CRM, with no `.env` edits
required after initial deployment.

## UI sections

`src/app/dashboard/marketing/meta-ads/settings/page.jsx`

| Section | Contents |
| --- | --- |
| **A. Meta App Credentials** | Meta App ID, App Secret, Access Token, Graph API version — save form (admins) or masked read-only status (viewers). |
| **B. Webhook Configuration** | Webhook Verify Token input, App-Share signature secret (shared with A, rotate shortcut), read-only callback URL generated from `BACKEND_URL` (copy button), subscription status from the last webhook test. |
| **C. Account & Asset Configuration** | Existing selection UIs (ad accounts, Facebook Pages, Instagram accounts), token expiry in the Connection card, and **granted-permissions chips** from `/status`. |
| **D. Connection Testing** | Test Meta API connection · Test access token · Check permissions · Test webhook — each renders the server envelope (`ok`, `code`, `message`, granted/missing permission sets, subscription state, token expiry). |
| **E. Credential Management** | Per-credential status + **Remove** (two-click in-page confirmation), **Rotate** panel (field selector + new value), **Reconnect Meta account** (OAuth), Save. |

Access control in the UI: credential forms, tests, rotate/remove are gated by
`hasRole(["SUPER_ADMIN", "ADMIN"])` (`isAdmin`). `marketing:view` users see
read-only masked status chips. The server enforces the same rules with
`adminOnly()` on every mutating route.

## Backend

- `MetaAdsSettings` gains `metaAppId` (plain — public OAuth metadata, exactly
  like `WhatsappSettings.appId`) and `webhookVerifyTokenEnc` (AES-256-GCM
  envelope). Migration: `20261106120000_meta_app_credentials` (additive only).
- Secrets (App Secret, Access Token, Webhook Verify Token) are encrypted with
  the shared `whatsappSecrets` AES-256-GCM utility under the **separate**
  `META_ADS_SETTINGS_KEY` — never the WhatsApp key, never plaintext, server-side
  only.
- `GET /meta-ads/settings` returns boolean flags only:
  `hasAccessToken`, `hasAppSecret`, `hasWebhookVerifyToken` — plus `metaAppId`
  (public), `webhookCallbackUrl`, selections and expiry. Blank secret fields on
  `PUT` retain saved values; removal only via `DELETE /meta-ads/settings/secrets/:field`.
- New service methods: `rotateSecret`, `removeSecret`, `verifyWebhookToken`
  (row-first, timing-safe, fail-closed), `testConnection`, `testToken`,
  `testPermissions`, `testWebhook` (local HMAC self-test + best-effort
  subscription lookup; tokens never in URLs — app token `appId|appSecret`
  travels in the `Authorization` header).
- Routes (all `adminOnly()` + `metaConnectLimiter`):
  `PUT /settings`, `POST /settings/rotate`, `DELETE /settings/secrets/:field`,
  `POST /settings/test-connection|test-token|test-permissions|test-webhook`.
  `GET /settings` stays `marketing:view`; sync/oauth stay `marketing:manage`.
- Webhook `GET` verification now resolves through
  `MetaAdsSettingsService.verifyWebhookToken`: a settings row is authoritative
  (stored verify token; decryption failure → 403, never env fallback); legacy
  env applies **only** when no row exists. HMAC-SHA256 for POST deliveries uses
  the stored App Secret with the same precedence.
- Audit actions: `meta.secret_rotated`, `meta.secret_removed`,
  `meta.connection_tested` (plus existing `meta.settings_updated`) — field
  names and codes only, never values.
- `createAuthorizeUrl()` is now async: the effective App ID comes from the row
  when one exists (row authoritative — no env fallback), else `META_APP_ID`.
- `REQUIRED_PERMISSIONS` / `RECOMMENDED_PERMISSIONS` live in
  `metaAdsSettingsService` (single source of truth); `metaAdsService` consumes
  them and `/status` now reports `grantedPermissions` (names only).

## Deployment-only environment variables

Why these stay in `backend/.env` (documented in `backend/.env.example`):

| Variable | Reason |
| --- | --- |
| `META_ADS_SETTINGS_KEY` | The AES-256-GCM encryption key. Must never be reachable from the frontend or stored in the database it protects — moving it into CRM settings would defeat encryption at rest. |
| `BACKEND_URL` / `FRONTEND_URL` | Deployment topology (webhook callback + OAuth redirect targets). Must match the real deployment, not an org-editable value, or Meta deliveries/OAuth would break. |
| `META_AD_ACCOUNT_ID`, `META_PAGE_ID` | Legacy defaults used **only** until the first settings row exists; afterwards the CRM selection is authoritative. Kept for backward compatibility. |
| `META_GRAPH_VERSION` | Deployment default; overridable per row in the CRM. |
| `META_RATE_LIMIT_*` | Operational tuning knobs. |
| `SESSION_COOKIE_NAME`, DB/session vars | Platform configuration, unrelated to Meta. |

**Legacy fallback:** `META_APP_ID`, `META_APP_SECRET`, `META_ACCESS_TOKEN` and
`META_WEBHOOK_VERIFY_TOKEN` remain supported for env-configured deployments
(no settings row). Once a row exists the row is authoritative and these are
ignored — admins manage them in Marketing → Meta Connection → Settings instead.

## Manual Meta Developer configuration (not automatable)

1. In Meta App Dashboard → **Webhooks**, subscribe the `leadgen` field to
   `<BACKEND_URL>/api/v1/webhooks/meta/leadgen`, using the CRM's verify token
   (Section B) — the callback URL is shown read-only in the UI.
2. Ensure the app has the required permissions approved
   (`ads_read`, `leads_retrieval`, `pages_show_list`, `pages_read_engagement`,
   `instagram_basic`) and the token holder has access to the ad accounts/Pages.
3. For production tokens, generate a long-lived/system-user token in Business
   Integrations and save it in Section A (or use Reconnect for the OAuth flow).

## Tests

- `backend/tests/meta-credentials.test.js` — 32 tests: individual/all saves,
  blank retention, masking, rotate/remove (+404/400), envelope round-trip, wrong
  key, missing key, stored-credential webhook verification, HMAC with stored
  App Secret, env fallback, row authority, fail-closed decrypt, four connection
  tests with mocked Meta, RBAC (exec/manager denied, admin/super-admin allowed),
  and no-leakage assertions over responses, errors, logs and audit records.
- Updated: `meta-ads-phase1.test.js` (new flag names, async authorize URL),
  `meta-step0-batch-verify.test.js` (timingSafeEqual now asserted in the
  service, controller delegates), `phase12-meta-lead-sync.test.js`.
- All Meta API calls are mocked; no ads, spend, or production endpoints are
  touched.
