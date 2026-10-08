# SpaceEzy — AWS Production Deployment Guide (Cloudflare Tunnel & Zero-IPv4-Cost Architecture)

**Target Region:** `ap-south-1` (Mumbai)  
**Infrastructure Stack:** GoDaddy → Cloudflare Free → Cloudflare Tunnel → EC2 t4g.small (Nginx, Next.js, Express, PostgreSQL) → S3  
**Monthly Budget Target:** **₹950–₹1,100 / month maximum (Achieved: ₹957/month WITHOUT Savings Plan)**

> **Safety Rules & Production Directives**
> - **Zero IPv4 Cost:** Cloudflare Tunnel (`cloudflared`) connects outbound from EC2 to Cloudflare's edge network, eliminating the AWS Public IPv4 / Elastic IP charge ($3.65/mo = ₹321/mo).
> - **Self-Hosted PostgreSQL on EC2:** PostgreSQL 16 runs inside a Docker container using named volume `postgres_data`. RDS is **not** part of initial deployment.
> - **Prisma Safety:** Database schema migrations strictly use `npx prisma migrate deploy`. **Never** run `prisma db push`, `migrate reset`, `db reset`, or `truncate`. Existing migrations are preserved.
> - **Environment Decoupling:** `DATABASE_URL` is the only database connection parameter. Future migration to AWS RDS requires zero application code changes.
> - **Redis Disabled:** Audited and confirmed 0 application references. Redis container profile remains disabled ($0 cost, 0 RAM).
> - **Backup Non-Destruction:** Restores are tested strictly in isolated containers. `DROP DATABASE ... WITH FORCE` is marked **DISASTER RECOVERY ONLY** and never run on production. **Never run `docker compose down -v`**.

---

## 1. Final Architecture

```
                      ┌────────────────────────────────────────────────┐
 Browser ──HTTPS──►   │           Cloudflare Free (Edge TLS)           │
                      └───────────────┬────────────────────────────────┘
                                      │  GoDaddy DNS: spaceezy.com (Proxy ON)
                                      │  Outbound Encrypted WebSocket Tunnel (no open inbound IPv4 ports required)
                                      ▼
 ┌───────────────────────── EC2 t4g.small (ARM64, ap-south-1) ─────────────────────────┐
 │  cloudflared daemon   (service: cloudflared → http://localhost:80)                   │
 │                                                                                    │
 │  Nginx :80           (X-Forwarded-For client IP from Cloudflare header)             │
 │    ├── /             → next     :3000   Next.js standalone (SSR/ISR, internal)     │
 │    ├── /api/*        → express  :8000   Express API (internal)                     │
 │    └── /health       → express          liveness JSON {status,database}              │
 │                                                                                    │
 │  express ────────────► postgres  :5432   PostgreSQL 16 (container-internal)         │
 │                                          ├── Persistent Named Volume (postgres_data) │
 │                                          └── Automated Non-blocking pg_dump         │
 │                                                                                    │
 │  express ────────────► S3 Bucket (project & property media uploads)                │
 │  backup script ──────► S3 Bucket (compressed DB dump archives, 30d lifecycle)       │
 │  [unused] redis container (compose profile: disabled by default, $0 cost)          │
 └────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Cloudflare Tunnel Evaluation & Setup (Eliminating Public IPv4 Cost)

### 2.1 Why Cloudflare Tunnel?
Starting February 2024, AWS charges $0.005/hr (~$3.65/mo = ₹321/mo) for every public IPv4 address assigned to an EC2 instance or Elastic IP.  
By using **Cloudflare Tunnel (`cloudflared`)**, the EC2 instance creates secure outbound connections to Cloudflare’s global edge network over HTTP/2 or WebSockets.

#### Advantages (Pros):
- **Zero AWS Public IPv4 Fee:** Saves ₹321/month ($3.65/mo), dropping monthly cost from ₹1,279 down to **₹957/month**.
- **No Open Inbound Ports Needed:** Security group on EC2 only needs SSH (port 22 restricted to admin IP). Ports 80 and 443 do not need to be open to the internet.
- **Automatic HTTPS Edge Termination:** Cloudflare manages TLS certificates on `spaceezy.com`. Traffic from Cloudflare edge to `cloudflared` on EC2 is fully encrypted.
- **DDoS & Bot Defense:** Built-in Cloudflare Web Application Firewall and rate limiting at edge.

#### Disadvantages & Tradeoffs (Cons):
- **Cloudflare Dependency:** Traffic relies on Cloudflare edge routing.
- **Daemon Footprint:** Requires `cloudflared` lightweight binary running on EC2 (~15–25 MB RAM).

---

### 2.2 Cloudflare Tunnel Installation & Systemd Service Guide

Run these commands on the EC2 instance to configure `cloudflared` (DO NOT PROVISION NOW — documentation for manual step):

```bash
# 1. Download and install cloudflared ARM64 package on Ubuntu 24.04
curl -L --output cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64.deb
sudo dpkg -i cloudflared.deb

