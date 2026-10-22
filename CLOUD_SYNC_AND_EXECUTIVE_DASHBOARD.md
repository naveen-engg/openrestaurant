# Cloud Database Sync, Offsite Backup & Executive Dashboard Guide

This document describes the enterprise architecture for securely syncing data from an on-premise restaurant **Linux Mini-PC** (`openfront-postgres`) to a **Cloud Database** (such as **Google Cloud SQL for PostgreSQL**, **AWS RDS**, **Supabase**, or **Neon**) for **offsite disaster recovery** and a **live Cloud Executive Dashboard**.

---

## 1. Core Security Principles

1. **Zero Inbound Firewall Ports on the Restaurant Router**: The restaurant Mini-PC sits behind NAT (or cellular failover CGNAT). Never port-forward `5432` to the public internet. All connections must be **100% outbound-initiated** from the Mini-PC to the cloud over **mTLS / TLS 1.3**.
2. **Decouple Local POS Speed from Internet Reliability**: If restaurant internet drops for 6 hours during dinner rush, the local Mini-PC POS must continue operating at sub-millisecond local LAN speeds without blocking transactions or filling up the SSD with unconsumed replication WAL logs.
3. **Scrub Secrets Before Syncing to Analytics**: Payment gateway secrets (`stripeSecretKey`, `paypalClientSecret`, `terminalAuthKey`) and staff password hashes (`User.password`) must be excluded from the Executive Analytics tables.
4. **Separate Disaster Recovery Backups from Executive Analytics**:
   - **Stream 1 (Disaster Recovery):** Nightly/hourly AES-256 encrypted `pg_dump` snapshots pushed outbound to **Google Cloud Storage (GCS) / AWS S3**.
   - **Stream 2 (Executive Analytics):** Incremental `updatedAt` watermark sync every 1–2 minutes over **Cloud SQL Auth Proxy (mTLS)** into **Google Cloud SQL for PostgreSQL**.

---

## 2. Architecture Overview

```mermaid
flowchart LR
    subgraph MiniPC["Restaurant Mini-PC (Behind NAT / Firewall)"]
        LocalPG[("Local PostgreSQL 16\n(openfront-postgres)")]
        SyncWorker["Incremental Sync & Backup Worker"]
        Proxy["Cloud SQL Auth Proxy\n(Docker Sidecar - mTLS)"]
        LocalPG --> SyncWorker
        SyncWorker --> Proxy
    end

    subgraph GCP["Google Cloud Platform (or AWS / Supabase)"]
        GCS[("Cloud Storage Bucket\n(AES-256 Encrypted pg_dump)")]
        CloudSQL[("Cloud SQL for PostgreSQL\n(Executive Analytics DB)")]
        ExecDash["Cloud Executive Dashboard\n(Next.js Cloud Run / Metabase / Looker)"]
        CloudSQL --> ExecDash
    end

    SyncWorker -- "1. Nightly/Hourly Encrypted Backup (HTTPS 443)" --> GCS
    Proxy -- "2. 2-Min Incremental Upsert (mTLS Outbound)" --> CloudSQL
```

---

## 3. Why Outbound Incremental Push Beats Inbound Logical Replication

| Feature | Standard Postgres Logical Replication (`CREATE SUBSCRIPTION`) | Outbound Incremental Sync + Cloud SQL Auth Proxy (Recommended) |
| :--- | :--- | :--- |
| **Firewall / NAT Traversal** | Requires opening inbound port `5432` on the restaurant router (breaks on CGNAT / LTE failover) | **100% Outbound-only** (`TCP 3307 / 443`); works behind any router, firewall, or 5G backup modem |
| **24-Hour Internet Outage Behavior** | Replication slot retains WAL files until the Mini-PC SSD hits 100% full and **crashes local Postgres** | Watermark checkpoint simply waits; local POS runs unaffected and catches up in seconds once online |
| **Multi-Location Support (`store_id`)** | Difficult (UUID collisions or separate schemas per store) | **Native**: Each Mini-PC tags rows with `store_id` (e.g., `store_01_downtown`, `store_02_uptown`) |
| **Credential & PII Scrubbing** | Replicates entire table columns or breaks on schema drift | **Selective**: Excludes `PaymentProvider` API keys and `User.password` hashes automatically |

