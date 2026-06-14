import { MigrationInterface, QueryRunner } from 'typeorm';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Full-schema baseline, captured from prod (db/baseline/schema.sql).
 *
 * The project's base schema was created out-of-band: ~62 of the 118 tables —
 * including the core `product` / `branches` / `"user"` and the whole B2B
 * `purchase_orders` / `supplier_*` family — have no CREATE migration, so a fresh
 * database cannot be bootstrapped from src/migrations alone. This migration
 * closes that gap by materialising the captured schema on an empty database.
 *
 * SAFE BY CONSTRUCTION: it only runs against a genuinely empty DB. On any
 * existing database (prod, an already-provisioned test DB) the core tables
 * already exist, so it no-ops and changes nothing — it will record itself as
 * applied on the next prod deploy without touching the schema.
 *
 * ADOPTION (fresh dev / CI): because this baseline already contains the effects
 * of the existing incremental migrations, those incrementals conflict with it on
 * a fresh DB and must be squashed/retired (moved off the migration path) so only
 * this baseline + any NEW migrations run. Verify on a throwaway database first:
 *   createdb suuq_baseline_test
 *   DB_DATABASE=suuq_baseline_test yarn migration:run
 * Re-capture db/baseline/schema.sql from prod immediately before adopting.
 */
export class BaselineSchema0000000000000 implements MigrationInterface {
  name = 'BaselineSchema0000000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Only bootstrap an empty database; never mutate an existing one.
    if (await queryRunner.hasTable('product')) {
      return;
    }

    const schemaPath = join(
      __dirname,
      '..',
      '..',
      'db',
      'baseline',
      'schema.sql',
    );
    const raw = readFileSync(schemaPath, 'utf8');

    // Strip psql meta-commands (\restrict, \unrestrict, \connect, …) that the
    // pg driver cannot execute; everything else is plain SQL the driver runs as
    // a single multi-statement batch.
    const sql = raw
      .split('\n')
      .filter((line) => !line.startsWith('\\'))
      .join('\n');

    await queryRunner.query(sql);
  }

  public down(): Promise<void> {
    // A whole-schema baseline is not reversible.
    return Promise.reject(new Error('BaselineSchema is not reversible'));
  }
}
