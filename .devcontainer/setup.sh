#!/usr/bin/env bash
# One-time setup after the dev container is created (GitHub Codespaces or VS Code Dev Containers).
set -euo pipefail
# Some container runtimes start processes with umask 000; the SWC native addon (used by the
# next-intl plugin) refuses cache directories that other users can write to.
umask 022
cd "$(dirname "$0")/../multi-tenant"

echo "▸ Enabling pnpm (version pinned in package.json)"
sudo env "PATH=$PATH" corepack enable
pnpm --version

echo "▸ Installing dependencies"
pnpm install --frozen-lockfile

if [ ! -f .env ]; then
  echo "▸ Creating .env from .env.example"
  cp .env.example .env
  if [ -n "${CODESPACE_NAME:-}" ] && [ -n "${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:-}" ]; then
    # Links in e-mails and on the mock payment page must use the forwarded address.
    app_url="https://${CODESPACE_NAME}-3000.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}"
    sed -i "s#^APP_URL=.*#APP_URL=${app_url}#" .env
  fi
fi

echo "▸ Waiting for PostgreSQL"
for _ in $(seq 1 60); do
  if (echo >/dev/tcp/127.0.0.1/5432) >/dev/null 2>&1; then break; fi
  sleep 1
done

echo "▸ Creating the database with demo data"
pnpm db:reset

echo "▸ Building the apps"
pnpm build

echo "✓ Setup complete. The app starts automatically; demo password: Demo!Parola2026"
