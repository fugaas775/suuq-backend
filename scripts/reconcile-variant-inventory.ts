/**
 * One-time backfill: reconcile every variant product's product-level on-hand to
 * the sum of its variants, healing rows that drifted (e.g. a product created
 * with independent base stock while its variants sit at 0 — showing "N left"
 * on the register while every variant is out of stock).
 *
 * Usage: yarn reconcile:variant-inventory [--branchId=92]
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { VariantInventoryService } from '../src/branches/variant-inventory.service';

async function main() {
  const branchArg = process.argv
    .find((a) => a.startsWith('--branchId='))
    ?.split('=')[1];
  const branchFilter = branchArg ? Number(branchArg) : null;

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  const ds = app.get(DataSource);
  const variants = app.get(VariantInventoryService);

  try {
    const pairs: { branchId: number; productId: number }[] = await ds.query(
      branchFilter
        ? 'SELECT DISTINCT "branchId", "productId" FROM branch_inventory_variant WHERE "branchId" = $1'
        : 'SELECT DISTINCT "branchId", "productId" FROM branch_inventory_variant',
      branchFilter ? [branchFilter] : [],
    );

    let corrected = 0;
    for (const { branchId, productId } of pairs) {
      const sum = await variants.reconcileProductFromVariants(
        Number(branchId),
        Number(productId),
      );
      console.log(
        `branch ${branchId} product ${productId} → product on-hand set to ${sum}`,
      );
      corrected += 1;
    }
    console.log(`\nReconciled ${corrected} variant product(s).`);
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
