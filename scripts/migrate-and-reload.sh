#!/usr/bin/env bash
set -euo pipefail

# Usage: run on the server from repo root: ./scripts/migrate-and-reload.sh

echo "[deploy] Installing dependencies..."
yarn install --frozen-lockfile

echo "[deploy] Building..."
yarn build

echo "[deploy] Running migrations..."
yarn typeorm migration:run

echo "[deploy] Reloading PM2 app..."
pm2 reload suuq-api || pm2 start ecosystem.production.config.js
pm2 status suuq-api || true

echo "[deploy] Done."
