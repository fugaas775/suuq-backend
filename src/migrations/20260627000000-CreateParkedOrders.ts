import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates the parked_orders table backing the "Park Order" feature: a
 * no-payment purchase intent a shopper leaves for a vendor/branch to follow up
 * via Call/WhatsApp. Visible in the Suuq S app (vendor) and pos-s (branch).
 */
export class CreateParkedOrders20260627000000 implements MigrationInterface {
  name = 'CreateParkedOrders20260627000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "parked_orders_source_enum" AS ENUM ('PRODUCT_DETAILS', 'FEED', 'CHAT', 'REQUEST');
      EXCEPTION WHEN duplicate_object THEN null; END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "parked_orders_status_enum" AS ENUM ('PARKED', 'CONTACTED', 'CONVERTED', 'CANCELLED');
      EXCEPTION WHEN duplicate_object THEN null; END $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "parked_orders" (
        "id" SERIAL PRIMARY KEY,
        "productId" integer,
        "productName" varchar(255),
        "productImageUrl" varchar(1024),
        "vendorId" integer NOT NULL,
        "branchId" integer,
        "quantity" integer NOT NULL DEFAULT 1,
        "unitPrice" numeric(12,2),
        "currency" varchar(3),
        "attributes" jsonb,
        "customerUserId" integer,
        "customerName" varchar(160),
        "customerPhone" varchar(40),
        "note" text,
        "source" "parked_orders_source_enum" NOT NULL DEFAULT 'PRODUCT_DETAILS',
        "status" "parked_orders_status_enum" NOT NULL DEFAULT 'PARKED',
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_parked_orders_vendor_status" ON "parked_orders" ("vendorId", "status")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_parked_orders_branch_status" ON "parked_orders" ("branchId", "status")`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_parked_orders_branch_status"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_parked_orders_vendor_status"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "parked_orders"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "parked_orders_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "parked_orders_source_enum"`);
  }
}
