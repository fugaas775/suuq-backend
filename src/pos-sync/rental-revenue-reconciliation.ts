/**
 * Rental-revenue reconciliation — guarantees a PROPERTY_RENTAL branch that was
 * onboarded by inserting its tenancies directly as paid `pos_suspended_carts`
 * (a lease snapshot with `paid:true`) also gets the backing `pos_checkouts` the
 * financial engine reads from.
 *
 * WHY THIS EXISTS
 *   Every financial report (Home P&L, daily classified panel, balance sheet,
 *   owner Reports) derives revenue ONLY from `pos_checkouts`, scoped by
 *   `branchId`. The Tenancies board reads suspended carts directly. So a branch
 *   seeded with paid leases but no checkouts shows full tenancy data and ETB 0
 *   financials (this happened to Burji Hassan Wali #106). Normal rent collection
 *   through the register always creates a checkout; only direct-insert onboarding
 *   skipped that step. This module closes that gap so it can't recur — it is
 *   invoked automatically whenever a branch changes hands (ownership transfer)
 *   and is also runnable on demand via scripts/backfill-rental-revenue-checkouts.ts.
 *
 * SAFETY / CORRECTNESS
 *   - Scoped to PROPERTY_RENTAL branches only (the demonstrated gap; HOTEL and
 *     other formats seed their checkouts correctly and are untouched).
 *   - Fires ONLY when the branch has zero rent checkouts already, so a live
 *     branch that collects rent normally (#90/#100) is never double-counted.
 *   - Idempotent: each generated row carries a deterministic idempotencyKey and
 *     relies on the unique (branchId, idempotencyKey) index + ON CONFLICT DO
 *     NOTHING, so re-running is a no-op.
 *   - Accrual recognition: each prepaid month becomes one PROCESSED SALE dated
 *     `checkIn + k months`, classified RENTAL_REVENUE — matching the Blue Mall
 *     #100 seed and the system's `recognitionBasis: ACCRUAL`.
 *   - Fully reversible: DELETE ... WHERE metadata->>'seedBatch' = the constant.
 */

export const RENTAL_REVENUE_RECONCILE_SEED_BATCH = 'rental-revenue-reconcile';

/** Minimal query interface satisfied by both `Repository.query` and `DataSource.query`. */
export type SqlRunner = (sql: string, params: unknown[]) => Promise<unknown>;

export interface RentalRevenueReconcileResult {
  branchId: number;
  checkoutsCreated: number;
}

/**
 * Parametrised insert. `$1` = branchId (referenced several times). Generates one
 * accrual rent checkout per prepaid month for every paid lease, but only for a
 * PROPERTY_RENTAL branch that has no rent checkouts yet. `RETURNING id` lets the
 * caller count what was actually created (ON CONFLICT rows are not returned).
 */
