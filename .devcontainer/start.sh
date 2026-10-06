#!/usr/bin/env bash
# Starts the API and the web app from their production builds whenever the editor attaches.
# For live code changes stop it (Ctrl+C) and run `pnpm dev` in multi-tenant/ instead.
set -euo pipefail
# Some container runtimes start processes with umask 000; the SWC native addon (used by the
# next-intl plugin) refuses cache directories that other users can write to.
umask 022
cd "$(dirname "$0")/../multi-tenant"

if curl -fsS -o /dev/null http://127.0.0.1:3000/login 2>/dev/null; then
  echo "CampusOS is already running on port 3000 (see the Ports tab)."
  exit 0
fi

echo "Starting CampusOS. When port 3000 is ready it opens in a new browser tab"
echo "(or open it from the Ports tab). Demo accounts: docs/development/LOCAL_DEVELOPMENT.md,"
echo "password: Demo!Parola2026"
exec pnpm start
