/**
 * Backfill missing accrual rent checkouts for PROPERTY_RENTAL branches that were
 * onboarded by inserting tenancies directly as paid `pos_suspended_carts` without
 * the backing `pos_checkouts` the financial engine reads from (Home P&L, daily
 * panel, balance sheet, Reports). Such a branch shows full Tenancies data but
 * ETB 0 revenue (this happened to Burji Hassan Wali #106).
 *
 * The same reconciliation runs automatically on every ownership transfer (see
 * src/pos-sync/rental-revenue-reconciliation.ts). This script is for branches
 * seeded but NOT followed by a transfer, or for an ad-hoc sweep.
 *
 * SCOPE / SAFETY
 *   - PROPERTY_RENTAL only; fires ONLY for a branch with paid leases and zero
 *     rent checkouts, so a live branch that already rings rent is never
 *     double-counted.
 *   - Accrual recognition: one PROCESSED SALE per prepaid month dated
 *     `checkIn + k months`, classified RENTAL_REVENUE.
 *   - Idempotent (deterministic idempotencyKey + ON CONFLICT DO NOTHING).
 *   - Reversible: DELETE FROM pos_checkouts WHERE metadata->>'seedBatch'
 *       = 'rental-revenue-reconcile' [AND "branchId" = <id>].
 *   - DRY RUN by default; pass --execute to write.
 *
 * USAGE
 *   Dry run, all eligible branches:
 *     node --env-file=.env -r ts-node/register -r tsconfig-paths/register \
 *       scripts/backfill-rental-revenue-checkouts.ts
 *   One branch:
 *     ... scripts/backfill-rental-revenue-checkouts.ts --branch=106
 *   Apply:
 *     ... scripts/backfill-rental-revenue-checkouts.ts --branch=106 --execute
 */
import dataSource from '../src/data-source';
import {
  RENTAL_REVENUE_RECONCILE_SEED_BATCH,
  reconcileRentalRevenueCheckouts,
} from '../src/pos-sync/rental-revenue-reconciliation';

const EXECUTE = process.argv.includes('--execute');
const branchArg = process.argv.find((a) => a.startsWith('--branch='));
const ONLY_BRANCH = branchArg ? Number(branchArg.split('=')[1]) : null;

type Candidate = {
  id: number;
  name: string;
  paid_leases: number;
  would_create: number;
  total_revenue: number;
};

/**
 * Branches that the reconciliation would act on: PROPERTY_RENTAL, with paid
 * leases, and no rent checkouts yet — plus a preview of how many checkouts and
 * how much revenue would be generated.
 */
async function findCandidates(): Promise<Candidate[]> {
  return dataSource.query(
    `
    WITH paid_lines AS (
      SELECT sc."branchId" AS branch_id,
             sc.id AS lease_id,
             (line->>'unitPrice')::numeric AS unit,
             (line->>'quantity')::int AS qty
      FROM pos_suspended_carts sc
      CROSS JOIN LATERAL jsonb_array_elements(sc."cartSnapshot"->'cartLines') line
      WHERE sc."cartSnapshot"->>'paid' = 'true'
        AND (line->'metadata'->>'chargeGroupCode') = 'RENT'
        AND (line->>'quantity') ~ '^[1-9][0-9]*$'
        AND (line->>'unitPrice') ~ '^[0-9]+(\\.[0-9]+)?$'
    )
    SELECT b.id,
           b.name,
           count(DISTINCT pl.lease_id) AS paid_leases,
           COALESCE(sum(pl.qty), 0) AS would_create,
           COALESCE(sum(pl.unit * pl.qty), 0) AS total_revenue
    FROM branches b
    JOIN paid_lines pl ON pl.branch_id = b.id
    WHERE b."serviceFormat" = 'PROPERTY_RENTAL'
      AND ($1::int IS NULL OR b.id = $1)
      AND NOT EXISTS (
        SELECT 1 FROM pos_checkouts c
        WHERE c."branchId" = b.id
          AND c.items @> '[{"metadata":{"chargeGroupCode":"RENT"}}]'
      )
    GROUP BY b.id, b.name
    ORDER BY b.id
    `,
    [ONLY_BRANCH],
  );
}

async function run(): Promise<void> {
  const candidates = await findCandidates();

  console.log(
    EXECUTE
      ? 'Executing rental-revenue checkout backfill (accrual)...'
      : 'Dry run: rental-revenue checkout backfill (accrual)...',
  );
  if (ONLY_BRANCH) console.log(`Scope: branch #${ONLY_BRANCH} only.`);

  if (!candidates.length) {
    console.log('No eligible branches (paid leases without rent checkouts). Nothing to do.');
    return;
  }

  for (const c of candidates) {
    console.log(
      `- branch #${c.id} "${c.name}": ${c.paid_leases} paid lease(s) ` +
        `→ would create ${c.would_create} checkout(s), ${c.total_revenue} ETB`,
    );
    if (EXECUTE) {
      const result = await reconcileRentalRevenueCheckouts(
        (sql, params) => dataSource.query(sql, params),
        c.id,
      );
      console.log(`    created ${result.checkoutsCreated} checkout(s).`);
    }
  }

  console.log(
    EXECUTE
      ? `Done. seedBatch='${RENTAL_REVENUE_RECONCILE_SEED_BATCH}' (reversible by DELETE on that tag).`
      : `Dry run complete. Re-run with --execute to apply.`,
  );
}

async function bootstrap(): Promise<void> {
  await dataSource.initialize();
  try {
    await run();
  } finally {
    await dataSource.destroy();
  }
}

bootstrap().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
