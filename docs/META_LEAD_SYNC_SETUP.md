# Meta Lead Ads — Webhook Setup & Test Guide (SpaceEzy CRM)

All values below are placeholders. Real credentials live ONLY in the
server env file (`backend/.env.production`) — never in git, never in the
database, never in logs.

## 1. Meta app prerequisites

- A Meta Business app with the **Marketing API** product added.
- A Facebook **Page** owned by SpaceEzy's Business account (note its Page ID).
- A system-user or admin **access token** with at least:
  `ads_read`, `pages_show_list`, `pages_read_engagement`,
  `pages_manage_ads`, `leads_retrieval`.
- The app's **App Secret** (App Settings → Basic) for webhook signatures.

## 2. Server configuration

Set in `backend/.env.production` (then rebuild + restart `express`):

```sh
META_APP_ID=<meta-app-id>
META_APP_SECRET=<meta-app-secret>
META_ACCESS_TOKEN=<long-lived-token-with-ads_read>
META_AD_ACCOUNT_ID=<digits-only>
META_PAGE_ID=<spaceezy-page-id>
META_GRAPH_VERSION=v22.0
META_WEBHOOK_VERIFY_TOKEN=<output-of: openssl rand -hex 32>
```

Verify without Meta: `GET /api/v1/meta-ads/status` as an admin should
return `connected: true`. Any other result names the exact missing piece
(`MISSING_CONFIG`, `TOKEN_INVALID`, `PERMISSION_DENIED`).

## 3. Webhook subscription (Meta App Dashboard → Webhooks)

- Callback URL: `https://<BACKEND_URL>/api/v1/webhooks/meta/leadgen`
- Verify token: the exact `META_WEBHOOK_VERIFY_TOKEN` value.
- Click **Verify and save** (expects HTTP 200 echoing the challenge).
- Subscribe the Page to the **`leadgen`** field (Page Settings →
  Advanced Messaging → Webhooks, or the app's Webhooks product page).

## 4. Controlled test with a Meta test lead

1. In the dashboard, use **Send to server** on the `leadgen` sample, or
   submit a real test Lead Ad form as a test user.
2. Expect HTTP 200 with `{ ok: true, processed: 1, ... }`. Synthetic
   numbers with no CRM match resolve to `{ ignored: 'no_lead' }` — nothing
   is persisted and no conversation is invented.
3. In the CRM, confirm: Leads list shows `source = Meta` with campaign
   context; the lead timeline has a sync NOTE; AuditLog has
   `meta.lead_sync` (IDs only, no PII).
4. Duplicate deliveries: re-sending the same event must return
   `{ duplicate: true }` without creating a second lead (unique
   `(organizationId, metaLeadId)`).

## 5. Diagnosing failures

| Symptom | Meaning | Fix |
|---|---|---|
| Verify returns 403 | verify-token mismatch | match dashboard value to env exactly |
| POST returns 401 | bad/missing HMAC signature or app secret | confirm `META_APP_SECRET`; check proxy preserves raw body |
| POST returns 400 `PAGE_MISMATCH` | event page ≠ `META_PAGE_ID` | subscribe the correct Page |
| POST returns 503 | `META_PAGE_ID` unset | set it; no data is written in this state |
| POST returns 429/504 | Meta throttled/timed out | Meta retries automatically; do not resubmit manually |
| 200 with `ignored: 'no_lead'` / `'no_identity'` | no matching lead / no phone | expected for synthetic traffic |

## 6. Production rollout notes

- Deploy code first, then `prisma migrate deploy` for
  `20261012130000_meta_lead_attribution` (additive, nullable — existing
  rows unaffected). Verify with `SELECT` on the new columns.
- Keep a verified `pg_dump` from immediately before the deploy.
- Rollback is forward-fix preferred; the migration has no destructive
  inverse (columns are nullable and ignored by old code).
