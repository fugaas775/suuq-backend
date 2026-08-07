/**
 * publish-branch-shelves.ts
 *
 * Lists a branch's existing catalog on the public marketplace, in bulk.
 *
 * A branch can have a full POS catalog and an empty shop: `consumer_visible` on
 * `branch_catalog_product_links` is a separate decision from "this is on my
 * shelf", and for most branches the link rows do not exist at all — only a
 * received purchase order ever created them. So this cannot be an UPDATE. It has
 * to gather the products the branch actually sells (inventory rows, existing
 * links, or a linked vendor catalog) and create the missing links, which is
 * exactly what `RetailOpsService.publishBranchShelf` does behind the Seller HQ
 * button. This script is that button, run for several branches at once, through
 * the same service — not a second implementation of the same rules.
 *
 * Deliberately explicit about which branches. Listing a shop means shoppers can
 * order into its register, and an order arriving at a till nobody is watching is
 * worse for the merchant than not being listed, so there is no "all branches"
 * mode here.
 *
 * Booking-only formats (HOTEL) are skipped: the consumer catalog excludes them
 * by design, because a room is an availability search against dates rather than
 * a cart line. Listing their room-charge products puts nothing in the grid.
 *
 * There is no dry-run mode, on purpose. `publishBranchShelf` creates the missing
 * link rows as part of deciding what to list, so calling it with
 * `consumerVisible: false` still writes — a "dry run" built that way would be a
 * lie. `--commit` is therefore a confirmation flag, not a mode switch: without
 * it the script lists the branches it would touch and stops without opening a
 * connection to anything.
 *
 * Usage:
 *   cd /root/suuq-backend
 *   npx ts-node -r tsconfig-paths/register scripts/publish-branch-shelves.ts 44 78 81
 *   npx ts-node -r tsconfig-paths/register scripts/publish-branch-shelves.ts 44 78 81 --commit
 */

import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { RetailOpsService } from '../src/retail/retail-ops.service';
import { Branch } from '../src/branches/entities/branch.entity';
import { DataSource, In } from 'typeorm';
import { CONSUMER_FORMAT_ORDER_MODES } from '../src/common/service-formats';

/** Mirrors ConsumerCatalogController: a format whose only mode is BOOKING has no grid presence. */
function appearsInCatalog(serviceFormat: string | null | undefined): boolean {
  const modes = CONSUMER_FORMAT_ORDER_MODES[String(serviceFormat ?? '')] ?? [];
  return modes.some((mode) => mode !== 'BOOKING');
}

async function main() {
  const args = process.argv.slice(2);
  const commit = args.includes('--commit');
  const branchIds = args
    .filter((a) => !a.startsWith('--'))
    .map((a) => Number(a))
    .filter((n) => Number.isFinite(n) && n > 0);

  if (!branchIds.length) {
    console.error('Give at least one branch id. Nothing was changed.');
    process.exit(1);
  }

  if (!commit) {
    console.log(
      `Would list the catalogue of branch(es) ${branchIds.join(', ')} on the public marketplace.\n` +
        "Shoppers can order into a listed branch's register. Re-run with --commit to do it.",
    );
    return;
  }

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  try {
    const dataSource = app.get(DataSource);
    const retailOps = app.get(RetailOpsService);
    const branches = await dataSource
      .getRepository(Branch)
      .find({ where: { id: In(branchIds) } });
    const byId = new Map(branches.map((b) => [b.id, b]));

    let totalPublished = 0;
    for (const branchId of branchIds) {
      const branch = byId.get(branchId);
      if (!branch) {
        console.log(`  #${branchId}  SKIP — no such branch`);
        continue;
      }
      if (!branch.isActive) {
        console.log(`  #${branchId}  SKIP — ${branch.name} is inactive`);
        continue;
      }
      if (!appearsInCatalog(branch.serviceFormat)) {
        console.log(
          `  #${branchId}  SKIP — ${branch.name} is ${branch.serviceFormat}, which the catalog excludes (booking-only)`,
        );
        continue;
      }

      const result = await retailOps.publishBranchShelf(branchId, {
        consumerVisible: true,
      });
      totalPublished += result.published;
      console.log(
        `  #${branchId}  ${branch.name} (${branch.serviceFormat}) — ` +
          `${result.total} products, ${result.published} listed, ${result.unchanged} already were`,
      );
    }

    console.log(
      `\nListed ${totalPublished} products across ${branchIds.length} branch(es).`,
    );
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
