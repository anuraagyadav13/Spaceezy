# Meta Ads — Production Setup (OAuth App Domain & Redirect URI)

This guide covers the **manual Meta Developer Console configuration** required for the
Meta Ads OAuth connect flow in production, and the admin-only diagnostic inside SpaceEzy
that tells you exactly what to enter.

> **Never commit secrets.** No App Secret, access token or encryption key belongs in this
> document, in the repository, or in any client-visible bundle. SpaceEzy stores them only
> in the server environment / encrypted database columns and never returns them.

---

## 1. The exact URL Meta must be told about

SpaceEzy builds the OAuth `redirect_uri` from **one source of truth** — `BACKEND_URL`
plus the registered callback route:

```
<BACKEND_URL>/api/v1/meta-ads/oauth/callback
```

The **same value** is used when the connection is initiated (`GET …/dialog/oauth`) and
when the authorization code is exchanged server-side (`GET …/oauth/access_token`), and
it resolves to the callback route registered before `requireAuth()` in
`backend/src/routes/metaAds.js`.

### Production (spaceezy.com)

With the production environment values:

| Item | Value |
| --- | --- |
| **App Domain** (Meta → Settings → Basic → *App Domains*) | `spaceezy.com` |
| **OAuth Redirect URI** (Facebook Login → Settings → *Valid OAuth Redirect URIs*) | `https://spaceezy.com/api/v1/meta-ads/oauth/callback` |
| **Frontend URL** (`FRONTEND_URL`) | `https://spaceezy.com` |
| **Backend URL** (`BACKEND_URL`) | `https://spaceezy.com` |
| Webhook callback (Webhooks → `leadgen`) | `https://spaceezy.com/api/v1/webhooks/meta/leadgen` |

**The administrator must register this exact callback URL in Meta:**

```
https://spaceezy.com/api/v1/meta-ads/oauth/callback
```

Notes:

- The redirect URI must match **exactly** — scheme (`https`), host and path. Meta rejects
  trailing-slash or path variations.
- If the site is also served from `www`, add `www.spaceezy.com` as an additional App
  Domain (the webhook callback and OAuth redirect always come from `BACKEND_URL`, i.e. the
  apex value above).

---

## 2. Meta Developer Console steps (manual, outside this repo)

