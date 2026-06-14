import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateVendorStores20260602000000 implements MigrationInterface {
  name = 'CreateVendorStores20260602000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Create the vendor_stores table
    await queryRunner.query(`
      CREATE TABLE "vendor_stores" (
        "id" SERIAL NOT NULL,
        "ownerUserId" integer NOT NULL,
        "branchId" integer UNIQUE,
        "storeName" character varying(255) NOT NULL,
        "isConsumerVisible" boolean NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_vendor_stores" PRIMARY KEY ("id"),
        CONSTRAINT "FK_vendor_stores_owner" FOREIGN KEY ("ownerUserId")
          REFERENCES "user"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_vendor_stores_branch" FOREIGN KEY ("branchId")
          REFERENCES "branches"("id") ON DELETE SET NULL
      )
    `);

    // 2. Add vendorStoreId to branches (nullable, unique — at most one VendorStore per branch)
    await queryRunner.query(`
      ALTER TABLE "branches"
        ADD COLUMN IF NOT EXISTS "vendorStoreId" integer UNIQUE
    `);

    await queryRunner.query(`
      ALTER TABLE "branches"
        ADD CONSTRAINT "FK_branches_vendor_store"
          FOREIGN KEY ("vendorStoreId") REFERENCES "vendor_stores"("id")
          ON DELETE SET NULL
        NOT VALID
    `);

    // 3. Add vendorStoreId to product (nullable — null means account-wide product)
    await queryRunner.query(`
      ALTER TABLE "product"
        ADD COLUMN IF NOT EXISTS "vendor_store_id" integer
    `);

    await queryRunner.query(`
      ALTER TABLE "product"
        ADD CONSTRAINT "FK_product_vendor_store"
          FOREIGN KEY ("vendor_store_id") REFERENCES "vendor_stores"("id")
          ON DELETE SET NULL
        NOT VALID
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "product" DROP CONSTRAINT IF EXISTS "FK_product_vendor_store"`,
    );
    await queryRunner.query(
      `ALTER TABLE "product" DROP COLUMN IF EXISTS "vendor_store_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "branches" DROP CONSTRAINT IF EXISTS "FK_branches_vendor_store"`,
    );
    await queryRunner.query(
      `ALTER TABLE "branches" DROP COLUMN IF EXISTS "vendorStoreId"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "vendor_stores"`);
  }
}