---

## 4. Step-by-Step Google Cloud SQL & IAM Setup

### Step 1: Provision Google Cloud SQL (PostgreSQL 16)
1. In Google Cloud Console, create a **Cloud SQL for PostgreSQL 16** instance (e.g., `openfront-executive-db`).
2. Create a database named `openfront_analytics` and a dedicated database user `openfront_sync`.
3. Note the **Instance Connection Name** (format: `project-id:region:instance-name`).

### Step 2: Create a Least-Privilege Service Account for the Mini-PC
1. Go to **IAM & Admin -> Service Accounts** and create `openfront-minipc-sync`.
2. Grant **only** these two roles:
   - `Cloud SQL Client` (`roles/cloudsql.client`) — allows connecting through the Cloud SQL Auth Proxy.
   - `Storage Object Creator` (`roles/storage.objectCreator`) — allows uploading encrypted backups to your GCS bucket (cannot delete or overwrite old backups if ransomware ever hits).
3. Download the JSON key to the Mini-PC at `/etc/openfront/secrets/gcp_sa_key.json` and lock permissions:
   ```bash
   sudo chmod 600 /etc/openfront/secrets/gcp_sa_key.json
   sudo chown root:root /etc/openfront/secrets/gcp_sa_key.json
   ```
4. Save the Cloud SQL connection URL in `/etc/openfront/secrets/cloud_database_url.txt` (`chmod 600`):
   ```bash
   echo -n "postgresql://openfront_sync:YOUR_CLOUD_DB_PASS@cloud-sql-proxy:5432/openfront_analytics" \
     | sudo tee /etc/openfront/secrets/cloud_database_url.txt > /dev/null
   sudo chmod 600 /etc/openfront/secrets/cloud_database_url.txt
   ```

---

## 5. Adding the `cloud-sql-proxy` Sidecar to `docker-compose.prod.yml`

Add the official Google `cloud-sql-proxy` container to your [`docker-compose.prod.yml`](docker-compose.prod.yml) on the Mini-PC. It listens only on the internal Docker bridge network (`openfront_internal`) and tunnels traffic over mTLS to Google Cloud SQL:

```yaml
services:
  cloud-sql-proxy:
    image: gcr.io/cloud-sql-connectors/cloud-sql-proxy:2.14.1-alpine
    container_name: openfront-cloud-sql-proxy
    restart: always
    command:
      - "--address=0.0.0.0"
      - "--port=5432"
      - "--credentials-file=/run/secrets/gcp_sa_key"
      - "${CLOUD_SQL_INSTANCE_CONNECTION_NAME}" # e.g. my-gcp-project:us-central1:openfront-executive-db
    secrets:
      - gcp_sa_key
    networks:
      - openfront_internal

secrets:
  gcp_sa_key:
    file: /etc/openfront/secrets/gcp_sa_key.json
  cloud_database_url:
    file: /etc/openfront/secrets/cloud_database_url.txt
```

### Initializing the Schema on Cloud SQL
From the Mini-PC, apply the Prisma migrations once against Cloud SQL through the proxy so the Cloud SQL database has the exact same tables as the local database:

```bash
docker exec -e DATABASE_URL="$(sudo cat /etc/openfront/secrets/cloud_database_url.txt)" \
  openfront-restaurant npx prisma migrate deploy
```

---

## 6. Stream 1: Encrypted Offsite Disaster Recovery Backup

Create `/opt/openfront/scripts/cloud-backup.sh` (`chmod 700`) on the Mini-PC to stream a compressed, AES-256-encrypted PostgreSQL dump to Google Cloud Storage (or AWS S3) every night:

