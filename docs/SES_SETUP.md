# Amazon SES Setup for SpaceEzy CRM

Required one-time AWS setup for the password-reset email flow
(`SES_FROM_EMAIL` / `SES_FROM_NAME` / `AWS_REGION`).

The application side is complete and reads only three environment variables.
It never holds AWS keys: credentials come from the AWS default provider chain
(the EC2 instance role in production), exactly like the existing S3 media
bucket.

## 0. Verified status (as of 2026-11-04)

Confirmed from the instance with read-only API calls (no email sent):

| Item | Status |
|---|---|
| Region | `ap-south-1` |
| Role assumed by the instance | `SpaceEzyEC2MediaRole` (via IMDSv2) |
| Sending domain `spaceezy.com` | Verified; DKIM RSA 2048-bit; custom MAIL FROM `mail.spaceezy.com` |
| SES production access | Enabled (sandbox exited) |
| IAM policy | `SpaceEzySESSendingPolicy` attached |
| Test send (`admin@spaceezy.com`) | **HTTP 200 + MessageId** — proven working |
| Send as `no-reply@spaceezy.com` | ⚠️ **NOT yet proven** — see §4a |

⚠️ **The successful test does NOT prove `no-reply@spaceezy.com` is authorized.**
It exercised a *different* identity (`admin@`), and IAM `Resource` blocks are
per-identity. The instance role also cannot read its own policy
(`iam:GetRolePolicy`, `ses:GetEmailIdentity`, `ses:GetAccount` all return
`AccessDenied` from the role itself), so authorization for the intended
production sender must be confirmed either in the IAM console or with one
real send from `no-reply@spaceezy.com`. See §4a.

---

## 1. Region

SES must be used in the region where the sender identity is verified.

| Variable | Value on this stack |
|---|---|
| `AWS_REGION` | `ap-south-1` (already set — same as S3) |

SES is **regional and independent per region**: a domain verified in
`ap-south-1` is not usable from `us-east-1`. Keep everything on `ap-south-1`.

---

## 2. Verify a sender identity

Either one works; a **domain** is strongly preferred (it covers every
`*@spaceezy.com` address at once).

**Option A — domain `spaceezy.com` (recommended)**

1. SES console → *Email identities* → *Create identity* → **Domain** →
   `spaceezy.com`.
2. Publish the DNS records it gives you. DNS for this domain is on
   **Cloudflare**, so add them there:
   - **TXT** `amazonses.<token>` → domain ownership
   - **DKIM** three **CNAME** `_amazonses._domainkey…` records
   - **MX** `10 inbound-smtp.<region>.amazonaws.com` — only needed if you want
     bounces/complaints by mail; recommended.
3. Wait for *Verified* / *Enabled* on DKIM.

**Option B — a single address** (faster to trial):

1. *Create identity* → **Email address** → `no-reply@spaceezy.com`.
2. Click the confirmation link in the verification email sent to that inbox.

> `SES_FROM_EMAIL=no-reply@spaceezy.com` must be either a verified email
> identity or an address inside a verified domain. Anything else is rejected
> by SES on the first send.

---

## 3. Leave the sandbox

A new SES account starts in the **sandbox**: you may only send *to* verified
addresses, at 1 message/second and 200/24h.

1. SES console → *Account dashboard* → **Request production access**.
2. Fill in the use case (transactional password-reset mail for CRM users) and
   submit — AWS usually answers within 24h.

Until production access exists, the flow still works for **verified**
addresses only; every other recipient is rejected and logged as
`[email] failed … MessageRejected`.

---

## 4. IAM permissions (EC2 instance role)

Attach to the role already attached to the instance (the same one the S3
`uploads`/`db-backups` bucket uses). Replace `<account-id>` and, if you verify
a single address instead of the domain, adjust the `Resource`.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "SpaceEzySesSendTransactional",
      "Effect": "Allow",
      "Action": [
        "ses:SendEmail",
        "ses:SendRawEmail"
      ],
      "Resource": [
        "arn:aws:ses:ap-south-1:<account-id>:identity/spaceezy.com",
        "arn:aws:ses:ap-south-1:<account-id>:identity/no-reply@spaceezy.com"
      ]
    },
    {
      "Sid": "SpaceEzySesAccountRead",
      "Effect": "Allow",
      "Action": [
        "ses:GetAccount",
        "ses:GetIdentityDkimAttributes",
        "ses:GetIdentityVerificationAttributes"
      ],
      "Resource": "*"
    }
  ]
}
```

Notes:

- **Do not** add `ses:*`, and **never** put `AWS_ACCESS_KEY_ID` /
  `AWS_SECRET_ACCESS_KEY` in `.env` — the SDK resolves the instance profile by
  itself. The repo's secret scan rejects committed keys.
- Scoping `Resource` to the verified identity means the role cannot send from
  any other domain.
- No change to the security group is required: SES is an *outbound* HTTPS
  call to `*.amazonaws.com`, and the instance already reaches the internet for
  S3.

### 4a. Verify the sender is actually authorized (required)

The working test used `admin@spaceezy.com`. Production will send as
`no-reply@spaceezy.com`. IAM `Resource` entries are per-identity, so **verify
the policy text covers the intended sender** before going live:

1. IAM console → roles → `SpaceEzyEC2MediaRole` → inline/attached policies →
   confirm `SpaceEzySESSendingPolicy` has `ses:SendEmail` on **both**:
   ```json
   "Resource": [
     "arn:aws:ses:ap-south-1:<account-id>:identity/spaceezy.com",
     "arn:aws:ses:ap-south-1:<account-id>:identity/no-reply@spaceezy.com"
   ]
   ```
   A `Resource` of only `identity/admin@spaceezy.com` (or only the domain
   without the address, when sending from a bare address) will fail with
   `AccessDeniedException` at the first production send.
2. Because the domain `spaceezy.com` is verified, `no-reply@spaceezy.com`
   is a valid *SES* sender; only the *IAM* check remains.
3. Optional belt-and-braces: one real send as `no-reply@spaceezy.com` before
   wiring it into `.env.production` (this task deliberately did not send one).

Note: the role **cannot** self-verify — `ses:GetAccount`,
`ses:GetEmailIdentity`, `iam:GetRolePolicy` and `iam:SimulatePrincipalPolicy`
all return `AccessDenied` when called *as the instance role*. Policy inspection
must be done from an admin identity (console or admin credentials).

---

## 5. Environment variables on the server

Add to **`/opt/spaceezy/backend/.env.production`** (server-side only, never
committed):

```bash
AWS_REGION=ap-south-1
SES_FROM_EMAIL=no-reply@spaceezy.com
SES_FROM_NAME=SpaceEzy

