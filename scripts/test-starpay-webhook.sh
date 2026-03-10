#!/usr/bin/env bash

set -euo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:3000/api}"
WEBHOOK_SECRET="${STARPAY_WEBHOOK_SECRET:-e40a1502f16fb1006da1ead5272cc169dca8ddad0bdc7b58f178c6c859656654}"
ENDPOINT="${BASE_URL%/}/callbacks/starpay/webhook"
MODE="valid"
ORDER_ID="417"

usage() {
  cat <<'EOF'
Usage: scripts/test-starpay-webhook.sh [--invalid] [orderId]

Options:
  --invalid   Tamper the payload after signing it and expect HTTP 401.
  -h, --help  Show this help text.

Examples:
  scripts/test-starpay-webhook.sh
  scripts/test-starpay-webhook.sh 417
  scripts/test-starpay-webhook.sh --invalid 417
EOF
}

while (($# > 0)); do
  case "$1" in
    --invalid)
      MODE="invalid"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      ORDER_ID="$1"
      shift
      ;;
  esac
done

timestamp="$(node -e 'process.stdout.write(Date.now().toString())')"
transaction_id="STARPAY-QA-${timestamp}"
payload="$(node -e 'const orderId = process.argv[1]; const transactionId = process.argv[2]; process.stdout.write(JSON.stringify({ orderId, status: "paid", message: "payment completed", data: { orderId, referenceId: `REF-${orderId}`, status: "paid", transactionId } }));' "$ORDER_ID" "$transaction_id")"
signature="$(PAYLOAD="$payload" TIMESTAMP="$timestamp" SECRET="$WEBHOOK_SECRET" node -e 'const crypto = require("crypto"); const payload = process.env.PAYLOAD || "{}"; const timestamp = process.env.TIMESTAMP || ""; const secret = process.env.SECRET || ""; process.stdout.write(crypto.createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex"));')"

if [[ "$MODE" == "invalid" ]]; then
  payload="$(PAYLOAD="$payload" node -e 'const data = JSON.parse(process.env.PAYLOAD || "{}"); data.data = { ...(data.data || {}), transactionId: `${String(data.data?.transactionId || "STARPAY-QA")}--tampered` }; process.stdout.write(JSON.stringify(data));')"
  expected_status="401"
else
  expected_status="201"
fi

printf 'POST %s\n' "$ENDPOINT"
printf 'mode=%s\n' "$MODE"
printf 'orderId=%s\n' "$ORDER_ID"
printf 'x-timestamp=%s\n' "$timestamp"
printf 'x-signature=%s\n' "$signature"

response_file="$(mktemp)"
http_status="$(curl --silent --show-error --location \
  --output "$response_file" \
  --write-out '%{http_code}' \
  --request POST "$ENDPOINT" \
  --header 'content-type: application/json' \
  --header "x-timestamp: $timestamp" \
  --header "x-signature: $signature" \
  --data "$payload")"

cat "$response_file"
printf '\n'
printf 'http_status=%s\n' "$http_status"
rm -f "$response_file"

if [[ "$http_status" != "$expected_status" ]]; then
  printf 'Unexpected status: expected %s but received %s\n' "$expected_status" "$http_status" >&2
  exit 1
fi

printf 'status_check=passed\n'