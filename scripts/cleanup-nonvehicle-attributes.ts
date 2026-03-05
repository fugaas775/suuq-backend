import dataSource from '../src/data-source';
import { Product } from '../src/products/entities/product.entity';

type CliOptions = {
  execute: boolean;
  batchSize: number;
  limit?: number;
};

const VEHICLE_KEYS = [
  'make',
  'model',
  'year',
  'mileage',
  'transmission',
  'fuelType',
  'fuel_type',
  'vehicleType',
  'vehicle_type',
  'engineCapacity',
  'engine_capacity',
] as const;

function parseCli(argv: string[]): CliOptions {
  const opts: CliOptions = {
    execute: false,
    batchSize: 500,
    limit: undefined,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--execute') {
      opts.execute = true;
      continue;
    }

    if (arg === '--dry-run') {
      opts.execute = false;
      continue;
    }

    if (arg === '--batch-size') {
      const value = Number(argv[index + 1]);
      if (Number.isFinite(value) && value > 0) {
        opts.batchSize = Math.min(Math.floor(value), 5000);
      }
      index += 1;
      continue;
    }

    if (arg === '--limit') {
      const value = Number(argv[index + 1]);
      if (Number.isFinite(value) && value > 0) {
        opts.limit = Math.floor(value);
      }
      index += 1;
    }
  }

  return opts;
}

function isVehicleCategoryLike(input?: string | null): boolean {
  const value = String(input || '').toLowerCase();
  if (!value) return false;
  return /(car|truck|motorcycle|auto|boat|vehicle)/i.test(value);
}

function removeVehicleKeys(attrs: Record<string, any>): {
  updated: Record<string, any>;
  removedKeys: string[];
} {
  const next: Record<string, any> = { ...attrs };
  const removed: string[] = [];

  for (const key of VEHICLE_KEYS) {
    if (Object.prototype.hasOwnProperty.call(next, key)) {
      delete next[key];
      removed.push(key);
    }
  }

  return { updated: next, removedKeys: removed };
}

async function run(): Promise<void> {
  const options = parseCli(process.argv.slice(2));

  await dataSource.initialize();
  const repo = dataSource.getRepository(Product);

  let cursor = 0;
  let scanned = 0;
  let candidateCount = 0;
  let updatedCount = 0;
  const keyRemovalCount: Record<string, number> = {};

  console.log('Starting non-vehicle attribute cleanup');
  console.log(
    `Mode=${options.execute ? 'EXECUTE' : 'DRY_RUN'} batchSize=${options.batchSize} limit=${options.limit ?? 'none'}`,
  );

  while (true) {
    const rows = await repo
      .createQueryBuilder('product')
      .leftJoinAndSelect('product.category', 'category')
      .leftJoinAndSelect('category.parent', 'parent')
      .where('product.id > :cursor', { cursor })
      .andWhere('product.deletedAt IS NULL')
      .orderBy('product.id', 'ASC')
      .take(options.batchSize)
      .getMany();

    if (!rows.length) break;

    for (const product of rows) {
      scanned += 1;
      cursor = product.id;

      if (options.limit && scanned > options.limit) {
        console.log('Reached --limit; stopping scan');
        await dataSource.destroy();
        console.log(
          JSON.stringify(
            {
              scanned,
              candidateCount,
              updatedCount,
              keyRemovalCount,
              mode: options.execute ? 'EXECUTE' : 'DRY_RUN',
            },
            null,
            2,
          ),
        );
        return;
      }

      const attrs =
        product.attributes && typeof product.attributes === 'object'
          ? (product.attributes as Record<string, any>)
          : null;
      if (!attrs) continue;

      const hasVehicleKeys = VEHICLE_KEYS.some((key) =>
        Object.prototype.hasOwnProperty.call(attrs, key),
      );
      if (!hasVehicleKeys) continue;

      const categorySlug = String((product.category as any)?.slug || '');
      const categoryName = String((product.category as any)?.name || '');
      const parentSlug = String((product.category as any)?.parent?.slug || '');
      const parentName = String((product.category as any)?.parent?.name || '');

      const isVehicleCategory =
        isVehicleCategoryLike(categorySlug) ||
        isVehicleCategoryLike(categoryName) ||
        isVehicleCategoryLike(parentSlug) ||
        isVehicleCategoryLike(parentName);

      if (isVehicleCategory) continue;

      const { updated, removedKeys } = removeVehicleKeys(attrs);
      if (!removedKeys.length) continue;

      candidateCount += 1;
      for (const key of removedKeys) {
        keyRemovalCount[key] = (keyRemovalCount[key] || 0) + 1;
      }

      if (options.execute) {
        await repo.update(product.id, {
          attributes: Object.keys(updated).length ? updated : {},
        });
        updatedCount += 1;
      }
    }

    if (scanned % 5000 === 0) {
      console.log(
        `Progress scanned=${scanned} candidates=${candidateCount} updated=${updatedCount}`,
      );
    }
  }

  await dataSource.destroy();

  console.log('Cleanup finished');
  console.log(
    JSON.stringify(
      {
        scanned,
        candidateCount,
        updatedCount,
        keyRemovalCount,
        mode: options.execute ? 'EXECUTE' : 'DRY_RUN',
      },
      null,
      2,
    ),
  );
}

run().catch(async (error) => {
  try {
    if (dataSource.isInitialized) {
      await dataSource.destroy();
    }
  } catch {}
  console.error('Cleanup failed', error);
  process.exit(1);
});