# Optional — only if you create a configuration set for bounce/complaint
# tracking:
# SES_CONFIGURATION_SET=
```

Then recreate the API container so it picks them up:

```bash
docker compose -f docker-compose.production.yml --env-file .env.production up -d express
```

Rate limits (optional, defaults shown) may also be tuned there:

```bash
RESET_RATE_LIMIT_IP_MAX=10
RESET_RATE_LIMIT_ACCOUNT_MAX=5
RESET_RATE_LIMIT_VERIFY_IP_MAX=20
RESET_RATE_LIMIT_RESET_IP_MAX=10
```

**Behaviour when unset:** `SES_FROM_EMAIL` empty disables outbound email.
`POST /auth/forgot-password` still returns its generic 200 (so it cannot be
used to probe for accounts) but nothing is delivered and the server logs
`EMAIL_NOT_CONFIGURED`. `POST /auth/reset-password` reports
`confirmationEmailSent: false`.

---

## 6. Verification checklist

Run in order after the identity is verified and the container restarted:

1. **Identity / policy state** — the AWS CLI is **not installed** on the
   instance (and this task did not install it). Either inspect in the IAM/SES
   console, or use the existing `botocore` with a short read-only script
   (pattern already used: `botocore.session.get_session().create_client(...)`).
   Do not `pip install` anything on the box.
2. **Config seen by the app** — the API must report a configured sender; if it
   is missing, `SES_FROM_EMAIL` did not reach the container.
3. **One real send** — trigger the flow for a real CRM user's address and
   confirm the message arrives with the 6-digit code and a 5-minute notice.
4. **Server logs** — expect `[email] sent {… messageId …}` and **no** code, no
   raw address, no key material:
   ```bash
   docker logs spaceezy-express 2>&1 | grep '\[email\]'
   ```
5. **Negative path** — a deliberately wrong code must return the generic
   `INVALID_RESET_CODE`, never an account-existence hint.
6. **Quota/suppression** — check the *Suppression list*: an address that
   previously bounced is silently skipped by SES (the send still "succeeds"),
   so keep bounce handling visible via a configuration set if this matters.

---

## 7. Rollback

Unsetting the variable is a complete rollback — no code change, no migration:

```bash
# in /opt/spaceezy/backend/.env.production
# remove or comment out SES_FROM_EMAIL
docker compose -f docker-compose.production.yml --env-file .env.production up -d express
```

Outbound mail stops immediately; the endpoints keep answering generically.

---

## 8. Costs

SES is billed per 1,000 messages (~$0.10/1,000 in ap-south-1) plus a small
data charge. Password-reset volume at CRM scale is negligible; there is no
fixed monthly fee.

---

## 9. Production deployment sequence (requires approval — NOT executed)

Nothing below has been run. Each step is a production change and needs an
explicit go-ahead.

1. **Commit the work** (currently uncommitted, HEAD `8580c8c`) and push a
   branch / open a PR. Review the diff: backend password-reset + SES service,
   new `PasswordReset` migration, frontend forgot-password screens.
2. **Confirm IAM** covers `no-reply@spaceezy.com` (§4a) — admin console check.
3. **Take and verify a DB backup** before any migration:
   ```bash
   docker exec spaceezy-postgres pg_dump -U <user> -d spaceezy | gzip > \
     /opt/spaceezy/backups/pre-ses-$(date -u +%Y%m%dT%H%M%SZ).sql.gz
   # verify: gunzip -t … && zcat … | grep -c CREATE   (expect > 0)
   ```
4. **Merge to `main`**, then on the server:
   ```bash
   cd /opt/spaceezy && git pull
   docker compose -f docker-compose.production.yml --env-file .env.production build
   ```
5. **Apply the migration with `prisma migrate deploy`** (additive only — one
   table `PasswordReset` + unique/index/FK; no DROP/TRUNCATE):
   ```bash
   docker compose -f docker-compose.production.yml --env-file .env.production run --rm express \
     npx prisma migrate deploy
   ```
6. **Add the env vars** to `/opt/spaceezy/backend/.env.production`
   (`AWS_REGION`, `SES_FROM_EMAIL=no-reply@spaceezy.com`, `SES_FROM_NAME=SpaceEzy`)
   — then:
   ```bash
   docker compose -f docker-compose.production.yml --env-file .env.production up -d express next
   ```
7. **Verify**: `/api/v1/health` → 200; one real forgot-password run; check
   `docker logs spaceezy-express | grep '\[email\]'` shows `[email] sent` with
   a MessageId and **no** OTP/credentials; wrong code → generic
   `INVALID_RESET_CODE`.
8. **Rollback** if needed: unset `SES_FROM_EMAIL` (§7); the migration is
   additive so it can stay in place safely.
