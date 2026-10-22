#!/usr/bin/env bash
# ==============================================================================
# Openfront Restaurant — Enterprise Mini-PC Secret & Storage Provisioning Script
# ==============================================================================
# Generates cryptographically random secrets in /etc/openfront/secrets (chmod 600)
# for use with docker-compose.prod.yml (/run/secrets tmpfs mounts).
#
# Usage:
#   sudo ./scripts/provision-secrets.sh           # Idempotent (skips if exists)
#   sudo ./scripts/provision-secrets.sh --force   # Rotates/overwrites secrets
# ==============================================================================

set -euo pipefail

SECRET_DIR="${SECRET_DIR:-/etc/openfront/secrets}"
FORCE="${1:-}"

echo "=== Openfront Restaurant Enterprise Provisioning ==="

# 1. Create hardened secrets directory
mkdir -p "$SECRET_DIR"
chmod 700 "$SECRET_DIR"

if [ -f "$SECRET_DIR/database_url.txt" ] && [ "$FORCE" != "--force" ]; then
  echo "[✓] Secrets already exist in $SECRET_DIR (pass --force to rotate)."
else
  echo "[*] Generating 256-bit PostgreSQL credentials and 384-bit Iron session secret..."
  DB_PASS="$(openssl rand -hex 24)"
  SESSION_KEY="$(openssl rand -base64 48 | tr -d '\r\n')"

  printf "%s" "$DB_PASS" > "$SECRET_DIR/postgres_password.txt"
  printf "%s" "$SESSION_KEY" > "$SECRET_DIR/session_secret.txt"
  printf "postgresql://postgres:%s@postgres:5432/openfront_restaurant" "$DB_PASS" > "$SECRET_DIR/database_url.txt"

  chmod 600 "$SECRET_DIR/postgres_password.txt" \
            "$SECRET_DIR/session_secret.txt" \
            "$SECRET_DIR/database_url.txt"

  echo "[✓] Secrets provisioned and locked (chmod 600) in $SECRET_DIR"
fi

# 2. Create persistent local directories for menu images and backups
mkdir -p ./data/images /var/backups/openfront
chmod 755 ./data/images
chmod 700 /var/backups/openfront

echo "[✓] Persistent image directory ready at ./data/images"
echo "[✓] Backup directory ready at /var/backups/openfront"
echo ""
echo "Next steps:"
echo "  1. Initial boot (with one-time demo/admin seed):"
echo "     SEED_DATABASE=true docker compose -f docker-compose.prod.yml up -d"
echo ""
echo "  2. Normal production operation (after changing admin@openfront.dev password):"
echo "     docker compose -f docker-compose.prod.yml up -d"
echo ""
echo "  3. Optional — Bind Ubuntu LUKS2 Full-Disk Encryption to Mini-PC TPM 2.0:"
echo "     sudo systemd-cryptenroll --tpm2-device=auto --tpm2-pcrs=0+7 /dev/nvme0n1p3"
