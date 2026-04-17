import 'reflect-metadata';
import dataSource from '../src/data-source';
import { Branch } from '../src/branches/entities/branch.entity';
import { BranchInventory } from '../src/branches/entities/branch-inventory.entity';
import {
  StockMovement,
  StockMovementType,
} from '../src/branches/entities/stock-movement.entity';
import { Product } from '../src/products/entities/product.entity';

type BackfillOptions = {
  branchId: number;
  vendorId: number | null;
  dryRun: boolean;
};

function parseArgs(argv: string[]): BackfillOptions {
  const values = new Map<string, string | boolean>();

  for (let index = 0; index < argv.length; index += 1) {
    const token = String(argv[index] || '').trim();
    if (!token.startsWith('--')) {
      continue;
    }

    const [rawKey, inlineValue] = token.slice(2).split('=', 2);
    const key = rawKey.trim();
    if (!key) {
      continue;
    }

    if (inlineValue !== undefined) {
      values.set(key, inlineValue);
      continue;
    }

    const nextToken = String(argv[index + 1] || '').trim();
    if (nextToken && !nextToken.startsWith('--')) {
      values.set(key, nextToken);
      index += 1;
      continue;
    }

    values.set(key, true);
  }

  const branchId = Number(values.get('branchId'));
  const vendorIdRaw = values.get('vendorId');
  const vendorId = vendorIdRaw === undefined ? null : Number(vendorIdRaw);
  const dryRun =
    values.get('dry-run') === true || values.get('dryRun') === true;

  if (!Number.isInteger(branchId) || branchId <= 0) {
    throw new Error('Pass a valid --branchId, for example --branchId=21');
  }

  if (
    vendorIdRaw !== undefined &&
    (!Number.isInteger(vendorId) || vendorId <= 0)
  ) {
    throw new Error('If provided, --vendorId must be a positive integer');
  }

  return {
    branchId,
    vendorId: vendorIdRaw === undefined ? null : vendorId,
    dryRun,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const ds = await dataSource.initialize();

  try {
    const branchRepository = ds.getRepository(Branch);
    const productRepository = ds.getRepository(Product);
    const inventoryRepository = ds.getRepository(BranchInventory);
    const stockMovementRepository = ds.getRepository(StockMovement);

    const branch = await branchRepository.findOne({
      where: { id: options.branchId },
    });

    if (!branch) {
      throw new Error(`Branch ${options.branchId} was not found`);
    }

    const effectiveVendorId = options.vendorId ?? branch.ownerId ?? null;

    if (!Number.isInteger(effectiveVendorId) || effectiveVendorId <= 0) {
      throw new Error(
        `Branch ${options.branchId} does not have an ownerId. Re-run with --vendorId=<sellerUserId>.`,
      );
    }

    const products = await productRepository.find({
      where: {
        vendor: { id: effectiveVendorId },
        status: 'publish',
      },
      select: {
        id: true,
        name: true,
        productType: true,
        stockQuantity: true,
      },
      relations: {
        vendor: true,
      },
      order: {
        id: 'ASC',
      },
    });

    const eligibleProducts = products.filter((product) => {
      const productType = String(product.productType || 'physical')
        .trim()
        .toLowerCase();
      return productType !== 'digital' && productType !== 'property';
    });

    const existingInventoryRows = await inventoryRepository.find({
      where: { branchId: branch.id },
      select: {
        id: true,
        productId: true,
      },
    });
    const existingProductIds = new Set(
      existingInventoryRows.map((item) => item.productId),
    );

    const missingProducts = eligibleProducts.filter(
      (product) => !existingProductIds.has(product.id),
    );

    console.log(
      `[backfill-branch-inventory] Branch ${branch.id} (${branch.name}) using vendor ${effectiveVendorId}. ${eligibleProducts.length} eligible published products, ${missingProducts.length} missing inventory rows.`,
    );

    if (!missingProducts.length) {
      console.log('[backfill-branch-inventory] Nothing to backfill.');
      return;
    }

    if (options.dryRun) {
      missingProducts.slice(0, 20).forEach((product) => {
        console.log(
          `[dry-run] would backfill product ${product.id} (${product.name}) with stockQuantity=${Number(product.stockQuantity || 0)}`,
        );
      });

      if (missingProducts.length > 20) {
        console.log(
          `[dry-run] ...and ${missingProducts.length - 20} more product(s).`,
        );
      }
      return;
    }

    await ds.transaction(async (manager) => {
      const transactionalInventoryRepository =
        manager.getRepository(BranchInventory);
      const transactionalStockMovementRepository =
        manager.getRepository(StockMovement);

      for (const product of missingProducts) {
        const quantityOnHand = Math.max(
          0,
          Math.trunc(Number(product.stockQuantity || 0)),
        );

        await transactionalInventoryRepository.save(
          transactionalInventoryRepository.create({
            branchId: branch.id,
            productId: product.id,
            quantityOnHand,
            reservedQuantity: 0,
            reservedOnline: 0,
            reservedStoreOps: 0,
            inboundOpenPo: 0,
            outboundTransfers: 0,
            safetyStock: 0,
            availableToSell: quantityOnHand,
            version: 0,
          }),
        );

        await transactionalStockMovementRepository.save(
          transactionalStockMovementRepository.create({
            branchId: branch.id,
            productId: product.id,
            movementType: StockMovementType.ADJUSTMENT,
            quantityDelta: quantityOnHand,
            sourceType: 'IMPORT_BACKFILL',
            sourceReferenceId: product.id,
            actorUserId: effectiveVendorId,
            note:
              quantityOnHand > 0
                ? 'Backfilled branch inventory from existing imported product stock quantity.'
                : 'Created missing branch inventory row for existing imported product.',
          }),
        );
      }
    });

    console.log(
      `[backfill-branch-inventory] Backfilled ${missingProducts.length} product(s) into branch ${branch.id}.`,
    );
  } finally {
    await ds.destroy();
  }
}

main().catch((error) => {
  console.error('[backfill-branch-inventory] Failed:', error);
  process.exitCode = 1;
});