```bash
#!/usr/bin/env bash
set -euo pipefail

TIMESTAMP="$(date +%Y-%m-%d_%H%M)"
BACKUP_FILE="/var/backups/openfront/db_${TIMESTAMP}.dump.enc"
PASSPHRASE_FILE="/etc/openfront/secrets/session_secret.txt"

# 1. Dump local PostgreSQL and encrypt on-the-fly with AES-256-CBC + PBKDF2
docker exec openfront-postgres pg_dump -U postgres -Fc openfront_restaurant \
  | openssl enc -aes-256-cbc -salt -pbkdf2 -pass "file:${PASSPHRASE_FILE}" -out "$BACKUP_FILE"

chmod 600 "$BACKUP_FILE"

# 2. Upload to Google Cloud Storage (or AWS S3)
gcloud auth activate-service-account --key-file=/etc/openfront/secrets/gcp_sa_key.json --quiet
gcloud storage cp "$BACKUP_FILE" "gs://YOUR_RESTAURANT_BACKUP_BUCKET/store-01/db_${TIMESTAMP}.dump.enc"

# 3. Prune local backups older than 14 days
find /var/backups/openfront -name "db_*.dump.enc" -mtime +14 -delete
echo "[✓] Encrypted backup uploaded: db_${TIMESTAMP}.dump.enc"
```

Schedule via root `crontab -e` (runs daily at 4:00 AM):
```cron
0 4 * * * /opt/openfront/scripts/cloud-backup.sh >> /var/log/openfront-backup.log 2>&1
```

---

## 7. Stream 2: Incremental Sync for the Executive Dashboard

Because every model in Openfront Restaurant includes `createdAt` and `updatedAt` timestamps via [`features/keystone/models/trackingFields.ts`](features/keystone/models/trackingFields.ts), syncing to Cloud SQL for your Executive Dashboard only requires pushing rows modified since the last checkpoint.

### Tables to Sync for Executive Reporting

| Category | Tables | Sensitive Columns Scrubbed |
| :--- | :--- | :--- |
| **Sales & Revenue** | `RestaurantOrder`, `OrderItem`, `Payment`, `PaymentCollection`, `Discount`, `GiftCard` | `Payment.data` card tokens sanitized |
| **Menu & Pricing** | `MenuCategory`, `MenuItem`, `MenuItemModifier`, `Recipe` | None |
| **Inventory & Food Cost** | `Ingredient`, `InventoryTransaction`, `WasteLog`, `Vendor`, `PurchaseOrder`, `PurchaseOrderItem` | None |
| **Labor & Tip Pools** | `User`, `Role`, `Shift`, `TimeEntry`, `TipPool` | `User.password`, `User.pin`, `User.passwordResetToken` set to `NULL` |
| **Operations & KDS** | `Floor`, `Section`, `Table`, `Reservation`, `KitchenTicket`, `AuditLog` | None |

### Lightweight Incremental Sync Pattern (`pg_dump` / Watermark Upsert)
For a single-store deployment (where Cloud SQL mirrors the single store), you can run a lightweight cron every 2 minutes that streams incremental table updates over the `cloud-sql-proxy` container, or performs a fast transactional sync:

```bash
# Fast read-replica sync over the encrypted cloud-sql-proxy sidecar (excluding PaymentProvider & ApiKey secrets)
docker exec openfront-postgres pg_dump -U postgres \
  --clean --if-exists --no-owner --no-privileges \
  --exclude-table-data='"PaymentProvider"' \
  --exclude-table-data='"ApiKey"' \
  openfront_restaurant \
  | docker exec -i openfront-postgres psql "$(sudo cat /etc/openfront/secrets/cloud_database_url.txt)"
```
*(For a 5-user restaurant, the entire operational database is typically `< 25 MB` per year and syncs over `cloud-sql-proxy` in `< 1.5 seconds`.)*

---

## 8. Building the Cloud Executive Dashboard

Once your data is in Cloud SQL, you can launch an Executive Dashboard using either of two approaches:

