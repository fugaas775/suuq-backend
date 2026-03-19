import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateBranchInventoryAndStockMovements1773202000000
  implements MigrationInterface
{
  name = 'CreateBranchInventoryAndStockMovements1773202000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "stock_movements_movementtype_enum" AS ENUM ('PURCHASE_RECEIPT')`,
    );
    await queryRunner.query(
      `CREATE TABLE "branch_inventory" (
        "id" SERIAL NOT NULL,
        "branchId" integer NOT NULL,
        "productId" integer NOT NULL,
        "quantityOnHand" integer NOT NULL DEFAULT 0,
        "reservedQuantity" integer NOT NULL DEFAULT 0,
        "lastReceivedAt" TIMESTAMP,
        "lastPurchaseOrderId" integer,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_branch_inventory_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_branch_inventory_branch_product" UNIQUE ("branchId", "productId")
      )`,
    );
    await queryRunner.query(
      `ALTER TABLE "branch_inventory" ADD CONSTRAINT "FK_branch_inventory_branch" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "branch_inventory" ADD CONSTRAINT "FK_branch_inventory_product" FOREIGN KEY ("productId") REFERENCES "product"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "branch_inventory" ADD CONSTRAINT "FK_branch_inventory_purchase_order" FOREIGN KEY ("lastPurchaseOrderId") REFERENCES "purchase_orders"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );

    await queryRunner.query(
      `CREATE TABLE "stock_movements" (
        "id" SERIAL NOT NULL,
        "branchId" integer NOT NULL,
        "productId" integer NOT NULL,
        "movementType" "stock_movements_movementtype_enum" NOT NULL,
        "quantityDelta" integer NOT NULL,
        "sourceType" character varying(64) NOT NULL,
        "sourceReferenceId" integer,
        "actorUserId" integer,
        "note" text,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_stock_movements_id" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_stock_movements_branch_product_created" ON "stock_movements" ("branchId", "productId", "createdAt")`,
    );
    await queryRunner.query(
      `ALTER TABLE "stock_movements" ADD CONSTRAINT "FK_stock_movements_branch" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "stock_movements" ADD CONSTRAINT "FK_stock_movements_product" FOREIGN KEY ("productId") REFERENCES "product"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "stock_movements" ADD CONSTRAINT "FK_stock_movements_actor" FOREIGN KEY ("actorUserId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "stock_movements" DROP CONSTRAINT IF EXISTS "FK_stock_movements_actor"`,
    );
    await queryRunner.query(
      `ALTER TABLE "stock_movements" DROP CONSTRAINT IF EXISTS "FK_stock_movements_product"`,
    );
    await queryRunner.query(
      `ALTER TABLE "stock_movements" DROP CONSTRAINT IF EXISTS "FK_stock_movements_branch"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_stock_movements_branch_product_created"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "stock_movements"`);
    await queryRunner.query(
      `ALTER TABLE "branch_inventory" DROP CONSTRAINT IF EXISTS "FK_branch_inventory_purchase_order"`,
    );
    await queryRunner.query(
      `ALTER TABLE "branch_inventory" DROP CONSTRAINT IF EXISTS "FK_branch_inventory_product"`,
    );
    await queryRunner.query(
      `ALTER TABLE "branch_inventory" DROP CONSTRAINT IF EXISTS "FK_branch_inventory_branch"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "branch_inventory"`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "stock_movements_movementtype_enum"`,
    );
  }
}
