import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateProductAliases1773801000000 implements MigrationInterface {
  name = 'CreateProductAliases1773801000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('product_aliases')) {
      return;
    }

    await queryRunner.query(
      `DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_type WHERE typname = 'product_aliases_aliastype_enum'
        ) THEN
          CREATE TYPE "product_aliases_aliastype_enum" AS ENUM ('LOCAL_SKU', 'BARCODE', 'GTIN', 'EXTERNAL_PRODUCT_ID');
        END IF;
      END $$`,
    );
    await queryRunner.query(
      `CREATE TABLE "product_aliases" (
        "id" SERIAL NOT NULL,
        "tenantId" integer NOT NULL,
        "branchId" integer,
        "partnerCredentialId" integer,
        "productId" integer NOT NULL,
        "aliasType" "product_aliases_aliastype_enum" NOT NULL,
        "aliasValue" character varying(255) NOT NULL,
        "normalizedAliasValue" character varying(255) NOT NULL,
        "isActive" boolean NOT NULL DEFAULT true,
        "metadata" jsonb,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_product_aliases_id" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_product_aliases_tenant_lookup" ON "product_aliases" ("tenantId", "aliasType", "normalizedAliasValue")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_product_aliases_branch_lookup" ON "product_aliases" ("branchId", "aliasType", "normalizedAliasValue")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_product_aliases_partner_lookup" ON "product_aliases" ("partnerCredentialId", "aliasType", "normalizedAliasValue")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_product_aliases_tenant_scope" ON "product_aliases" ("tenantId", "aliasType", "normalizedAliasValue") WHERE "branchId" IS NULL AND "partnerCredentialId" IS NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_product_aliases_branch_scope" ON "product_aliases" ("branchId", "aliasType", "normalizedAliasValue") WHERE "branchId" IS NOT NULL AND "partnerCredentialId" IS NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_product_aliases_partner_scope" ON "product_aliases" ("partnerCredentialId", "aliasType", "normalizedAliasValue") WHERE "partnerCredentialId" IS NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_aliases" ADD CONSTRAINT "FK_product_aliases_tenant" FOREIGN KEY ("tenantId") REFERENCES "retail_tenants"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_aliases" ADD CONSTRAINT "FK_product_aliases_branch" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_aliases" ADD CONSTRAINT "FK_product_aliases_partner_credential" FOREIGN KEY ("partnerCredentialId") REFERENCES "partner_credentials"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_aliases" ADD CONSTRAINT "FK_product_aliases_product" FOREIGN KEY ("productId") REFERENCES "product"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "product_aliases" DROP CONSTRAINT IF EXISTS "FK_product_aliases_product"`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_aliases" DROP CONSTRAINT IF EXISTS "FK_product_aliases_partner_credential"`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_aliases" DROP CONSTRAINT IF EXISTS "FK_product_aliases_branch"`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_aliases" DROP CONSTRAINT IF EXISTS "FK_product_aliases_tenant"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "UQ_product_aliases_partner_scope"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "UQ_product_aliases_branch_scope"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "UQ_product_aliases_tenant_scope"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_product_aliases_partner_lookup"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_product_aliases_branch_lookup"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_product_aliases_tenant_lookup"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "product_aliases"`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "product_aliases_aliastype_enum"`,
    );
  }
}