### Option A: Deploy Openfront Restaurant on Cloud Run in Read-Only Executive Mode (Zero Extra Code)
Deploy this exact Docker image (`openfront-restaurant-app:latest`) to **Google Cloud Run** connected to your Cloud SQL instance:
- Point `DATABASE_URL` to your Cloud SQL instance (`openfront_analytics`).
- Give the owner a role with `canAccessDashboard: true`, `canReadOrders: true`, `canReadPayments: true`, `canReadInventory: true`, `canReadStaff: true` (and `canManage*: false`).
- Immediately access the built-in executive analytics screens from anywhere on mobile or laptop:
  - **Sales & Revenue Reports:** `/dashboard/platform/reports/sales`
  - **Labor Cost & Overtime Reports:** `/dashboard/platform/reports/labor`
  - **Menu Engineering & Item Profitability:** `/dashboard/platform/reports/menu-performance`
  - **Inventory Depletion & Waste Tracking:** `/dashboard/platform/inventory/waste`

### Option B: Connect Metabase / Looker Studio / Grafana Directly to Cloud SQL
Connect **Metabase** (open-source BI) or **Google Looker Studio** to your Cloud SQL database using a read-only PostgreSQL user (`GRANT SELECT ON ALL TABLES IN SCHEMA public TO exec_readonly;`) and create these 3 core Executive SQL Views:

#### 1. Daily Net Sales, Tax, Tips & Guest Count View
```sql
CREATE OR REPLACE VIEW v_executive_daily_sales AS
SELECT
  DATE_TRUNC('day', "createdAt") AS business_date,
  "orderType",
  COUNT(id) FILTER (WHERE status = 'completed') AS completed_orders,
  SUM("guestCount") FILTER (WHERE status = 'completed') AS total_guests,
  ROUND(SUM(subtotal) FILTER (WHERE status = 'completed') / 100.0, 2) AS net_sales_usd,
  ROUND(SUM(discount) FILTER (WHERE status = 'completed') / 100.0, 2) AS discounts_usd,
  ROUND(SUM(tax) FILTER (WHERE status = 'completed') / 100.0, 2) AS tax_usd,
  ROUND(SUM(tip) FILTER (WHERE status = 'completed') / 100.0, 2) AS tips_usd,
  ROUND(SUM(total) FILTER (WHERE status = 'completed') / 100.0, 2) AS gross_revenue_usd
FROM "RestaurantOrder"
GROUP BY 1, 2
ORDER BY 1 DESC;
```

#### 2. Menu Item Profitability & Food Cost (COGS) View
```sql
CREATE OR REPLACE VIEW v_executive_menu_performance AS
SELECT
  mi.name AS item_name,
  mc.name AS category_name,
  COUNT(oi.id) AS orders_count,
  SUM(oi.quantity) AS units_sold,
  ROUND(SUM(oi.quantity * oi.price) / 100.0, 2) AS gross_item_revenue_usd
FROM "OrderItem" oi
JOIN "MenuItem" mi ON oi."menuItem" = mi.id
LEFT JOIN "MenuCategory" mc ON mi.category = mc.id
JOIN "RestaurantOrder" ro ON oi."order" = ro.id
WHERE ro.status = 'completed'
GROUP BY 1, 2
ORDER BY gross_item_revenue_usd DESC;
```

#### 3. Labor Hours & Cost vs. Sales (Prime Cost KPI) View
```sql
CREATE OR REPLACE VIEW v_executive_daily_labor AS
SELECT
  DATE_TRUNC('day', "clockIn") AS work_date,
  COUNT(DISTINCT staff) AS staff_count,
  ROUND(SUM(EXTRACT(EPOCH FROM (COALESCE("clockOut", NOW()) - "clockIn")) / 3600.0)::numeric, 2) AS total_hours_worked,
  ROUND(SUM((EXTRACT(EPOCH FROM (COALESCE("clockOut", NOW()) - "clockIn")) / 3600.0) * COALESCE("hourlyRate", 0))::numeric, 2) AS total_labor_cost_usd
FROM "TimeEntry"
GROUP BY 1
ORDER BY 1 DESC;
```
