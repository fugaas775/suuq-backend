#!/usr/bin/env bash
set -euo pipefail

# Usage: run on the server from repo root: ./scripts/migrate-and-reload.sh

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
REPO_ROOT=$(cd -- "$SCRIPT_DIR/.." && pwd)

cd "$REPO_ROOT"

echo "[deploy] Installing dependencies..."
yarn install --frozen-lockfile

echo "[deploy] Building (clean — avoids stale incremental output with no dist/main.js)..."
yarn clean:dist
rm -f tsconfig.build.tsbuildinfo
yarn build

echo "[deploy] Verifying build emitted the entrypoint..."
if [ ! -f dist/main.js ]; then
  echo "[deploy] ERROR: dist/main.js missing after build — aborting before PM2 reload." >&2
  exit 1
fi

echo "[deploy] Running migrations..."
yarn typeorm migration:run

echo "[deploy] Reloading PM2 app..."
pm2 reload ecosystem.production.config.js --only suuq-api || pm2 start ecosystem.production.config.js
pm2 status suuq-api || true

echo "[deploy] Done."