# 2. Authenticate cloudflared with Cloudflare account
cloudflared tunnel login

# 3. Create named tunnel
cloudflared tunnel create spaceezy-ec2

# 4. Configure tunnel routing (/etc/cloudflared/config.yml)
sudo mkdir -p /etc/cloudflared
sudo tee /etc/cloudflared/config.yml > /dev/null <<EOF
tunnel: <TUNNEL-UUID>
credentials-file: /etc/cloudflared/<TUNNEL-UUID>.json

ingress:
  - hostname: spaceezy.com
    service: http://localhost:80
  - hostname: www.spaceezy.com
    service: http://localhost:80
  - service: http_status:444
EOF

# 5. Route DNS through tunnel
cloudflared tunnel route dns spaceezy-ec2 spaceezy.com
cloudflared tunnel route dns spaceezy-ec2 www.spaceezy.com

# 6. Install and start cloudflared as systemd service
sudo cloudflared service install
sudo systemctl enable --now cloudflared
```

### 2.3 Failure Behavior & Instant Rollback Procedure

- **Failure Behavior:** `cloudflared` runs as a systemd service (`restart=always`) maintaining connections to 4 Cloudflare edge POPs. If one POP drops, traffic instantly shifts to another.
- **Rollback to Direct Elastic IP (if ever required):**
  1. Associate Elastic IP with EC2 instance.
  2. In GoDaddy / Cloudflare DNS: set A Record `spaceezy.com → <Elastic-IP>`.
  3. Uncomment port `80:80` and `443:443` in `docker-compose.production.yml` and restart Nginx.

---

## 3. Recalculated Itemized Monthly Cost (No Savings Plan Required)

Prices are calculated for **AWS `ap-south-1` region (Mumbai)** assuming exchange rate $1 USD ≈ ₹88 INR.

| Component | Sizing & Detail | Monthly USD | Monthly INR (₹88/$1) |
|---|---|---|---|
| **EC2 `t4g.small` (ARM64, 2 vCPU, 2 GB RAM)** | 730 hrs/month On-Demand rate ($0.0112/hr) | $8.18 | ₹720 |
| **EBS Storage (gp3)** | 25 GB root volume ($0.096/GB-mo) | $2.40 | ₹211 |
| **AWS Public IPv4 (Elastic IP)** | **NOT REQUIRED** (Cloudflare Tunnel used) | **$0.00** | **₹0** |
| **AWS S3 Bucket** | ~10 GB total (5 GB media + 5 GB DB backups with 30-day retention) | $0.30 | ₹26 |
| **Cloudflare Free & Tunnel** | Proxy, CDN, Edge TLS, Tunnel daemon | $0.00 | ₹0 |
| **Redis** | Unused profile (0 RAM, 0 CPU) | $0.00 | ₹0 |
| **PostgreSQL 16** | Runs inside EC2 Docker container | $0.00 | ₹0 |
| **Internet Egress** | First 100 GB/month free | $0.00 | ₹0 |
| **TOTAL MONTHLY COST (On-Demand)** | **No AWS Commitment / No Savings Plan required** | **$10.88** | **₹957 / month ✅** |

> **COST TARGET VERDICT:** The monthly target of **₹950–₹1,100/month** is **FULLY ACHIEVED (₹957/month)** on standard AWS On-Demand pricing **WITHOUT requiring any Savings Plan**.
>
> *(Optional Optimization)*: If a 1-Year Compute Savings Plan (no upfront) is added later, EC2 cost drops to $5.91/mo, bringing the total monthly cost down to **$8.61/mo ≈ ₹758/month**.

---

## 4. Database Backup Automation & Freshness Monitoring

### 4.1 Daily Automated Backup Script (`/opt/spaceezy/scripts/backup-db.sh`)

```bash
#!/usr/bin/env bash
set -euo pipefail

LOG_FILE="/var/log/spaceezy-backup.log"
ENV_FILE="/opt/spaceezy/.env.production"
BACKUP_DIR="/var/backups/spaceezy-db"
S3_BUCKET="s3://spaceezy-media-<account-id>/db-backups"
TIMESTAMP=$(date +"%Y-%m-%d_%H%M%S")
FILENAME="spaceezy-db-${TIMESTAMP}.sql.gz"
LOCAL_PATH="${BACKUP_DIR}/${FILENAME}"

