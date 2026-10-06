#!/usr/bin/env bash
# One-command setup and start without Docker, for macOS and Linux.
# Needs Node.js 22+ and a running PostgreSQL 16+ (Postgres.app, Homebrew or apt).
# Safe to re-run: it reinstalls dependencies if needed and recreates the demo database.
#
#   bash scripts/local-setup.sh
#
# Written for the bash 3.2 that ships with macOS.
set -euo pipefail
cd "$(dirname "$0")/.."

say() { printf '\n▸ %s\n' "$1"; }
fail() {
  printf '\n✗ %s\n' "$1" >&2
  exit 1
}

say "Checking Node.js"
command -v node >/dev/null 2>&1 ||
  fail "Node.js is not installed. Install the LTS version from https://nodejs.org and run this again."
node_major=$(node -p 'process.versions.node.split(".")[0]')
[ "$node_major" -ge 22 ] ||
  fail "Node.js $node_major is installed; version 22 or newer is required (https://nodejs.org)."
node --version

say "Enabling pnpm"
export COREPACK_ENABLE_DOWNLOAD_PROMPT=0
if ! command -v pnpm >/dev/null 2>&1; then
  if command -v corepack >/dev/null 2>&1; then
    corepack enable 2>/dev/null || sudo corepack enable
  else
    # Newer Node.js releases no longer bundle corepack.
    pnpm_version=$(node -p 'require("./package.json").packageManager.split("@")[1]')
    npm install -g "pnpm@${pnpm_version}" 2>/dev/null || sudo npm install -g "pnpm@${pnpm_version}"
  fi
fi
pnpm --version

say "Installing dependencies (the first run takes a few minutes)"
pnpm install --frozen-lockfile

if [ ! -f .env ]; then
  cp .env.example .env
  echo "Created .env from .env.example"
fi

say "Connecting to PostgreSQL"
can_connect() {
  (cd apps/api && node -e '
    const { Client } = require("pg");
    const client = new Client({ connectionString: process.argv[1], connectionTimeoutMillis: 3000 });
    client.connect().then(() => client.end()).then(() => process.exit(0), () => process.exit(1));
  ' "$1") >/dev/null 2>&1
}
admin_url=$(grep -E '^DATABASE_ADMIN_URL=' .env | cut -d= -f2-)
if ! can_connect "$admin_url"; then
  # Postgres.app and Homebrew create a superuser named after your account, without a password.
  candidate="postgres://$(whoami)@localhost:5432/postgres"
  can_connect "$candidate" ||
    fail "PostgreSQL is not reachable on localhost:5432. Start Postgres.app (or run 'brew services start postgresql@17') and run this again."
  sed "s#^DATABASE_ADMIN_URL=.*#DATABASE_ADMIN_URL=${candidate}#" .env >.env.tmp
  mv .env.tmp .env
  admin_url=$candidate
fi
echo "Using ${admin_url}"

say "Creating the database with demo data"
pnpm db:reset

say "Building the apps"
pnpm build

say "Starting CampusOS on http://localhost:3000 — stop it with Ctrl+C"
echo "Demo password for every account: Demo!Parola2026 (e.g. sahip@atlas.test)"
(
  for _ in $(seq 1 90); do
    if curl -fsS -o /dev/null http://localhost:3000/login 2>/dev/null; then
      if command -v open >/dev/null 2>&1; then open http://localhost:3000; fi
      break
    fi
    sleep 1
  done
) &
exec pnpm start
