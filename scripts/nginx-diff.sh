#!/usr/bin/env bash
#
# Diffs the nginx site configs running in production against the copies in
# ops/nginx/sites/.
#
# The repo copy exists so a lost droplet can be rebuilt — nine server blocks
# with their TLS paths, CSP, per-route rate limits and proxy rules are not
# something anyone reconstructs from memory, and this box has been rebuilt once
# already. But a committed config nobody compares is worse than no copy at all:
# it drifts silently and then reads as authoritative. This is the thing that
# keeps it honest. Run it before and after any change that touches nginx.
#
#   ./scripts/nginx-diff.sh          compare live against the repo
#   ./scripts/nginx-diff.sh --pull   overwrite the repo with what is live
#
# Applying in the other direction is deliberately NOT automated. One typo takes
# down every domain on the box at once, for a file that changes a few times a
# year — so edit on the server, `nginx -t`, reload, then --pull the result back.

set -euo pipefail

HOST="${DEPLOY_HOST:-root@164.90.195.23}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/id_ed25519}"
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/ops/nginx/sites"
REMOTE_DIR="/etc/nginx/sites-enabled"

mode="${1:-diff}"

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

# -h so the symlinks in sites-enabled come back as the files they point at.
ssh -i "$SSH_KEY" "$HOST" "cd $REMOTE_DIR && tar chf - \$(ls -1)" | tar xf - -C "$tmp"

if [ "$mode" = "--pull" ]; then
  rm -f "$REPO_DIR"/*
  cp "$tmp"/* "$REPO_DIR"/
  echo "Pulled $(ls -1 "$REPO_DIR" | wc -l | tr -d ' ') configs from $HOST into ops/nginx/sites/"
  git -C "$(dirname "$REPO_DIR")/../.." status --short ops/nginx/sites || true
  exit 0
fi

status=0

# A site that exists on only one side is the drift that matters most: a server
# block enabled by hand and never recorded, or one recorded and never enabled.
for f in "$tmp"/*; do
  name="$(basename "$f")"
  [ -f "$REPO_DIR/$name" ] || { echo "ONLY ON SERVER: $name"; status=1; }
done
for f in "$REPO_DIR"/*; do
  name="$(basename "$f")"
  [ -f "$tmp/$name" ] || { echo "ONLY IN REPO:   $name"; status=1; }
done

for f in "$tmp"/*; do
  name="$(basename "$f")"
  [ -f "$REPO_DIR/$name" ] || continue
  if ! diff -q "$REPO_DIR/$name" "$f" >/dev/null; then
    echo "DRIFTED: $name"
    diff -u "$REPO_DIR/$name" "$f" | sed 's/^/    /' || true
    status=1
  fi
done

if [ "$status" -eq 0 ]; then
  echo "nginx configs on $HOST match ops/nginx/sites/ ($(ls -1 "$tmp" | wc -l | tr -d ' ') sites)"
else
  echo
  echo "Drift found. If the server is right, run: ./scripts/nginx-diff.sh --pull"
fi
exit "$status"
