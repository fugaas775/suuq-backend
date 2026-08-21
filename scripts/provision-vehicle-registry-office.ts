/**
 * Provision a bureau and one registry office.
 *
 * VEHICLE_REGISTRY is deliberately not self-serve creatable — a registry office
 * carries statutory authority and nobody should be able to conjure one from the
 * signup grid. The consequence is that provisioning is an admin act, and this
 * is it.
 *
 * Three things have to exist before the seed script can put classes and plates
 * into an office:
 *
 *   1. A tenant. The bureau. Region-wide chassis and plate uniqueness are
 *      enforced per tenant, so this is the boundary the whole registry hangs on.
 *   2. A POS_CORE entitlement whose metadata names VEHICLE_REGISTRY in
 *      `allowedSelfServeServiceFormats`. This is the per-tenant gate
 *      `assertAllowedSelfServeServiceFormat` reads; without it the format is
 *      refused for every tenant, which is exactly what keeps it off everyone
 *      else's picker. Nothing in the app writes this field — that is why the
 *      script exists rather than a settings screen.
 *   3. A branch on that tenant, with serviceFormat VEHICLE_REGISTRY.
 *
 * Written against the shipped entities rather than hand-rolled INSERTs, so the
 * record shapes come from the same definitions the API uses.
 *
 * SCOPE / SAFETY
 *   - Creates a NEW tenant. It never attaches to an existing one, so no real
 *     business's tenant gains a new allowed format as a side effect.
 *   - Idempotent: matches the tenant by name and the branch by code.
 *   - DRY RUN by default; pass --execute to write.
 *   - Reversible, in this order:
 *       DELETE FROM pos_vehicle_plates       WHERE "branchId" = <branch>;
 *       DELETE FROM pos_vehicle_plate_series WHERE "branchId" = <branch>;
 *       DELETE FROM pos_vehicle_classes      WHERE "tenantId" = <tenant>;
 *       DELETE FROM branches                 WHERE id = <branch>;
 *       DELETE FROM tenant_module_entitlements WHERE "tenantId" = <tenant>;
 *       DELETE FROM retail_tenants           WHERE id = <tenant>;
 *
 * USAGE
 *   node --env-file=.env -r ts-node/register -r tsconfig-paths/register \
 *     scripts/provision-vehicle-registry-office.ts \
 *     --tenant="TEST — Somali Region Bureau of Trade and Transport" \
 *     --office="TEST — Jigjiga Zone Office" --code=TEST-VR-JIGJIGA [--execute]
 */
import dataSource from '../src/data-source';
import { getDefaultAllowedSelfServeServiceFormats } from '../src/retail/self-serve-service-format.policy';

const EXECUTE = process.argv.includes('--execute');
const arg = (n: string) => {
  const f = process.argv.find((a) => a.startsWith(`--${n}=`));
  return f ? f.slice(`--${n}=`.length) : null;
};

const TENANT_NAME =
  arg('tenant') || 'TEST — Somali Region Bureau of Trade and Transport';
const OFFICE_NAME = arg('office') || 'TEST — Jigjiga Zone Office';
const OFFICE_CODE = (arg('code') || 'TEST-VR-JIGJIGA').toUpperCase();
/**
 * Who owns the bureau and its offices.
 *
 * Required, and not defaulted: without an owner nobody can reach the office at
 * all — branch access is the union of branches you own, branches of tenants you
 * own, and staff assignments, so an ownerless office is invisible to every user
 * on the platform. It is also the vendor the fee products hang off.
 */
const OWNER_USER_ID = Number(arg('owner') || 0);

