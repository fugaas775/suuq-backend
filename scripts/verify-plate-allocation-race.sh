#!/usr/bin/env bash
#
# Proves plate allocation is race-free, against a real Postgres.
#
# The unit spec (src/vehicle-registry/vehicle-registry.service.spec.ts) can only
# assert the SHAPE of the allocation statement — that it says FOR UPDATE and
# SKIP LOCKED. Whether those actually stop two clerks taking one plate is a
# property of the database, not of the string, and no amount of mocking will
# tell you. This runs the real statement from real concurrent connections.
#
# Usage:  ./scripts/verify-plate-allocation-race.sh [PSQL_DSN]
# Default DSN targets a local scratch database; NEVER point this at production —
# it allocates plates.
set -euo pipefail

DSN="${1:-postgres://localhost/vr_race_check}"
CLERKS="${CLERKS:-12}"
BLANKS="${BLANKS:-10}"

echo "[race] preparing ${BLANKS} blanks for ${CLERKS} clerks"
psql "$DSN" -q <<SQL
CREATE TABLE IF NOT EXISTS "pos_vehicle_plate_series" (
  "id" BIGSERIAL PRIMARY KEY, "tenantId" int, "branchId" int,
  "prefix" varchar, "rangeStart" int, "rangeEnd" int,
  "status" varchar DEFAULT 'ACTIVE', "createdAt" timestamptz DEFAULT now());
CREATE TABLE IF NOT EXISTS "pos_vehicle_plates" (
  "id" BIGSERIAL PRIMARY KEY, "tenantId" int, "branchId" int, "seriesId" bigint,
  "plateNumber" varchar, "sortKey" int, "status" varchar DEFAULT 'IN_STOCK',
  "registrationId" bigint, "updatedAt" timestamptz DEFAULT now());
TRUNCATE "pos_vehicle_plates", "pos_vehicle_plate_series" RESTART IDENTITY;
INSERT INTO "pos_vehicle_plate_series" ("tenantId","branchId","prefix","rangeStart","rangeEnd")
VALUES (42,7,'5',1,${BLANKS});
INSERT INTO "pos_vehicle_plates" ("tenantId","branchId","seriesId","plateNumber","sortKey")
SELECT 42,7,1,'5-'||lpad(g::text,5,'0'),g FROM generate_series(1,${BLANKS}) g;
SQL

# Verbatim from VehicleRegistryService.allocatePlate().
ALLOC='UPDATE "pos_vehicle_plates" p SET "status"=$$ALLOCATED$$, "updatedAt"=now()
 WHERE p."id" = (SELECT pick."id" FROM "pos_vehicle_plates" pick
   JOIN "pos_vehicle_plate_series" s ON s."id"=pick."seriesId"
  WHERE pick."tenantId"=42 AND pick."branchId"=7
    AND pick."status"=$$IN_STOCK$$ AND s."status"=$$ACTIVE$$
  ORDER BY s."createdAt" ASC, pick."sortKey" ASC
  LIMIT 1 FOR UPDATE OF pick SKIP LOCKED) RETURNING p."plateNumber";'

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

for i in $(seq 1 "$CLERKS"); do
  ( psql "$DSN" -q -A -t -c "$ALLOC" > "$TMP/clerk_$i" 2>&1 ) &
done
wait

grep -h -E '^5-' "$TMP"/clerk_* 2>/dev/null | sort > "$TMP/all" || true
HANDED=$(wc -l < "$TMP/all" | tr -d ' ')
DISTINCT=$(sort -u "$TMP/all" | wc -l | tr -d ' ')
DUPES=$(sort "$TMP/all" | uniq -d)

echo "[race] handed out: $HANDED   distinct: $DISTINCT   turned away: $((CLERKS - HANDED))"

if [ -n "$DUPES" ]; then
  echo "[race] FAIL — the same plate went to more than one clerk:" >&2
  echo "$DUPES" >&2
  exit 1
fi
if [ "$HANDED" != "$BLANKS" ] || [ "$DISTINCT" != "$BLANKS" ]; then
  echo "[race] FAIL — expected exactly $BLANKS distinct plates." >&2
  exit 1
fi

echo "[race] PASS — every blank issued exactly once; the losers got nothing,"
echo "[race]        which is the out-of-plates path the service reports."
