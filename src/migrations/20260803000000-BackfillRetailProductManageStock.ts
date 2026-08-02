import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Set `product.manage_stock = true` for products a RETAIL branch actually counts.
 *
 * `manage_stock` defaults to false and pos-s never set it, so in production 82 of
 * 83 RETAIL branch_inventory rows sat on products flagged "not stock managed" —
 * even though those inventory rows exist precisely because the branch received,
 * counted or adjusted the goods. The flag was simply a lie about the data, and
 * every reader of it (partner-POS sync, the marketplace "Only N left!" badge,
 * any future report) read the lie.
 *
 * Scope is deliberately narrow: only products that (a) have a branch_inventory
 * row (b) in a branch whose serviceFormat is RETAIL and (c) are currently false.
 * Nothing else is touched — QSR/CAFETERIA keep "made to order, always available".
 *
 * DEPLOY ORDER MATTERS. The POS checkout clamp (pos-checkout.service.ts, "make
 * POS sales actually decrement branch stock") must be live BEFORE this runs.
 * Without it, flipping the flag makes every sale of a zero-on-hand SKU throw on
 * the negative-stock guard, which fails the whole checkout — trading a stale
 * count for lost revenue.
 *
 * `retail_manage_stock_backfill` is the rollback ledger: down() flips back
 * exactly the ids up() flipped and nothing else, so a product that was already
 * true, or that a human turns on afterwards, survives a revert untouched.
 */
export class BackfillRetailProductManageStock20260803000000
  implements MigrationInterface
{
  name = 'BackfillRetailProductManageStock20260803000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "retail_manage_stock_backfill" (
        "productId" integer PRIMARY KEY,
        "backfilledAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      INSERT INTO "retail_manage_stock_backfill" ("productId")
      SELECT DISTINCT bi."productId"
        FROM "branch_inventory" bi
        JOIN "branches" b ON b."id" = bi."branchId"
        JOIN "product" p ON p."id" = bi."productId"
       WHERE UPPER(TRIM(COALESCE(b."serviceFormat", ''))) = 'RETAIL'
         AND COALESCE(p."manage_stock", false) = false
      ON CONFLICT ("productId") DO NOTHING
    `);

    await queryRunner.query(`
      UPDATE "product"
         SET "manage_stock" = true
       WHERE "id" IN (SELECT "productId" FROM "retail_manage_stock_backfill")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_schema = 'public'
            AND table_name = 'retail_manage_stock_backfill'
        ) THEN
          UPDATE "product"
             SET "manage_stock" = false
           WHERE "id" IN (SELECT "productId" FROM "retail_manage_stock_backfill");
        END IF;
      END $$;
    `);

    await queryRunner.query(
      `DROP TABLE IF EXISTS "retail_manage_stock_backfill"`,
    );
  }
}
