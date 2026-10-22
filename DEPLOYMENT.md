# Enterprise Mini-PC Deployment, Secrets & Security Guide

This guide covers deploying **Openfront Restaurant** on a local on-premise Linux Mini-PC appliance in a restaurant environment (supporting 5–10+ concurrent POS tablets, KDS screens, ESC/POS thermal printers, and PAX/Dejavoo EMV card terminals on the local network).

---

## 1. Recommended Linux Mini-PC Hardware Sizing (Up to 5–10 Users)

For a single-location restaurant running the full stack (`openfront-restaurant` + `openfront-postgres`) locally on the LAN:

| Component | Minimum Spec | Recommended Spec (Production) | Notes |
| :--- | :--- | :--- | :--- |
| **CPU** | Intel N100 (4C/4T) | **Intel N100 / Core i3-N305 / AMD Ryzen 5** | Handles Next.js 16 SSR, Keystone GraphQL, and Postgres easily |
| **RAM** | 8 GB DDR4 | **16 GB DDR4 / DDR5** | App uses `~250 MB` RAM; Postgres uses `~150 MB`; OS/Docker cache uses the rest |
| **Storage** | 128 GB SSD | **256 GB – 512 GB NVMe SSD** | Docker image is `963 MB` unpacked (`211 MB` compressed); plenty of room for menu photos & 14-day DB backups |
| **Network** | 1 GbE Ethernet | **1 GbE / 2.5 GbE Wired Ethernet** | **Always wire the Mini-PC to the router/switch via Ethernet** (never rely on Wi-Fi for the host server) |
| **Security Chip** | TPM 2.0 | **Onboard fTPM / dTPM 2.0** | Used for LUKS2 Full-Disk Encryption auto-unlock on boot |
| **Power Protection** | Surge Protector | **600VA Mini UPS Battery Backup ($55)** | Keeps Mini-PC + router + PoE switch online during brief restaurant power flickers |
| **OS** | Ubuntu Server 24.04 LTS | **Ubuntu Server 24.04 LTS (64-bit)** | Enable **LVM + LUKS Full-Disk Encryption** during Ubuntu installer setup |

---

## 2. Enterprise Secrets Architecture (Tier 1 vs. Tier 2 vs. Tier 3)

Passing secrets via `environment:` in `docker-compose.yml` is **not** recommended for production appliances because any process or user with Docker socket access can run `docker inspect` and read plaintext credentials.

### Recommended Architecture: **Tier 1 (Docker `tmpfs` Secrets) + OS LUKS2 TPM 2.0 Encryption**