export const RENTAL_REVENUE_RECONCILE_SQL = `
WITH raw_lines AS (
  SELECT sc.id AS lease_id,
         sc."cartSnapshot" AS cs,
         line,
         line->>'unitPrice' AS unit_s,
         line->>'quantity' AS qty_s,
         COALESCE(line->'metadata'->>'propertyRoom', sc."cartSnapshot"->>'hotelRoomNumber') AS room,
         sc."cartSnapshot"->>'hotelCheckInAt' AS checkin_s
  FROM pos_suspended_carts sc
  CROSS JOIN LATERAL jsonb_array_elements(sc."cartSnapshot"->'cartLines') line
  WHERE sc."branchId" = $1
    AND sc."cartSnapshot"->>'paid' = 'true'
    AND (line->'metadata'->>'chargeGroupCode') = 'RENT'
),
lines AS (
  SELECT lease_id, cs, line, room,
         unit_s::numeric AS unit,
         qty_s::int AS qty,
         checkin_s::date AS checkin
  FROM raw_lines
  WHERE qty_s ~ '^[1-9][0-9]*$'
    AND unit_s ~ '^[0-9]+(\\.[0-9]+)?$'
    AND checkin_s ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
),
owner AS (
  SELECT b."ownerId" AS owner_id,
         COALESCE(NULLIF(TRIM(u."displayName"), ''), 'Property Manager') AS owner_name
  FROM branches b
  LEFT JOIN "user" u ON u.id = b."ownerId"
  WHERE b.id = $1
),
eligible AS (
  SELECT 1
  WHERE EXISTS (
          SELECT 1 FROM branches b
          WHERE b.id = $1 AND b."serviceFormat" = 'PROPERTY_RENTAL'
        )
    AND NOT EXISTS (
          SELECT 1 FROM pos_checkouts c2
          WHERE c2."branchId" = $1
            AND c2.items @> '[{"metadata":{"chargeGroupCode":"RENT"}}]'
        )
),
rows AS (
  SELECT
    l.lease_id,
    l.cs,
    l.line,
    l.room,
    l.unit,
    l.qty,
    gs.k,
    (((l.checkin + (gs.k || ' months')::interval)::timestamp) + interval '12 hours') AS occ
  FROM lines l
  CROSS JOIN LATERAL generate_series(0, l.qty - 1) AS gs(k)
  WHERE EXISTS (SELECT 1 FROM eligible)
)
INSERT INTO pos_checkouts (
  "branchId", "registerId", "registerSessionId", "suspendedCartId", "idempotencyKey",
  "receiptNumber", "transactionType", status, currency,
  subtotal, "discountAmount", "taxAmount", total, "paidAmount", "changeDue",
  "itemCount", "occurredAt", "processedAt", "cashierUserId", "cashierName",
  note, metadata, tenders, items, "createdAt", "updatedAt", "tipAmount"
)
SELECT
  $1,
  'pos-s-web',
  NULL,
  NULL,
  'rentbf-' || r.lease_id || '-' || r.k,
  'RENTBF-' || to_char(r.occ, 'YYYYMM') || '-' || r.lease_id || '-' || (r.k + 1),
  'SALE',
  'PROCESSED',
  'ETB',
  r.unit, 0, 0, r.unit, r.unit, 0,
  1,
  r.occ,
  r.occ,
  o.owner_id,
  o.owner_name,
  'Rental revenue backfill (accrual) — lease #' || r.lease_id || ' month ' || (r.k + 1) || '/' || r.qty,
  jsonb_build_object(
    'source', 'POS-S',
    'guestName', r.cs->>'hotelGuestName',
    'seedBatch', '${RENTAL_REVENUE_RECONCILE_SEED_BATCH}',
    'roomNumber', r.room,
    'serviceFormat', 'PROPERTY_RENTAL',
    'leaseSuspendedCartId', r.lease_id,
    'paidReceiptNumber', r.cs->>'paidReceiptNumber',
    'pricingSummary', jsonb_build_object('subtotal', r.unit, 'taxTotal', 0, 'grandTotal', r.unit, 'discountTotal', 0),
    'financialClassification', jsonb_build_object(
      'revenue', jsonb_build_object('amount', r.unit, 'account', 'RENTAL_REVENUE'),
      'currency', 'ETB', 'cogsSource', 'SERVICE_COST', 'schemaVersion', 1,
      'serviceFormat', 'PROPERTY_RENTAL', 'recognitionBasis', 'ACCRUAL')
  ),
  jsonb_build_array(jsonb_build_object('amount', r.unit, 'method', 'BANK_TRANSFER', 'reference', NULL)),
  jsonb_build_array(jsonb_build_object(
    'sku', r.line->>'sku',
    'title', r.room || ' — Rent ' || to_char(r.occ, 'YYYY-MM'),
    'lineId', 'RENTBF-' || to_char(r.occ, 'YYYYMM') || '-' || r.lease_id || '-l1',
    'metadata', jsonb_build_object('autoAdded', true, 'propertyRoom', r.room,
       'serviceFormat', 'PROPERTY_RENTAL', 'chargeGroupCode', 'RENT'),
    'quantity', 1, 'lineTotal', r.unit, 'taxAmount', 0, 'unitPrice', r.unit,
    'discountAmount', 0, 'productId', NULLIF(r.line->>'productId', '')::int
  )),
  now(), now(), 0
FROM rows r
CROSS JOIN owner o
ON CONFLICT ("branchId", "idempotencyKey") DO NOTHING
RETURNING id
`;

/**
 * Backfill missing accrual rent checkouts for a branch. No-op unless the branch
 * is PROPERTY_RENTAL with paid leases and zero rent checkouts. Idempotent.
 */
export async function reconcileRentalRevenueCheckouts(
  run: SqlRunner,
  branchId: number,
): Promise<RentalRevenueReconcileResult> {
  const result = (await run(RENTAL_REVENUE_RECONCILE_SQL, [branchId])) as unknown;
  const created = Array.isArray(result) ? result.length : 0;
  return { branchId, checkoutsCreated: created };
}
