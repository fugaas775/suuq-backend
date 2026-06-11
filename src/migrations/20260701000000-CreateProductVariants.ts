import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateProductVariants20260701000000 implements MigrationInterface {
  name = 'CreateProductVariants20260701000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "product_variant" (
        "id" SERIAL NOT NULL,
        "productId" integer NOT NULL,
        "variantKey" character varying(255) NOT NULL,
        "attributes" jsonb,
        "priceOverride" numeric(12,2),
        "isActive" boolean NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_product_variant_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_product_variant_product_key" UNIQUE ("productId", "variantKey"),
        CONSTRAINT "FK_product_variant_product" FOREIGN KEY ("productId") REFERENCES "product"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_product_variant_productId" ON "product_variant" ("productId")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "branch_inventory_variant" (
        "id" SERIAL NOT NULL,
        "branchId" integer NOT NULL,
        "variantId" integer NOT NULL,
        "productId" integer NOT NULL,
        "quantityOnHand" integer NOT NULL DEFAULT 0,
        "reservedQuantity" integer NOT NULL DEFAULT 0,
        "safetyStock" integer NOT NULL DEFAULT 0,
        "availableToSell" integer NOT NULL DEFAULT 0,
        "version" integer NOT NULL DEFAULT 0,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_branch_inventory_variant_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_branch_inventory_variant_branch_variant" UNIQUE ("branchId", "variantId"),
        CONSTRAINT "FK_branch_inventory_variant_branch" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_branch_inventory_variant_variant" FOREIGN KEY ("variantId") REFERENCES "product_variant"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_branch_inventory_variant_branch_product" ON "branch_inventory_variant" ("branchId", "productId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_branch_inventory_variant_variantId" ON "branch_inventory_variant" ("variantId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_branch_inventory_variant_variantId"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_branch_inventory_variant_branch_product"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "branch_inventory_variant"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_product_variant_productId"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "product_variant"`);
  }
}