| Tier | Mechanism | Protects `docker inspect`? | Protects PostgreSQL Volume if Mini-PC Stolen? | Power-Outage Auto-Boot? | Hardware Failure Recovery |
| :--- | :--- | :---: | :---: | :---: | :--- |
| **Tier 1 + LUKS2 (Recommended)** | Docker `/run/secrets/*` (`tmpfs`) + Ubuntu LUKS2 bound to TPM 2.0 | **Yes** | **Yes (Entire SSD encrypted)** | **Yes (Native Docker `restart: always`)** | **Fast** (Move SSD to spare Mini-PC + enter LUKS recovery passphrase) |
| **Tier 2 (`systemd-creds`)** | `systemd-creds` TPM-encrypted `.cred` files | Yes | **No** (Raw `/var/lib/postgresql/data` remains readable if disk is unencrypted) | Requires custom `systemd` wrapper | Harder (Blobs permanently locked to dead motherboard's TPM) |
| **Tier 3 (Multi-Store Fleet)** | SOPS + `age` or Infisical / Vault Agent | Yes | Combine with LUKS2 | Yes | Centralized key rotation across 10+ restaurant locations |

#### Why Tier 1 + LUKS2 Wins for Restaurants:
1. **Protects the Database Volume, Not Just Password Files**: If someone steals the Mini-PC from the restaurant office, `systemd-creds` alone does not encrypt the PostgreSQL volume (`/var/lib/docker/volumes/.../postgres_data`). Full-disk LUKS2 encryption bound to TPM 2.0 encrypts **both** `/etc/openfront/secrets` and all PostgreSQL tables at rest.
2. **Zero-Touch Recovery from Power Flickers**: Docker's native `restart: always` brings containers back online immediately when power is restored without brittle `systemd` pre-start scripts.
3. **3-Minute Friday-Night Motherboard Recovery**: If a Mini-PC motherboard fails during dinner rush, you can swap the NVMe SSD into a spare Mini-PC, type your backup LUKS passphrase once, and resume service in minutes.

---

## 3. Step-by-Step Mini-PC Installation Guide

### Step 1: Bind Ubuntu Full-Disk Encryption (LUKS2) to TPM 2.0
When installing Ubuntu Server 24.04 LTS on the Mini-PC, check **"Encrypt the LVM group with LUKS"** and save your recovery passphrase in your password manager.
Once Ubuntu boots, bind LUKS2 to the onboard TPM 2.0 chip so the Mini-PC reboots hands-free without a keyboard after power outages:

```bash
# Find your LUKS partition (usually /dev/nvme0n1p3)
lsblk

# Enroll the onboard TPM 2.0 chip (PCR 0 = BIOS/UEFI firmware, PCR 7 = Secure Boot state)
sudo systemd-cryptenroll --tpm2-device=auto --tpm2-pcrs=0+7 /dev/nvme0n1p3
```

### Step 2: Clone Repository & Provision Enterprise Secrets
Run the included [`scripts/provision-secrets.sh`](scripts/provision-secrets.sh) script as `root`. It generates a 256-bit PostgreSQL password and a 384-bit Iron session secret inside `/etc/openfront/secrets` (`chmod 600`, owned by `root:root`):

```bash
git clone https://github.com/naveen-engg/openrestaurant.git /opt/openfront
cd /opt/openfront

chmod +x scripts/provision-secrets.sh
sudo ./scripts/provision-secrets.sh
```

What [`scripts/provision-secrets.sh`](scripts/provision-secrets.sh) creates:
- `/etc/openfront/secrets/postgres_password.txt` (`chmod 600`)
- `/etc/openfront/secrets/session_secret.txt` (`chmod 600`)
- `/etc/openfront/secrets/database_url.txt` (`chmod 600`)
- `./data/images` (persistent host volume for custom menu item photos)
- `/var/backups/openfront` (`chmod 700` directory for automated PostgreSQL backups)

### Step 3: How Secrets Are Loaded at Runtime
1. [`docker-compose.prod.yml`](docker-compose.prod.yml) mounts the secret files into the containers as **in-memory `tmpfs` files** at `/run/secrets/postgres_password`, `/run/secrets/database_url`, and `/run/secrets/session_secret`.
2. PostgreSQL reads `/run/secrets/postgres_password` natively via `POSTGRES_PASSWORD_FILE`.
3. [`scripts/docker-entrypoint.sh`](scripts/docker-entrypoint.sh) reads `/run/secrets/database_url` and `/run/secrets/session_secret` directly into the Node.js process environment at container startup.
4. Running `docker inspect openfront-restaurant` exposes **zero secrets**.

### Step 4: Launch Production Containers

#### First Boot Only (Seeds Initial Schema, BOM & Admin Account):
```bash
SEED_DATABASE=true docker compose -f docker-compose.prod.yml up -d --build
```
After logging into `http://<MINI_PC_LAN_IP>:3000/dashboard/signin` with `admin@openfront.dev` / `Password123!`, immediately change the admin password in **Platform -> Users**.

#### Normal Production Operation (`SEED_DATABASE=false` by default):
```bash
docker compose -f docker-compose.prod.yml up -d
```

---

## 4. Restaurant Network Topology & Hardware Peripherals

To ensure fast, reliable communication between iPads/tablets, the Mini-PC server, ESC/POS thermal printers, and PAX/Dejavoo payment terminals:

1. **Separate POS VLAN / Staff Wi-Fi SSID**:
   - Place the Mini-PC, POS tablets, KDS screens, thermal printers, and PAX/Dejavoo terminals on a dedicated **POS VLAN** (e.g., `192.168.10.x`).
   - Isolate **Guest Wi-Fi** onto a separate VLAN (`192.168.20.x`) with client isolation enabled so guests cannot reach port `10009` on PAX terminals, port `9100` on receipt printers, or port `3000` on the Mini-PC.
2. **Assign Static DHCP Leases on Your Router**:
   - **Mini-PC Server**: e.g., `192.168.10.10` (Access POS at `http://192.168.10.10:3000`)
   - **PAX Terminals**: e.g., `192.168.10.51`, `192.168.10.52` (Port `10009` HTTP POSLink)
   - **ESC/POS Printers**: e.g., `192.168.10.61` (Front Receipt), `192.168.10.62` (Kitchen Expo, Port `9100`)

---

## 5. Automated Database Backups & Secret Rotation

### Daily Automated PostgreSQL Backup (`cron`)
Add a root cron job (`sudo crontab -e`) on the Mini-PC to take a compressed PostgreSQL dump every morning at 4:00 AM and retain 14 days of history:

```cron
0 4 * * * docker exec openfront-postgres pg_dump -U postgres -Fc openfront_restaurant > /var/backups/openfront/db_$(date +\%F).dump && find /var/backups/openfront -name "db_*.dump" -mtime +14 -delete
```

### Restoring from Backup
```bash
cat /var/backups/openfront/db_2026-10-21.dump | docker exec -i openfront-postgres pg_restore -U postgres -d openfront_restaurant --clean --if-exists
```

### Rotating Secrets
To rotate `SESSION_SECRET` (invalidating all active browser sessions) or `POSTGRES_PASSWORD`:
```bash
sudo ./scripts/provision-secrets.sh --force
docker compose -f docker-compose.prod.yml up -d --force-recreate
```

---

## 6. Docker Image Optimization Summary

The production [`Dockerfile`](Dockerfile) uses a 4-stage Alpine build (`deps` $\rightarrow$ `builder` $\rightarrow$ `deps-pruned` $\rightarrow$ `runner`):
- **Unpacked Image Size**: Reduced from `1.64 GB` to **`963 MB`** (`-41.3%`)
- **Compressed Image Size**: Reduced from `327 MB` to **`211 MB`** (`-35.5%`)
- **Zero Build-Time Secret Warnings**: Placeholder `SESSION_SECRET` and `DATABASE_URL` values required by `keystone build` and `next build` are scoped inline to the `RUN` command rather than persisted in `ENV` layers.
- **Pruned Attack Surface**: Compiler binaries (`@next/swc-*`, `typescript`, `lightningcss*`, `eslint*`), unused `glibc` binaries, and unused `@keystone-ui` packages are stripped before the `runner` stage.