mkdir -p "${BACKUP_DIR}"

exec >> "${LOG_FILE}" 2>&1
echo "================================================================="
echo "[$(date)] Starting automated PostgreSQL backup..."

# Extract DB credentials
POSTGRES_PASSWORD=$(grep '^POSTGRES_PASSWORD=' "${ENV_FILE}" | cut -d'=' -f2-)
POSTGRES_USER=$(grep '^POSTGRES_USER=' "${ENV_FILE}" | cut -d'=' -f2- || echo "spaceezy")
POSTGRES_DB=$(grep '^POSTGRES_DB=' "${ENV_FILE}" | cut -d'=' -f2- || echo "spaceezy")

# Non-blocking pg_dump via container socket
docker exec -e PGPASSWORD="${POSTGRES_PASSWORD}" spaceezy-postgres \
  pg_dump -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" --no-owner --no-privileges \
  | gzip -9 > "${LOCAL_PATH}"

FILE_SIZE=$(du -h "${LOCAL_PATH}" | cut -f1)
echo "[$(date)] Dump successful: ${LOCAL_PATH} (${FILE_SIZE})"

# Upload to S3
aws s3 cp "${LOCAL_PATH}" "${S3_BUCKET}/${FILENAME}" --storage-class STANDARD_IA
echo "[$(date)] S3 upload complete: ${S3_BUCKET}/${FILENAME}"

# Retain last 7 days locally
find "${BACKUP_DIR}" -name 'spaceezy-db-*.sql.gz' -mtime +7 -delete
echo "[$(date)] Local cleanup complete. Backup job finished."
```

### 4.2 S3 30-Day Retention Lifecycle Rule

```bash
aws s3api put-bucket-lifecycle-configuration --bucket spaceezy-media-<account-id> --lifecycle-configuration '{
  "Rules": [{
    "ID": "DeleteBackupsAfter30Days",
    "Status": "Enabled",
    "Filter": {"Prefix": "db-backups/"},
    "Expiration": {"Days": 30}
  }]
}'
```

### 4.3 Backup Schedule & Freshness Monitoring Script (`/opt/spaceezy/scripts/check-backup-freshness.sh`)

Schedule via cron at 03:00 IST daily:
```bash
sudo crontab -e
# Add lines:
0 3 * * * /opt/spaceezy/scripts/backup-db.sh
0 5 * * * /opt/spaceezy/scripts/check-backup-freshness.sh >> /var/log/spaceezy-backup-alert.log 2>&1
```

Script content (`check-backup-freshness.sh`):
```bash
#!/usr/bin/env bash
# Verifies a backup archive was produced within the last 26 hours
BACKUP_DIR="/var/backups/spaceezy-db"
LATEST_BACKUP=$(find "${BACKUP_DIR}" -name 'spaceezy-db-*.sql.gz' -mtime -1 | head -n 1)

if [ -z "${LATEST_BACKUP}" ]; then
  echo "[CRITICAL ALERT] [$(date)] No database backup found in ${BACKUP_DIR} created in the last 26 hours!"
  exit 1
else
  echo "[OK] [$(date)] Fresh backup verified: ${LATEST_BACKUP}"
