import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateKitchenProductAvailability20260604000000
  implements MigrationInterface
{
  name = 'CreateKitchenProductAvailability20260604000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "pos_kitchen_product_availability" (
        "id" SERIAL NOT NULL,
        "branchId" integer NOT NULL,
        "productId" character varying(128) NOT NULL,
        "available" boolean NOT NULL DEFAULT false,
        "qtyRemaining" integer,
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_pos_kitchen_prod_avail_id" PRIMARY KEY ("id"),
        CONSTRAINT "uq_pos_kitchen_prod_avail_branch_product" UNIQUE ("branchId", "productId")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_pos_kitchen_prod_avail_branch" ON "pos_kitchen_product_availability" ("branchId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_pos_kitchen_prod_avail_branch"`,
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS "pos_kitchen_product_availability"`,
    );
  }
}
