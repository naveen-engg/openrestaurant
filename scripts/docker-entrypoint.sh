#!/bin/sh
set -e

echo "=== Openfront Restaurant Container Starting ==="

# Load Docker Compose secrets from /run/secrets/* (tmpfs) if mounted
load_secret() {
  var_name="$1"
  secret_file="/run/secrets/$2"
  if [ -f "$secret_file" ]; then
    val="$(tr -d '\r\n' < "$secret_file")"
    if [ -n "$val" ]; then
      export "$var_name=$val"
      echo "Loaded secret '$2' from /run/secrets"
    fi
  fi
}

load_secret "DATABASE_URL" "database_url"
load_secret "SESSION_SECRET" "session_secret"
load_secret "S3_ACCESS_KEY_ID" "s3_access_key_id"
load_secret "S3_SECRET_ACCESS_KEY" "s3_secret_access_key"

# Wait for PostgreSQL
node -e '
const net = require("net");
const host = process.env.DB_HOST || "postgres";
const port = parseInt(process.env.DB_PORT || "5432", 10);
let retries = 30;

function check() {
  const client = new net.Socket();
  client.setTimeout(2000);
  client.connect(port, host, () => {
    console.log(`Connected to database at ${host}:${port}!`);
    client.destroy();
    process.exit(0);
  });
  client.on("error", () => {
    retries--;
    if (retries <= 0) {
      console.error("Database connection timeout.");
      process.exit(1);
    }
    setTimeout(check, 2000);
  });
}
check();
'

echo "Running Prisma migrations..."
npx prisma migrate deploy

if [ "$SEED_DATABASE" = "true" ] || [ "$SEED_DATABASE" = "1" ]; then
  echo "Seeding initial restaurant data and admin credentials..."
  npx tsx scripts/seed.ts || echo "Seed completed or already initialized."
else
  echo "Database verified. Skipping demo seed (set SEED_DATABASE=true to run initial seed)."
fi

echo "Starting application server..."
exec "$@"
