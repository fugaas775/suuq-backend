import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Makes the cross-shop catalog searchable without scanning every shelf.
 *
 * `GET /consumer/v1/catalog` reads `branch_catalog_product_links` across all
 * branches at once, filtered on `consumer_visible` and matched with `ILIKE` on
 * product and shop names. Per-branch reads never needed either index — they
 * probe by `branchId` and take whatever comes back — but a marketplace query
 * without them is a sequential scan of the platform's entire catalog on every
 * keystroke.
 *
 * The link index is partial: listed rows are a small minority of the table
 * (being on a shelf and being listed online are separate decisions), so
 * indexing only those keeps it a fraction of the size.
 *
 * `pg_trgm` is what makes a leading-wildcard `ILIKE '%rice%'` indexable at all;
 * a btree cannot serve one. CREATE EXTENSION needs superuser or a pre-installed
 * extension, so it is guarded — on a database where it cannot be created the
 * search still returns correct results, just without index support.
 */
export class AddConsumerCatalogIndexes20260807000000
  implements MigrationInterface
{
  name = 'AddConsumerCatalogIndexes20260807000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_branch_catalog_links_consumer_visible" ` +
        `ON "branch_catalog_product_links" ("branchId", "productId") ` +
        `WHERE "consumer_visible" = true`,
    );

    try {
      await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);
      await queryRunner.query(
        `CREATE INDEX IF NOT EXISTS "IDX_product_name_trgm" ` +
          `ON "product" USING gin (name gin_trgm_ops)`,
      );
      await queryRunner.query(
        `CREATE INDEX IF NOT EXISTS "IDX_branches_name_trgm" ` +
          `ON "branches" USING gin (name gin_trgm_ops)`,
      );
    } catch {
      // No pg_trgm available. Search degrades to a scan rather than failing the
      // deploy — the catalog is still correct, just slower on free text.
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_branches_name_trgm"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_product_name_trgm"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_branch_catalog_links_consumer_visible"`,
    );
  }
}