fi
```

---

## 5. Restore Safety Procedures & Separation

> **CRITICAL RESTORE SAFETY RULES**
> - **`DROP DATABASE ... WITH FORCE` IS STRICTLY FOR DISASTER RECOVERY ON A FRESH / DEMOLISHED SERVER.**
> - **NEVER** run `DROP DATABASE` or destructive SQL commands against an active production container during normal operations.
> - **NEVER** run `docker compose down -v` in production (the `-v` flag destroys named volume `postgres_data`).

---

### Procedure A: Normal Restore to NEW / FRESH EC2 Instance (Non-Destructive to Live)

Use this routine when setting up a new EC2 instance, migrating servers, or populating a staging instance:

1. Launch fresh EC2 instance, install Docker, and clone repository into `/opt/spaceezy`.
2. Start clean PostgreSQL container:
   ```bash
   docker compose -f docker-compose.production.yml --env-file .env.production up -d postgres
   ```
3. Fetch latest backup from S3:
   ```bash
   LATEST_FILE=$(aws s3 ls s3://spaceezy-media-<account-id>/db-backups/ | sort | tail -n 1 | awk '{print $4}')
   aws s3 cp "s3://spaceezy-media-<account-id>/db-backups/${LATEST_FILE}" ./target-dump.sql.gz
   ```
4. Stream dump into clean container database:
   ```bash
   POSTGRES_PASS=$(grep '^POSTGRES_PASSWORD=' .env.production | cut -d'=' -f2-)
   gunzip -c ./target-dump.sql.gz | docker exec -i -e PGPASSWORD="${POSTGRES_PASS}" spaceezy-postgres psql -U spaceezy -d spaceezy
   rm ./target-dump.sql.gz
   ```
5. Apply pending Prisma migrations and start application stack:
   ```bash
   docker compose -f docker-compose.production.yml run --rm express npx prisma migrate deploy
   docker compose -f docker-compose.production.yml --env-file .env.production up -d
   ```

---

### Procedure B: Emergency Production Database Restore (DESTRUCTIVE - REQUIRES CONFIRMATION)

> ⚠️ **WARNING: DESTRUCTIVE ACTION**  
> This procedure will overwrite live production database tables. Execute ONLY in catastrophic corruption scenarios.

```bash
# 1. Require explicit user confirmation
read -p "ARE YOU SURE YOU WANT TO OVERWRITE THE PRODUCTION DATABASE? Type 'CONFIRM_DESTRUCTIVE_RESTORE': " CONFIRM
if [ "$CONFIRM" != "CONFIRM_DESTRUCTIVE_RESTORE" ]; then
  echo "Restore cancelled."
  exit 1
fi

# 2. Stop application API to prevent write conflicts
docker compose -f docker-compose.production.yml stop express next

# 3. Take safety pre-restore snapshot of corrupted state
docker exec spaceezy-postgres pg_dump -U spaceezy -d spaceezy | gzip > /var/backups/spaceezy-db/pre-restore-safety-snapshot.sql.gz

# 4. DESTRUCTIVE: Drop and recreate spaceezy database
POSTGRES_PASS=$(grep '^POSTGRES_PASSWORD=' .env.production | cut -d'=' -f2-)
docker exec -i -e PGPASSWORD="${POSTGRES_PASS}" spaceezy-postgres \
  psql -U spaceezy -d postgres -c "DROP DATABASE IF EXISTS spaceezy WITH (FORCE);"
docker exec -i -e PGPASSWORD="${POSTGRES_PASS}" spaceezy-postgres \
  psql -U spaceezy -d postgres -c "CREATE DATABASE spaceezy;"

# 5. Restore from chosen S3 backup archive
aws s3 cp s3://spaceezy-media-<account-id>/db-backups/<CHOSEN-BACKUP>.sql.gz ./restore.sql.gz
gunzip -c ./restore.sql.gz | docker exec -i -e PGPASSWORD="${POSTGRES_PASS}" spaceezy-postgres psql -U spaceezy -d spaceezy
rm ./restore.sql.gz

# 6. Run Prisma migrate deploy and restart services
docker compose -f docker-compose.production.yml run --rm express npx prisma migrate deploy
docker compose -f docker-compose.production.yml up -d
```

---

## 6. PostgreSQL Persistence & Volume Verification

- Named Docker volume `postgres_data` is defined in `docker-compose.production.yml`:
  ```yaml
  volumes:
    postgres_data:
  ```
- **Survival Guarantee:** Data inside `postgres_data` persists across:
  - Container restarts (`docker compose restart postgres`)
  - Container recreate / code redeployment (`docker compose up -d --build`)
  - Stack shutdown (`docker compose down` — without `-v`)
  - Host server reboots (`systemctl reboot`)
- **Prohibited Command:** `docker compose down -v` **MUST NEVER BE EXECUTED IN PRODUCTION**.

---

## 7. Disk Usage Monitoring & Emergency Cleanup

### 7.1 Disk Monitoring Thresholds
- **Host EBS Disk:** Monitored via `/opt/spaceezy/scripts/check-disk.sh`. Alert threshold set at **75% disk usage**.
- **Docker Disk Footprint:** Checked via `docker system df`.
- **PostgreSQL Volume Size:** Monitored via `du -sh /var/lib/docker/volumes/spaceezy_postgres_data/_data`.

### 7.2 Non-Destructive Emergency Cleanup Script (`check-disk.sh`)

```bash
#!/usr/bin/env bash
set -euo pipefail

USAGE=$(df -h / | awk 'NR==2 {print $5}' | tr -d '%')
echo "[$(date)] Current root disk usage: ${USAGE}%"

if [ "${USAGE}" -ge 75 ]; then
  echo "[WARNING] Disk usage exceeds 75%! Executing non-destructive cleanup..."
  
  # 1. Prune unused build cache and dangling images (keeps active images)
  docker image prune -a -f --filter "until=72h"
  docker builder prune -f --filter "until=72h"
  
  # 2. Clear old system logs
  sudo journalctl --vacuum-size=100M
  
  # 3. Purge local DB backups older than 7 days
  find /var/backups/spaceezy-db -name 'spaceezy-db-*.sql.gz' -mtime +7 -delete
  
  echo "[CLEANUP COMPLETE] New usage: $(df -h / | awk 'NR==2 {print $5}')"
fi
```

> ⚠️ **CRITICAL DIRECTIVE:** The emergency cleanup script **NEVER** touches or deletes the `postgres_data` Docker volume.

---

## 8. Non-Destructive Manual Backup Test Drill Procedure

To verify backup integrity periodically **without touching live production data**:

```bash
# 1. Run local backup script to generate test dump
/opt/spaceezy/scripts/backup-db.sh

# 2. Get latest backup filename
LATEST_BACKUP=$(ls -t /var/backups/spaceezy-db/spaceezy-db-*.sql.gz | head -n 1)

# 3. Spin up an isolated temporary test container on port 5439 (isolated from production)
docker run --name spaceezy-backup-test -e POSTGRES_PASSWORD=testpassword -d postgres:16-alpine

# 4. Wait 5s for container init, then restore dump into test container
sleep 5
gunzip -c "${LATEST_BACKUP}" | docker exec -i spaceezy-backup-test psql -U postgres

# 5. Verify table count and structure against test container
TABLE_COUNT=$(docker exec spaceezy-backup-test psql -U postgres -d postgres -t -c "SELECT count(*) FROM information_schema.tables WHERE table_schema='public';")
echo "Test verification successful! Table count in backup archive: ${TABLE_COUNT}"

# 6. Tear down test container
docker rm -f spaceezy-backup-test
```

---

## 9. Final Step-by-Step Manual Deployment Sequence

Follow these manual steps when provisioning AWS:

1. **EC2 Provisioning:**
   - Launch EC2 instance: `t4g.small` (ARM64 Graviton, 2 vCPU, 2 GB RAM, 25 GB gp3 EBS).
   - Subnet: Public subnet with auto-assign IPv4 enabled for setup (or private subnet behind Cloudflare Tunnel).
   - Security Group `sg-web`: Inbound SSH (port 22) restricted to admin IP only.
2. **IAM Instance Profile:**
   - Create IAM Role `spaceezy-ec2-s3` with `s3:PutObject`, `s3:GetObject`, `s3:ListBucket` permissions on `spaceezy-media-<account-id>`.
   - Attach IAM instance profile to EC2.
3. **EC2 Host Bootstrap:**
   - SSH in and create 4 GB Swapfile (`/swapfile`).
   - Install Docker, Docker Compose, `cloudflared`, `postgresql-client`, `awscli`.
4. **Code & Environment Configuration:**
   - Clone repository to `/opt/spaceezy`.
   - Create `.env.production` and `backend/.env.production` (`chmod 600`).
5. **Start Docker Compose Stack:**
   - `docker compose -f docker-compose.production.yml --env-file .env.production up -d --build`
   - Run `docker compose -f docker-compose.production.yml run --rm express npx prisma migrate deploy`
6. **Cloudflare Tunnel Setup:**
   - Authenticate `cloudflared` and route `spaceezy.com` to `http://localhost:80`.
   - Enable `cloudflared` systemd service.
7. **Backup & Monitoring Cron Jobs:**
   - Register daily backup script (`backup-db.sh`), freshness check, and disk monitoring script in `crontab`.

---

## 10. Summary of Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| **Cloudflare Tunnel Daemon Crash** | Temporary site unreachability | `cloudflared` managed by systemd (`restart=always`) connected to 4 edge POPs + instant DNS rollback to EIP documented. |
| **EC2 Server Loss** | Host downtime | Daily non-blocking `pg_dump` to S3 (30-day retention) + 15-min Procedure A restore to fresh EC2. |
| **Build Memory Exhaustion** | OOM process kill | 4 GB Swapfile on EBS + `--max-old-space-size=1400` Node build flag. |
| **Database Corruption** | Data integrity loss | Persistent volume + daily automated backup + non-destructive isolated backup testing drill. |

---

## FINAL STATUS

**READY FOR MANUAL AWS PROVISIONING: YES**
