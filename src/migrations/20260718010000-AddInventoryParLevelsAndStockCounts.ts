import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Inventory primitives for the re-engineered Inventory hub (Phase 3):
 *
 *  - branch_inventory gains "parLevel" (target on-hand) and "reorderPoint"
 *    (re-order threshold). Neither feeds the availableToSell projection — they
 *    are informational thresholds; a reorder breach is availableToSell <
 *    reorderPoint. Default 0 = unset (no target / never breaches).
 *
 *  - stock_counts is the header for a physical / cycle count sheet. The per-line
 *    quantity resets are applied as ordinary ADJUSTMENT stock_movements
 *    (sourceType 'STOCK_COUNT', sourceReferenceId = the count id) via the shared
 *    InventoryLedgerService, so on-hand + availableToSell stay consistent and the
 *    movement ledger remains the single audit trail.
 *
 * Columns are camelCase quoted to match TypeORM's default (property-name) column
 * mapping used across branch_inventory.
 */
export class AddInventoryParLevelsAndStockCounts20260718010000
  implements MigrationInterface
{
  name = 'AddInventoryParLevelsAndStockCounts20260718010000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "branch_inventory" ADD COLUMN IF NOT EXISTS "parLevel" integer NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE "branch_inventory" ADD COLUMN IF NOT EXISTS "reorderPoint" integer NOT NULL DEFAULT 0`,
    );

    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "stock_counts" (
         "id" SERIAL NOT NULL,
         "branchId" integer NOT NULL,
         "countType" character varying(16) NOT NULL DEFAULT 'CYCLE',
         "note" text,
         "countedByUserId" integer,
         "lineCount" integer NOT NULL DEFAULT 0,
         "totalVariance" integer NOT NULL DEFAULT 0,
         "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
         CONSTRAINT "PK_stock_counts" PRIMARY KEY ("id")
       )`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_stock_counts_branch_created"
         ON "stock_counts" ("branchId", "createdAt")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_stock_counts_branch_created"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "stock_counts"`);
    await queryRunner.query(
      `ALTER TABLE "branch_inventory" DROP COLUMN IF EXISTS "reorderPoint"`,
    );
    await queryRunner.query(
      `ALTER TABLE "branch_inventory" DROP COLUMN IF EXISTS "parLevel"`,
    );
  }
}
