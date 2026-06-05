#!/usr/bin/env bash
set -euo pipefail

# Deploy the backend to the production droplet from a developer machine.
#
# Pushes the current branch to origin, then SSHes into the droplet to pull and
# run the on-server deploy (install -> build -> migrate -> pm2 reload). The
# remote shell defaults to an older Node, so nvm's default (Node 22) is sourced
# first to satisfy the package.json engines requirement.
#
# Usage: yarn deploy:remote
#
# Override defaults via env vars if needed:
#   DEPLOY_HOST   (default root@134.209.94.162)
#   DEPLOY_KEY    (default ~/.ssh/id_ed25519)
#   DEPLOY_DIR    (default /root/suuq-backend)
#   DEPLOY_BRANCH (default current branch)

DEPLOY_HOST="${DEPLOY_HOST:-root@134.209.94.162}"
DEPLOY_KEY="${DEPLOY_KEY:-$HOME/.ssh/id_ed25519}"
DEPLOY_DIR="${DEPLOY_DIR:-/root/suuq-backend}"
DEPLOY_BRANCH="${DEPLOY_BRANCH:-$(git rev-parse --abbrev-ref HEAD)}"

echo "[deploy-remote] Branch: $DEPLOY_BRANCH -> $DEPLOY_HOST:$DEPLOY_DIR"

echo "[deploy-remote] Pushing to origin..."
git push origin "$DEPLOY_BRANCH"

echo "[deploy-remote] Running remote deploy over SSH..."
ssh -i "$DEPLOY_KEY" "$DEPLOY_HOST" \
  "export NVM_DIR=\$HOME/.nvm; . \$NVM_DIR/nvm.sh >/dev/null 2>&1; nvm use default >/dev/null 2>&1; \
   cd '$DEPLOY_DIR' && echo \"[remote] node: \$(node -v)\" && \
   git pull origin '$DEPLOY_BRANCH' && yarn deploy:prod"

echo "[deploy-remote] Done."
