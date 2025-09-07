#!/usr/bin/env bash
set -euo pipefail

# Simple deployment smoke test for the Suuq backend.
#
# Required env vars (with defaults):
#   BASE_URL       - API base URL (default: https://suuq.ugasfuad.com)
#   TIMEOUT        - curl timeout seconds (default: 10)
# Optional env vars for auth checks (skipped if missing):
#   TEST_EMAIL     - user email for login
#   TEST_PASSWORD  - user password for login
#   REFRESH_TOKEN  - refresh token to test /auth/refresh
#   GOOGLE_ID_TOKEN - Google ID token for /auth/google
#
# Exit status:
#   0 on success, non-zero if any critical check fails.

BASE_URL=${BASE_URL:-"https://suuq.ugasfuad.com"}
TIMEOUT=${TIMEOUT:-10}

tmpdir=$(mktemp -d)
trap 'rm -rf "$tmpdir"' EXIT

pass=0
fail=0
skipped=0

info() { echo "[INFO] $*"; }
ok() { echo "[PASS] $*"; pass=$((pass+1)); }
err() { echo "[FAIL] $*"; fail=$((fail+1)); }
skip() { echo "[SKIP] $*"; skipped=$((skipped+1)); }

curl_json() {
  # Usage: curl_json METHOD URL [DATA_JSON_STRING]
  local method="$1" url="$2" data="${3:-}"
  local body_file="$tmpdir/body.$RANDOM.json"
  local code
  if [[ -n "$data" ]]; then
    code=$(curl -sS -m "$TIMEOUT" -o "$body_file" -w "%{http_code}" \
      -H 'Content-Type: application/json' \
      -X "$method" "$url" --data "$data" || true)
  else
    code=$(curl -sS -m "$TIMEOUT" -o "$body_file" -w "%{http_code}" \
      -X "$method" "$url" || true)
  fi
  echo "$code" "$body_file"
}

require_200_contains() {
  local name="$1" method="$2" url="$3" needle="$4" data="${5:-}"
  read -r code body_file < <(curl_json "$method" "$url" "$data")
  if [[ "$code" == "200" ]] && grep -qi "$needle" "$body_file"; then
    ok "$name ($method $url)"
  else
    err "$name ($method $url) -> HTTP $code; expected 200 containing '$needle'"
    if [[ -s "$body_file" ]]; then
      echo "  Response sample: $(head -c 200 "$body_file" | tr '\n' ' ')" || true
    fi
  fi
}

require_200() {
  local name="$1" method="$2" url="$3" data="${4:-}"
  read -r code body_file < <(curl_json "$method" "$url" "$data")
  if [[ "$code" == "200" ]]; then
    ok "$name ($method $url)"
  else
    err "$name ($method $url) -> HTTP $code; expected 200"
    if [[ -s "$body_file" ]]; then
      echo "  Response sample: $(head -c 200 "$body_file" | tr '\n' ' ')" || true
    fi
  fi
}

info "Base URL: $BASE_URL"

# Critical checks
require_200_contains "Health" GET "$BASE_URL/api/health" '"ok"'
require_200 "UI Settings" GET "$BASE_URL/api/settings/ui-settings"

# Optional auth checks
if [[ -n "${TEST_EMAIL:-}" && -n "${TEST_PASSWORD:-}" ]]; then
  login_payload=$(printf '{"email":"%s","password":"%s"}' "$TEST_EMAIL" "$TEST_PASSWORD")
  read -r code body_file < <(curl_json POST "$BASE_URL/api/auth/login" "$login_payload")
  if [[ "$code" == "200" ]] && grep -q 'accessToken' "$body_file"; then
    ok "Auth login"
  else
    err "Auth login -> HTTP $code; expected 200 with accessToken"
    [[ -s "$body_file" ]] && echo "  Response sample: $(head -c 200 "$body_file" | tr '\n' ' ')" || true
  fi
else
  skip "Auth login (TEST_EMAIL/TEST_PASSWORD not set)"
fi

if [[ -n "${REFRESH_TOKEN:-}" ]]; then
  refresh_payload=$(printf '{"refreshToken":"%s"}' "$REFRESH_TOKEN")
  require_200_contains "Auth refresh" POST "$BASE_URL/api/auth/refresh" 'accessToken' "$refresh_payload"
else
  skip "Auth refresh (REFRESH_TOKEN not set)"
fi

if [[ -n "${GOOGLE_ID_TOKEN:-}" ]]; then
  google_payload=$(printf '{"idToken":"%s"}' "$GOOGLE_ID_TOKEN")
  require_200_contains "Auth google" POST "$BASE_URL/api/auth/google" 'accessToken' "$google_payload"
else
  skip "Auth google (GOOGLE_ID_TOKEN not set)"
fi

echo
echo "Summary: $pass passed, $fail failed, $skipped skipped"
if [[ "$fail" -gt 0 ]]; then
  exit 1
fi
exit 0
