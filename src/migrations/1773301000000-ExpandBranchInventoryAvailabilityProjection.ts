import { MigrationInterface, QueryRunner } from 'typeorm';

export class ExpandBranchInventoryAvailabilityProjection1773301000000
  implements MigrationInterface
{
  name = 'ExpandBranchInventoryAvailabilityProjection1773301000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "branch_inventory" ADD COLUMN IF NOT EXISTS "reservedOnline" integer NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE "branch_inventory" ADD COLUMN IF NOT EXISTS "reservedStoreOps" integer NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE "branch_inventory" ADD COLUMN IF NOT EXISTS "inboundOpenPo" integer NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE "branch_inventory" ADD COLUMN IF NOT EXISTS "outboundTransfers" integer NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE "branch_inventory" ADD COLUMN IF NOT EXISTS "safetyStock" integer NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE "branch_inventory" ADD COLUMN IF NOT EXISTS "availableToSell" integer NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE "branch_inventory" ADD COLUMN IF NOT EXISTS "version" integer NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `INSERT INTO "branch_inventory" (
        "branchId",
        "productId",
        "quantityOnHand",
        "reservedQuantity",
        "reservedOnline",
        "reservedStoreOps",
        "inboundOpenPo",
        "outboundTransfers",
        "safetyStock",
        "availableToSell",
        "version",
        "createdAt",
        "updatedAt"
      )
      SELECT
        po."branchId",
        poi."productId",
        0,
        0,
        0,
        0,
        SUM(GREATEST(
          poi."orderedQuantity" - poi."receivedQuantity" - poi."shortageQuantity" - poi."damagedQuantity",
          0
        ))::integer,
        0,
        0,
        0,
        0,
        NOW(),
        NOW()
      FROM "purchase_orders" po
      INNER JOIN "purchase_order_items" poi ON poi."purchaseOrderId" = po."id"
      WHERE po."status" IN ('SUBMITTED', 'ACKNOWLEDGED', 'SHIPPED', 'RECEIVED')
      GROUP BY po."branchId", poi."productId"
      ON CONFLICT ("branchId", "productId") DO NOTHING`,
    );
    await queryRunner.query(
      `WITH open_po AS (
        SELECT
          po."branchId" AS "branchId",
          poi."productId" AS "productId",
          SUM(GREATEST(
            poi."orderedQuantity" - poi."receivedQuantity" - poi."shortageQuantity" - poi."damagedQuantity",
            0
          ))::integer AS "openQuantity"
        FROM "purchase_orders" po
        INNER JOIN "purchase_order_items" poi ON poi."purchaseOrderId" = po."id"
        WHERE po."status" IN ('SUBMITTED', 'ACKNOWLEDGED', 'SHIPPED', 'RECEIVED')
        GROUP BY po."branchId", poi."productId"
      )
      UPDATE "branch_inventory" bi
      SET "inboundOpenPo" = COALESCE(open_po."openQuantity", 0)
      FROM open_po
      WHERE bi."branchId" = open_po."branchId"
        AND bi."productId" = open_po."productId"`,
    );
    await queryRunner.query(
      `UPDATE "branch_inventory"
       SET "availableToSell" = GREATEST(
         "quantityOnHand" - "reservedQuantity" - COALESCE("reservedOnline", 0) - COALESCE("reservedStoreOps", 0) - COALESCE("outboundTransfers", 0) - COALESCE("safetyStock", 0),
         0
       )`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "branch_inventory" DROP COLUMN IF EXISTS "version"`,
    );
    await queryRunner.query(
      `ALTER TABLE "branch_inventory" DROP COLUMN IF EXISTS "availableToSell"`,
    );
    await queryRunner.query(
      `ALTER TABLE "branch_inventory" DROP COLUMN IF EXISTS "safetyStock"`,
    );
    await queryRunner.query(
      `ALTER TABLE "branch_inventory" DROP COLUMN IF EXISTS "outboundTransfers"`,
    );
    await queryRunner.query(
      `ALTER TABLE "branch_inventory" DROP COLUMN IF EXISTS "inboundOpenPo"`,
    );
    await queryRunner.query(
      `ALTER TABLE "branch_inventory" DROP COLUMN IF EXISTS "reservedStoreOps"`,
    );
    await queryRunner.query(
      `ALTER TABLE "branch_inventory" DROP COLUMN IF EXISTS "reservedOnline"`,
    );
  }
}
