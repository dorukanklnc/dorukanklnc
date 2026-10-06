#!/usr/bin/env bash
# Starts the API and the web app from their production builds whenever the editor attaches.
# Safe to run again by hand (`bash .devcontainer/start.sh`): it finishes an interrupted setup,
# stops leftovers of an earlier start and prints the address to open when the app is ready.
# For live code changes stop it (Ctrl+C) and run `pnpm dev` in multi-tenant/ instead.
set -euo pipefail
# Some container runtimes start processes with umask 000; the SWC native addon (used by the
# next-intl plugin) refuses cache directories that other users can write to.
umask 022
cd "$(dirname "$0")/../multi-tenant"

if [ -n "${CODESPACE_NAME:-}" ] && [ -n "${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:-}" ]; then
  url="https://${CODESPACE_NAME}-3000.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}"
else
  url="http://localhost:3000"
fi

if curl -fsS -o /dev/null http://127.0.0.1:3000/login 2>/dev/null; then
  echo "✓ CampusOS zaten çalışıyor / is already running: ${url}"
  exit 0
fi

if [ ! -f .env ] || [ ! -f apps/api/dist/main.js ] || [ ! -f apps/web/.next/BUILD_ID ]; then
  echo "Kurulum tamamlanmamış, önce o tamamlanıyor / Finishing the setup first (a few minutes)…"
  bash ../.devcontainer/setup.sh
fi

# Leftovers of an earlier start (for example only the API still running) would block the ports.
pkill -f "dist/main.js" 2>/dev/null || true
pkill -f "next-server" 2>/dev/null || true
pkill -f "next start" 2>/dev/null || true
sleep 1

echo "CampusOS başlatılıyor / starting…"
(
  for _ in $(seq 1 120); do
    if curl -fsS -o /dev/null http://127.0.0.1:3000/login 2>/dev/null; then
      printf '\n✓ CampusOS hazır / ready: %s\n' "$url"
      printf '  Giriş / sign in: sahip@atlas.test · Demo!Parola2026\n\n'
      exit 0
    fi
    sleep 1
  done
  printf '\n✗ Web uygulaması açılmadı; yukarıdaki "apps/web" satırlarına bakın.\n'
  printf '  The web app did not start; see the "apps/web" lines above.\n'
) &
exec pnpm start