1. Go to [developers.facebook.com](https://developers.facebook.com) → **My Apps** → your
   SpaceEzy app.
2. **Settings → Basic → App Domains** → add `spaceezy.com` → **Save Changes**.
3. **Facebook Login → Settings → Valid OAuth Redirect URIs** → add
   `https://spaceezy.com/api/v1/meta-ads/oauth/callback` → **Save**.
4. **App Review → Permissions and Features**: ensure the app can request `ads_read`,
   `ads_management`, `leads_retrieval`, `pages_show_list`, `pages_read_engagement`,
   `instagram_basic` (the connecting admin/system user must hold them). `public_profile`
   and `email` are **not** requested — they are unsupported for System User tokens
   (see §3).
5. **Webhooks**: subscribe the `leadgen` field to
   `https://spaceezy.com/api/v1/webhooks/meta/leadgen` (verify handshake unchanged).

The full callback path is also documented in
[`META_ADS_PHASE1.md`](./META_ADS_PHASE1.md) §4 (`${BACKEND_URL}/api/v1/meta-ads/oauth/callback`)
and [`META_ADS_CREDENTIAL_MANAGEMENT.md`](./META_ADS_CREDENTIAL_MANAGEMENT.md)
(manual Meta Developer configuration). All three references are the same URL.

---

## 3. Facebook Login for Business configuration (`config_id`)

SpaceEzy supports Meta's **Facebook Login for Business** flow. When the server env sets:

```
META_OAUTH_CONFIG_ID=2088777191773830
```

the authorize URL (`GET …/dialog/oauth`) is built as:

| Parameter | Value |
| --- | --- |
| `client_id` | the saved Meta App ID |
| `redirect_uri` | `https://spaceezy.com/api/v1/meta-ads/oauth/callback` — unchanged, single source of truth |
| `response_type` | `code` — unchanged |
| `state` | HMAC-signed, 10-minute TTL — unchanged |
| `config_id` | value of `META_OAUTH_CONFIG_ID` — **replaces `scope`** (Meta: `scope` "should not be used" with a configuration; permissions come from the configuration) |
| `override_default_response_type` | `true` — required for **System User** token configurations |

When `META_OAUTH_CONFIG_ID` is unset or blank, the legacy `scope=…` flow is used
instead — no behavior change for deployments that have not adopted a configuration.

### Token type: System User (as configured)

- The `meta ads` configuration (ID `2088777191773830`) was saved with token type
  **System User**. Tokens issued through it are **non-expiring by default**; the
  callback stores `tokenExpiresAt: null` when Meta omits `expires_in`.
- Login must be performed by a person with access to the **business portfolio** the
  configuration belongs to.
- The token only sees **assets selected in the configuration** — attach the ad accounts,
  Facebook Pages and Instagram accounts SpaceEzy should manage in the Meta app dashboard
  (Facebook Login for Business → configuration → assets), or Graph reads will come back
  empty.
- **Token exchange is unchanged**: `GET /{version}/oauth/access_token` with `client_id`,
  `client_secret`, `redirect_uri` (must match exactly) and `code`.
- **Credential storage is unchanged**: AES-256-GCM under `META_ADS_SETTINGS_KEY`
  (`accessTokenEnc`); the token never appears in URLs, logs or API responses.

### Configuration checklist (Meta app dashboard + server env)

1. Facebook Login for Business → use configuration **`meta ads`**
   (ID `2088777191773830`) with permissions `ads_read`, `ads_management`,
   `leads_retrieval`, `pages_show_list`, `pages_read_engagement`, `instagram_basic`.
2. Token type: **System User**.
3. Assets: the ad accounts, Pages and Instagram accounts to manage.
4. Set `META_OAUTH_CONFIG_ID=2088777191773830` in the server env — a **manual ops step**;
   SpaceEzy never edits production env automatically — then restart the backend and run
   the admin diagnostic (§5) to confirm `oauthMode: "config_id"`.
5. Reconnect the Meta account from Marketing → Meta Connection → Settings.

> WhatsApp Embedded Signup uses its **own, separate** configuration
> (`WA_ES_CONFIG_ID` in `src/lib/whatsappEmbeddedSignup.js`) and is unaffected by
> `META_OAUTH_CONFIG_ID`.

---

## 4. Troubleshooting: "Can't load URL — The domain of this URL isn't included in the app's domains"

This error is produced **by Meta's dialog**, meaning the app-side console configuration is
incomplete. SpaceEzy cannot fix it automatically and deliberately never rewrites your
production URLs or credentials.

| Symptom | Fix |
| --- | --- |
| `Can't load URL … isn't included in the app's domains` | Add the **App Domain** (`spaceezy.com`) in *Settings → Basic → App Domains*. |
| `redirect_uri does not match...` / `URL Blocked` during connect | Add the **exact** redirect URI (`https://spaceezy.com/api/v1/meta-ads/oauth/callback`) in *Facebook Login → Settings → Valid OAuth Redirect URIs*. |
| Error persists after saving | Meta caches app settings for a few minutes — retry after saving; confirm you edited the **same app id** shown in Section A of the settings page. |
| Diagnostic reports `consistent: false` | The server env (`BACKEND_URL` / `FRONTEND_URL`) is missing, relative, non-HTTPS or domain-mismatched — or `META_OAUTH_CONFIG_ID` is set but not numeric — fix the env on the server (ops task), then restart the backend. |

---

## 5. Admin-only configuration diagnostic

**UI:** Marketing → Meta Connection → **Settings** → *OAuth configuration diagnostic*
(admins / super-admins only; non-admins never see the card and the API returns `403`).

**API:** `GET /api/v1/meta-ads/settings/oauth-diagnostics` (admin-only).

The diagnostic reports:

| Field | Meaning |
| --- | --- |
| `appDomain` | Host to enter in Meta's *App Domains* (leading `www.` stripped). |
| `oauthRedirectUri` | Exact URI to enter in *Valid OAuth Redirect URIs* — identical to the `redirect_uri` used for initiation and token exchange. |
| `frontendUrl` | The configured `FRONTEND_URL`. |
| `backendUrl` | The configured `BACKEND_URL` (the value `redirect_uri` is built from). |
| `oauthConfigId` | The `META_OAUTH_CONFIG_ID` in effect (public OAuth metadata — it appears in the authorize URL), or `null` when unset. |
| `oauthMode` | `"config_id"` (Facebook Login for Business — authorize URL sends `config_id`, no `scope`) or `"legacy_scopes"` (scope-based flow). |
| `oauthFlowNote` | Human-readable explanation of the authorization mode in effect, including the System User non-expiring-token note. |
| `consistent` | `true` when all values are internally consistent. |
| `issues` | Human-readable reasons when `consistent` is `false` (missing/relative/non-HTTPS `BACKEND_URL`, missing/relative `FRONTEND_URL`, backend/frontend domain mismatch, redirect URI drift, malformed `META_OAUTH_CONFIG_ID`). |
| `troubleshooting` | The message explaining that **App Domains** *and* **Valid OAuth Redirect URIs** must also be configured in the Meta Developer Console. |

Safety properties (covered by tests in
`backend/tests/meta-oauth-diagnostics.test.js`):

- **Read-only** — the diagnostic derives everything from `BACKEND_URL` / `FRONTEND_URL`
  and `META_OAUTH_CONFIG_ID` and never modifies any configured URL or credential.
- **No secrets** — the payload contains only the ten fields above; no App Secret, no
  access token, no settings key. (`oauthConfigId` is public metadata, not a secret.)
- **Admin-only** — `ADMIN`/`SUPER_ADMIN` only; managers/executives get `403`,
  anonymous callers `401`.

---

## 6. Server environment reference

Set in `backend/.env.production` on the server (see `backend/.env.example` for the full
list and [`META_ADS_CREDENTIAL_MANAGEMENT.md`](./META_ADS_CREDENTIAL_MANAGEMENT.md) for
why each stays deployment-only):

| Variable | Production value |
| --- | --- |
| `BACKEND_URL` | `https://spaceezy.com` |
| `FRONTEND_URL` | `https://spaceezy.com` |
| `CORS_ORIGINS` | `https://spaceezy.com,https://www.spaceezy.com` |
| `META_ADS_SETTINGS_KEY` | 64-hex AES-256-GCM key (server-only, `chmod 600`) |
| `META_APP_ID` / `META_APP_SECRET` | Legacy env fallbacks — prefer saving them in Settings → Section A (encrypted) |
| `META_OAUTH_CONFIG_ID` | Optional: Facebook Login for Business configuration id (e.g. `2088777191773830`) — blank = legacy `scope` flow. Set manually; SpaceEzy never writes production env (§3). |

Changing `BACKEND_URL` or `FRONTEND_URL` **requires a matching update in the Meta
Developer Console** (both fields in §2) — re-run the diagnostic afterwards to confirm
`consistent: true`.

---

## 7. Related documents

- [`META_ADS_PHASE1.md`](./META_ADS_PHASE1.md) — OAuth flow architecture, route table, rate limits.
- [`META_ADS_CREDENTIAL_MANAGEMENT.md`](./META_ADS_CREDENTIAL_MANAGEMENT.md) — Settings UI sections A–E, env-var rationale.
- [`AWS_DEPLOYMENT.md`](./AWS_DEPLOYMENT.md) — server deployment procedure (§9).