async function main() {
  if (!OWNER_USER_ID) {
    throw new Error(
      'Pass --owner=<userId>. An office with no owner is invisible to every user on the platform.',
    );
  }
  await dataSource.initialize();
  console.log(
    `\n[provision] ${EXECUTE ? 'EXECUTING' : 'DRY RUN — pass --execute to write'}`,
  );
  console.log(`[provision] tenant : ${TENANT_NAME}`);
  console.log(`[provision] office : ${OFFICE_NAME}  (${OFFICE_CODE})\n`);

  // ── 1. Tenant ──────────────────────────────────────────────────────────
  let tenant = (
    await dataSource.query(
      `SELECT id, name FROM retail_tenants WHERE name = $1`,
      [TENANT_NAME],
    )
  )?.[0];

  if (tenant) {
    console.log(`  tenant exists            id=${tenant.id}`);
    // Backfill the owner onto a row created before --owner was required. An
    // idempotent script that only creates, and never corrects, leaves the exact
    // half-finished state it was meant to make impossible.
    if (EXECUTE) {
      await dataSource.query(
        `UPDATE retail_tenants SET "ownerUserId" = $2, "updatedAt" = now()
          WHERE id = $1 AND ("ownerUserId" IS DISTINCT FROM $2)`,
        [tenant.id, OWNER_USER_ID],
      );
    }
  } else if (EXECUTE) {
    tenant = (
      await dataSource.query(
        `INSERT INTO retail_tenants (name, status, "defaultCurrency", "ownerUserId", "createdAt", "updatedAt")
         VALUES ($1, 'ACTIVE', 'ETB', $2, now(), now()) RETURNING id, name`,
        [TENANT_NAME, OWNER_USER_ID],
      )
    )[0];
    console.log(`  tenant created           id=${tenant.id}`);
  } else {
    console.log('  tenant would be created');
  }

  const tenantId = tenant?.id ?? null;

  // ── 2. Entitlement — the gate that makes the format usable ─────────────
  const allowed = Array.from(
    new Set([
      ...getDefaultAllowedSelfServeServiceFormats(),
      'VEHICLE_REGISTRY',
    ]),
  );
  console.log(`  entitlement allows       ${allowed.join(', ')}`);

  if (EXECUTE && tenantId) {
    const existing = (
      await dataSource.query(
        `SELECT id FROM tenant_module_entitlements WHERE "tenantId"=$1 AND module='POS_CORE'`,
        [tenantId],
      )
    )?.[0];

    const metadata = JSON.stringify({
      allowedSelfServeServiceFormats: allowed,
    });
    if (existing) {
      await dataSource.query(
        `UPDATE tenant_module_entitlements SET metadata=$2::jsonb, enabled=true, "updatedAt"=now() WHERE id=$1`,
        [existing.id, metadata],
      );
      console.log(`  entitlement updated      id=${existing.id}`);
    } else {
      const created = (
        await dataSource.query(
          `INSERT INTO tenant_module_entitlements ("tenantId", module, enabled, reason, metadata, "createdAt", "updatedAt")
           VALUES ($1, 'POS_CORE', true, $2, $3::jsonb, now(), now()) RETURNING id`,
          [tenantId, 'Vehicle registry provisioning', metadata],
        )
      )[0];
      console.log(`  entitlement created      id=${created.id}`);
    }
  }

  // ── 3. Office ──────────────────────────────────────────────────────────
  let branch = (
    await dataSource.query(
      `SELECT id, name, "serviceFormat", "retailTenantId" FROM branches WHERE code = $1`,
      [OFFICE_CODE],
    )
  )?.[0];

  if (branch) {
    console.log(
      `  office exists            id=${branch.id} (${branch.serviceFormat})`,
    );
    if (EXECUTE) {
      await dataSource.query(
        `UPDATE branches
            SET "serviceFormat" = 'VEHICLE_REGISTRY',
                "retailTenantId" = $2,
                "ownerId" = COALESCE("ownerId", $3),
                "updatedAt" = now()
          WHERE id = $1`,
        [branch.id, tenantId, OWNER_USER_ID],
      );
      console.log(
        `  office corrected         → VEHICLE_REGISTRY, owner ${OWNER_USER_ID}`,
      );
    }
  } else if (EXECUTE) {
    branch = (
      await dataSource.query(
        `INSERT INTO branches (name, code, "serviceFormat", "retailTenantId", "ownerId", "isActive",
                               country, timezone, "taxEnabled", "taxRate", "taxInclusive",
                               "createdAt", "updatedAt")
         VALUES ($1, $2, 'VEHICLE_REGISTRY', $3, $4, true, 'ET', 'Africa/Addis_Ababa', false, 0, false, now(), now())
         RETURNING id`,
        [OFFICE_NAME, OFFICE_CODE, tenantId, OWNER_USER_ID],
      )
    )[0];
    console.log(`  office created           id=${branch.id}`);
  } else {
    console.log('  office would be created');
  }

  // ── 4. The POS subscription — WITHOUT THIS THE OFFICE DOES NOT OPEN ────
  //
  // The entitlement above says the tenant MAY use POS_CORE. It does not say the
  // branch has a live workspace, and `assertBranchHasModules` checks both: a
  // branch with no `tenant_subscriptions` row resolves to a workspaceStatus
  // that is not ACTIVE, and every POS route for it answers
  //   "Retail tenant N does not have an active POS workspace for branch B".
  //
  // Which is exactly what happened. Branch 137 was provisioned, seeded with
  // nine classes and five hundred blanks, and could not load a single one of
  // them: the desk opened, said "0 plates left in stock", and put that error on
  // screen. Everything existed and nothing worked, because the one row that
  // makes a branch tradeable was the one row this script never wrote.
  //
  // Provisioned manually rather than sold: a government bureau does not buy a
  // POS seat through the consumer checkout, and the Ebirr gateway has been
  // unreachable from this box since June in any case. The metadata says so, in
  // the same shape the platform owner's other manual provisions use.
  if (tenant?.id && branch?.id) {
    const existingSub = EXECUTE
      ? (
          await dataSource.query(
            `SELECT id, status FROM tenant_subscriptions WHERE "tenantId"=$1 AND "branchId"=$2 LIMIT 1`,
            [tenant.id, branch.id],
          )
        )[0]
      : null;

    if (existingSub) {
      console.log(
        `  subscription exists      id=${existingSub.id} (${existingSub.status})`,
      );
    } else if (EXECUTE) {
      const startsAt = new Date();
      const endsAt = new Date(startsAt);
      endsAt.setFullYear(endsAt.getFullYear() + 1);

      const [sub] = await dataSource.query(
        `INSERT INTO tenant_subscriptions
           ("tenantId", "planCode", status, "billingInterval", amount, currency,
            "periodMonths", "amountTotal", "branchId", "startsAt", "endsAt",
            "autoRenew", metadata, "createdAt", "updatedAt")
         VALUES ($1, 'POS_BRANCH_1Y', 'ACTIVE', 'ONE_YEAR', $2, 'ETB',
                 12, $2, $3, $4, $5, false, $6::jsonb, now(), now())
         RETURNING id`,
        [
          tenant.id,
          0,
          branch.id,
          startsAt,
          endsAt,
          JSON.stringify({
            fundingMode: 'MANUAL_PROVISION',
            reason:
              'Government vehicle-registry office provisioned by the platform owner; a regional bureau does not buy a POS seat through the consumer checkout.',
            provisionedAt: startsAt.toISOString(),
          }),
        ],
      );
      console.log(`  subscription created     id=${sub.id} (ACTIVE, 1 year)`);
    } else {
      console.log('  subscription would be created');
    }
  }

  if (EXECUTE && branch?.id) {
    console.log(
      `\n[provision] done. Now seed it:\n` +
        `  node --env-file=.env -r ts-node/register -r tsconfig-paths/register \\\n` +
        `    scripts/seed-vehicle-registry.ts --branch=${branch.id} --to=200 --execute\n`,
    );
  } else if (!EXECUTE) {
    console.log('\n[provision] nothing written. Re-run with --execute.\n');
  }

  await dataSource.destroy();
}

main().catch(async (err) => {
  console.error(`\n[provision] FAILED: ${err.message}\n`);
  try {
    await dataSource.destroy();
  } catch {
    /* already closed */
  }
  process.exit(1);
});
