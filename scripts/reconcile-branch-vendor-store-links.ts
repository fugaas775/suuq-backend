import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import {
  BranchStoreLinkMismatch,
  findBranchStoreLinkMismatches,
  linkBranchToVendorStore,
} from '../src/branches/branch-store-link';

/**
 * Repairs one-sided branch↔storefront links.
 *
 * A branch and its consumer storefront are one shop held together by two
 * independently-nullable unique FKs (`branches.vendorStoreId` and
 * `vendor_stores.branchId`) that nothing in the schema keeps in step. When they
 * drift, POS-created products silently stop reaching the branch's consumer
 * catalog, because that path reads `branch.vendorStoreId`.
 *
 * `vendor_stores.branchId` wins: it is the side the consumer read path filters
 * on, so it is the side a shopper actually experiences.
 *
 *   yarn reconcile:branch-store-links            # dry run
 *   yarn reconcile:branch-store-links:execute    # repair
 */
function hasExecuteFlag() {
  return process.argv.includes('--execute');
}

function describe(mismatch: BranchStoreLinkMismatch): string {
  switch (mismatch.reason) {
    case 'BRANCH_POINTS_NOWHERE':
      return `branch has no vendorStoreId, but store #${mismatch.storeIdPointingHere} points here`;
    case 'STORE_POINTS_NOWHERE':
      return `branch claims store #${mismatch.branchVendorStoreId}, but no store points back`;
    case 'POINTS_DISAGREE':
      return `branch claims store #${mismatch.branchVendorStoreId}, but store #${mismatch.storeIdPointingHere} points here`;
  }
}

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const dataSource = app.get(DataSource);
  const execute = hasExecuteFlag();

  console.log(
    execute
      ? 'Executing branch↔vendor-store link reconciliation...'
      : 'Dry run: branch↔vendor-store link reconciliation...',
  );

  const mismatches = await findBranchStoreLinkMismatches(dataSource.manager);

  if (mismatches.length === 0) {
    console.log('All branch↔store links agree. Nothing to do.');
    await app.close();
    return;
  }

  console.log(`Found ${mismatches.length} mismatched link(s):\n`);
  for (const mismatch of mismatches) {
    console.log(
      `  branch #${mismatch.branchId} (${mismatch.branchName}) — ${describe(mismatch)}`,
    );
  }

  // Only a storefront that points at the branch gives us a repair target. A
  // branch claiming a store that does not point back is reported but left
  // alone: clearing it could orphan products scoped to that store, so it wants
  // a human.
  const repairable = mismatches.filter(
    (m): m is BranchStoreLinkMismatch & { storeIdPointingHere: number } =>
      m.storeIdPointingHere != null,
  );
  const needsReview = mismatches.length - repairable.length;

  console.log(
    `\n${repairable.length} repairable automatically; ${needsReview} need review.`,
  );

  if (!execute) {
    console.log('Dry run — re-run with --execute to apply.');
    await app.close();
    return;
  }

  for (const mismatch of repairable) {
    await linkBranchToVendorStore(
      dataSource.manager,
      mismatch.branchId,
      mismatch.storeIdPointingHere,
    );
    console.log(
      `  repaired branch #${mismatch.branchId} → store #${mismatch.storeIdPointingHere}`,
    );
  }

  console.log(`\nRepaired ${repairable.length} link(s).`);
  await app.close();
}

bootstrap().catch((err) => {
  console.error(err);
  process.exit(1);
});
