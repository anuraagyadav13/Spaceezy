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
   `instagram_basic`, `public_profile` (the connecting admin/system user must hold them).
5. **Webhooks**: subscribe the `leadgen` field to
   `https://spaceezy.com/api/v1/webhooks/meta/leadgen` (verify handshake unchanged).

The full callback path is also documented in
[`META_ADS_PHASE1.md`](./META_ADS_PHASE1.md) §4 (`${BACKEND_URL}/api/v1/meta-ads/oauth/callback`)
and [`META_ADS_CREDENTIAL_MANAGEMENT.md`](./META_ADS_CREDENTIAL_MANAGEMENT.md)
(manual Meta Developer configuration). All three references are the same URL.

---

## 3. Troubleshooting: "Can't load URL — The domain of this URL isn't included in the app's domains"

This error is produced **by Meta's dialog**, meaning the app-side console configuration is
incomplete. SpaceEzy cannot fix it automatically and deliberately never rewrites your
production URLs or credentials.

| Symptom | Fix |
| --- | --- |
| `Can't load URL … isn't included in the app's domains` | Add the **App Domain** (`spaceezy.com`) in *Settings → Basic → App Domains*. |
| `redirect_uri does not match...` / `URL Blocked` during connect | Add the **exact** redirect URI (`https://spaceezy.com/api/v1/meta-ads/oauth/callback`) in *Facebook Login → Settings → Valid OAuth Redirect URIs*. |
| Error persists after saving | Meta caches app settings for a few minutes — retry after saving; confirm you edited the **same app id** shown in Section A of the settings page. |
| Diagnostic reports `consistent: false` | The server env (`BACKEND_URL` / `FRONTEND_URL`) is missing, relative, non-HTTPS or domain-mismatched — fix the env on the server (ops task), then restart the backend. |

---

## 4. Admin-only configuration diagnostic

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
| `consistent` | `true` when all values are internally consistent. |
| `issues` | Human-readable reasons when `consistent` is `false` (missing/relative/non-HTTPS `BACKEND_URL`, missing/relative `FRONTEND_URL`, backend/frontend domain mismatch, redirect URI drift). |
| `troubleshooting` | The message explaining that **App Domains** *and* **Valid OAuth Redirect URIs** must also be configured in the Meta Developer Console. |

Safety properties (covered by tests in
`backend/tests/meta-oauth-diagnostics.test.js`):

- **Read-only** — the diagnostic derives everything from `BACKEND_URL` / `FRONTEND_URL`
  and never modifies any configured URL or credential.
- **No secrets** — the payload contains only the seven fields above; no App Secret, no
  access token, no settings key.
- **Admin-only** — `ADMIN`/`SUPER_ADMIN` only; managers/executives get `403`,
  anonymous callers `401`.

---

## 5. Server environment reference

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

Changing `BACKEND_URL` or `FRONTEND_URL` **requires a matching update in the Meta
Developer Console** (both fields in §2) — re-run the diagnostic afterwards to confirm
`consistent: true`.

---

## 6. Related documents

- [`META_ADS_PHASE1.md`](./META_ADS_PHASE1.md) — OAuth flow architecture, route table, rate limits.
- [`META_ADS_CREDENTIAL_MANAGEMENT.md`](./META_ADS_CREDENTIAL_MANAGEMENT.md) — Settings UI sections A–E, env-var rationale.
- [`AWS_DEPLOYMENT.md`](./AWS_DEPLOYMENT.md) — server deployment procedure (§9).
