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
  "id" BIGSERIAL PRIMARY KEY, "tenantId" int, "branchId" int, "classId" bigint,
  "prefix" varchar, "rangeStart" int, "rangeEnd" int,
  "status" varchar DEFAULT 'ACTIVE', "createdAt" timestamptz DEFAULT now());
CREATE TABLE IF NOT EXISTS "pos_vehicle_plates" (
  "id" BIGSERIAL PRIMARY KEY, "tenantId" int, "branchId" int, "seriesId" bigint,
  "plateNumber" varchar, "plateCode" varchar, "regionCode" varchar, "serial" int,
  "sortKey" int, "status" varchar DEFAULT 'IN_STOCK',
  "registrationId" bigint, "updatedAt" timestamptz DEFAULT now());
TRUNCATE "pos_vehicle_plates", "pos_vehicle_plate_series" RESTART IDENTITY;
-- TWO blocks, so the race is run against the shape production actually has:
-- several series, none bound to a class, distinguished only by plate code. The
-- decoy block is code 1 and is deliberately OLDER, because ordering by series
-- age is what used to hand a commercial vehicle a taxi number.
INSERT INTO "pos_vehicle_plate_series" ("tenantId","branchId","prefix","rangeStart","rangeEnd","createdAt")
VALUES (42,7,'1',1,${BLANKS}, now() - interval '1 day'), (42,7,'3',1,${BLANKS}, now());
INSERT INTO "pos_vehicle_plates" ("tenantId","branchId","seriesId","plateNumber","plateCode","regionCode","serial","sortKey")
SELECT 42,7,1,'1-SM-'||lpad(g::text,5,'0'),'1','SM',g,g FROM generate_series(1,${BLANKS}) g;
INSERT INTO "pos_vehicle_plates" ("tenantId","branchId","seriesId","plateNumber","plateCode","regionCode","serial","sortKey")
SELECT 42,7,2,'3-SM-'||lpad(g::text,5,'0'),'3','SM',g,g FROM generate_series(1,${BLANKS}) g;
SQL

# Verbatim from VehicleRegistryService.allocatePlate(), including the plateCode
# filter — without it this script would prove a statement the service no longer
# runs, which is worse than not running it at all. Code 3 here: every plate
# handed out must be a 3, never a 1, however old the code-1 block is.
ALLOC='UPDATE "pos_vehicle_plates" p SET "status"=$$ALLOCATED$$, "updatedAt"=now()
 WHERE p."id" = (SELECT pick."id" FROM "pos_vehicle_plates" pick
   JOIN "pos_vehicle_plate_series" s ON s."id"=pick."seriesId"
  WHERE pick."tenantId"=42 AND pick."branchId"=7
    AND pick."status"=$$IN_STOCK$$ AND s."status"=$$ACTIVE$$
    AND (s."classId" IS NULL OR s."classId" = 11)
    AND ($$3$$ IS NULL OR pick."plateCode" = $$3$$)
  ORDER BY s."createdAt" ASC, pick."sortKey" ASC
  LIMIT 1 FOR UPDATE OF pick SKIP LOCKED) RETURNING p."plateNumber";'

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

for i in $(seq 1 "$CLERKS"); do
  ( psql "$DSN" -q -A -t -c "$ALLOC" > "$TMP/clerk_$i" 2>&1 ) &
done
wait

grep -h -E '^[0-9]-SM-' "$TMP"/clerk_* 2>/dev/null | sort > "$TMP/all" || true
HANDED=$(wc -l < "$TMP/all" | tr -d ' ')
DISTINCT=$(sort -u "$TMP/all" | wc -l | tr -d ' ')
DUPES=$(sort "$TMP/all" | uniq -d)
# Every number handed out must carry the code that was ASKED for. The code-1
# block is older, so before the plateCode filter existed the oldest-series
# ordering handed these clerks taxi plates for a commercial vehicle.
WRONG_CODE=$(grep -v -E '^3-SM-' "$TMP/all" || true)

echo "[race] handed out: $HANDED   distinct: $DISTINCT   turned away: $((CLERKS - HANDED))"

if [ -n "$WRONG_CODE" ]; then
  echo "[race] FAIL — a plate from the wrong code block was handed out:" >&2
  echo "$WRONG_CODE" >&2
  exit 1
fi
echo "[race] every plate carried code 3, not the older code-1 block"

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
