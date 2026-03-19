import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateB2BScaffolding1773200000000 implements MigrationInterface {
  name = 'CreateB2BScaffolding1773200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "branch_staff_assignments_role_enum" AS ENUM ('MANAGER', 'OPERATOR')`,
    );
    await queryRunner.query(
      `CREATE TYPE "supplier_profiles_onboardingstatus_enum" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'APPROVED', 'REJECTED')`,
    );
    await queryRunner.query(
      `CREATE TYPE "supplier_offers_status_enum" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED')`,
    );
    await queryRunner.query(
      `CREATE TYPE "supplier_offers_availabilitystatus_enum" AS ENUM ('IN_STOCK', 'LOW_STOCK', 'OUT_OF_STOCK')`,
    );
    await queryRunner.query(
      `CREATE TYPE "purchase_orders_status_enum" AS ENUM ('DRAFT', 'SUBMITTED', 'ACKNOWLEDGED', 'SHIPPED', 'RECEIVED', 'RECONCILED', 'CANCELLED')`,
    );
    await queryRunner.query(
      `CREATE TYPE "partner_credentials_partnertype_enum" AS ENUM ('POS', 'SUPPLIER', 'INTERNAL')`,
    );
    await queryRunner.query(
      `CREATE TYPE "partner_credentials_status_enum" AS ENUM ('ACTIVE', 'REVOKED')`,
    );
    await queryRunner.query(
      `CREATE TYPE "pos_sync_jobs_synctype_enum" AS ENUM ('STOCK_SNAPSHOT', 'STOCK_DELTA', 'SALES_SUMMARY')`,
    );
    await queryRunner.query(
      `CREATE TYPE "pos_sync_jobs_status_enum" AS ENUM ('RECEIVED', 'PROCESSED', 'FAILED')`,
    );

    await queryRunner.query(
      `CREATE TABLE "branches" (
        "id" SERIAL NOT NULL,
        "name" character varying(255) NOT NULL,
        "code" character varying(64),
        "ownerId" integer,
        "address" character varying(255),
        "city" character varying(128),
        "country" character varying(128),
        "timezone" character varying(64),
        "latitude" numeric(10,7),
        "longitude" numeric(10,7),
        "externalRef" character varying(128),
        "isActive" boolean NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_branches_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_branches_code" UNIQUE ("code")
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_branches_ownerId_name" ON "branches" ("ownerId", "name")`,
    );
    await queryRunner.query(
      `ALTER TABLE "branches" ADD CONSTRAINT "FK_branches_owner" FOREIGN KEY ("ownerId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );

    await queryRunner.query(
      `CREATE TABLE "branch_staff_assignments" (
        "id" SERIAL NOT NULL,
        "branchId" integer NOT NULL,
        "userId" integer NOT NULL,
        "role" "branch_staff_assignments_role_enum" NOT NULL,
        "permissions" text NOT NULL DEFAULT '',
        "isActive" boolean NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_branch_staff_assignments_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_branch_staff_assignments_branch_user" UNIQUE ("branchId", "userId")
      )`,
    );
    await queryRunner.query(
      `ALTER TABLE "branch_staff_assignments" ADD CONSTRAINT "FK_branch_staff_assignments_branch" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "branch_staff_assignments" ADD CONSTRAINT "FK_branch_staff_assignments_user" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );

    await queryRunner.query(
      `CREATE TABLE "supplier_profiles" (
        "id" SERIAL NOT NULL,
        "userId" integer NOT NULL,
        "companyName" character varying(255) NOT NULL,
        "legalName" character varying(255),
        "taxId" character varying(128),
        "countriesServed" text array NOT NULL DEFAULT '{}',
        "onboardingStatus" "supplier_profiles_onboardingstatus_enum" NOT NULL DEFAULT 'DRAFT',
        "payoutDetails" character varying(255),
        "isActive" boolean NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_supplier_profiles_id" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `ALTER TABLE "supplier_profiles" ADD CONSTRAINT "FK_supplier_profiles_user" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );

    await queryRunner.query(
      `CREATE TABLE "supplier_offers" (
        "id" SERIAL NOT NULL,
        "supplierProfileId" integer NOT NULL,
        "productId" integer NOT NULL,
        "status" "supplier_offers_status_enum" NOT NULL DEFAULT 'DRAFT',
        "availabilityStatus" "supplier_offers_availabilitystatus_enum" NOT NULL DEFAULT 'IN_STOCK',
        "currency" character varying(3) NOT NULL DEFAULT 'USD',
        "unitWholesalePrice" numeric(12,2) NOT NULL,
        "moq" integer NOT NULL DEFAULT 1,
        "leadTimeDays" integer NOT NULL DEFAULT 0,
        "fulfillmentRegions" text array NOT NULL DEFAULT '{}',
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_supplier_offers_id" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_supplier_offers_supplier_profile_product" ON "supplier_offers" ("supplierProfileId", "productId")`,
    );
    await queryRunner.query(
      `ALTER TABLE "supplier_offers" ADD CONSTRAINT "FK_supplier_offers_supplier_profile" FOREIGN KEY ("supplierProfileId") REFERENCES "supplier_profiles"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "supplier_offers" ADD CONSTRAINT "FK_supplier_offers_product" FOREIGN KEY ("productId") REFERENCES "product"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );

    await queryRunner.query(
      `CREATE TABLE "purchase_orders" (
        "id" SERIAL NOT NULL,
        "orderNumber" character varying(64) NOT NULL,
        "branchId" integer NOT NULL,
        "supplierProfileId" integer NOT NULL,
        "status" "purchase_orders_status_enum" NOT NULL DEFAULT 'DRAFT',
        "currency" character varying(3) NOT NULL DEFAULT 'USD',
        "subtotal" numeric(12,2) NOT NULL DEFAULT '0',
        "total" numeric(12,2) NOT NULL DEFAULT '0',
        "expectedDeliveryDate" date,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_purchase_orders_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_purchase_orders_order_number" UNIQUE ("orderNumber")
      )`,
    );
    await queryRunner.query(
      `ALTER TABLE "purchase_orders" ADD CONSTRAINT "FK_purchase_orders_branch" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "purchase_orders" ADD CONSTRAINT "FK_purchase_orders_supplier_profile" FOREIGN KEY ("supplierProfileId") REFERENCES "supplier_profiles"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );

    await queryRunner.query(
      `CREATE TABLE "purchase_order_items" (
        "id" SERIAL NOT NULL,
        "purchaseOrderId" integer NOT NULL,
        "productId" integer NOT NULL,
        "supplierOfferId" integer,
        "orderedQuantity" integer NOT NULL,
        "receivedQuantity" integer NOT NULL DEFAULT 0,
        "unitPrice" numeric(12,2) NOT NULL,
        CONSTRAINT "PK_purchase_order_items_id" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `ALTER TABLE "purchase_order_items" ADD CONSTRAINT "FK_purchase_order_items_purchase_order" FOREIGN KEY ("purchaseOrderId") REFERENCES "purchase_orders"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "purchase_order_items" ADD CONSTRAINT "FK_purchase_order_items_product" FOREIGN KEY ("productId") REFERENCES "product"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "purchase_order_items" ADD CONSTRAINT "FK_purchase_order_items_supplier_offer" FOREIGN KEY ("supplierOfferId") REFERENCES "supplier_offers"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );

    await queryRunner.query(
      `CREATE TABLE "partner_credentials" (
        "id" SERIAL NOT NULL,
        "name" character varying(255) NOT NULL,
        "partnerType" "partner_credentials_partnertype_enum" NOT NULL,
        "scopes" text NOT NULL DEFAULT '',
        "keyHash" character varying(255) NOT NULL,
        "status" "partner_credentials_status_enum" NOT NULL DEFAULT 'ACTIVE',
        "lastUsedAt" TIMESTAMP,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_partner_credentials_id" PRIMARY KEY ("id")
      )`,
    );

    await queryRunner.query(
      `CREATE TABLE "pos_sync_jobs" (
        "id" SERIAL NOT NULL,
        "branchId" integer,
        "partnerCredentialId" integer,
        "syncType" "pos_sync_jobs_synctype_enum" NOT NULL,
        "status" "pos_sync_jobs_status_enum" NOT NULL DEFAULT 'RECEIVED',
        "externalJobId" character varying(255),
        "idempotencyKey" character varying(255),
        "acceptedCount" integer NOT NULL DEFAULT 0,
        "rejectedCount" integer NOT NULL DEFAULT 0,
        "processedAt" TIMESTAMP,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_pos_sync_jobs_id" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `ALTER TABLE "pos_sync_jobs" ADD CONSTRAINT "FK_pos_sync_jobs_branch" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "pos_sync_jobs" ADD CONSTRAINT "FK_pos_sync_jobs_partner_credential" FOREIGN KEY ("partnerCredentialId") REFERENCES "partner_credentials"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "pos_sync_jobs" DROP CONSTRAINT IF EXISTS "FK_pos_sync_jobs_partner_credential"`,
    );
    await queryRunner.query(
      `ALTER TABLE "pos_sync_jobs" DROP CONSTRAINT IF EXISTS "FK_pos_sync_jobs_branch"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "pos_sync_jobs"`);

    await queryRunner.query(`DROP TABLE IF EXISTS "partner_credentials"`);

    await queryRunner.query(
      `ALTER TABLE "purchase_order_items" DROP CONSTRAINT IF EXISTS "FK_purchase_order_items_supplier_offer"`,
    );
    await queryRunner.query(
      `ALTER TABLE "purchase_order_items" DROP CONSTRAINT IF EXISTS "FK_purchase_order_items_product"`,
    );
    await queryRunner.query(
      `ALTER TABLE "purchase_order_items" DROP CONSTRAINT IF EXISTS "FK_purchase_order_items_purchase_order"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "purchase_order_items"`);

    await queryRunner.query(
      `ALTER TABLE "purchase_orders" DROP CONSTRAINT IF EXISTS "FK_purchase_orders_supplier_profile"`,
    );
    await queryRunner.query(
      `ALTER TABLE "purchase_orders" DROP CONSTRAINT IF EXISTS "FK_purchase_orders_branch"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "purchase_orders"`);

    await queryRunner.query(
      `ALTER TABLE "supplier_offers" DROP CONSTRAINT IF EXISTS "FK_supplier_offers_product"`,
    );
    await queryRunner.query(
      `ALTER TABLE "supplier_offers" DROP CONSTRAINT IF EXISTS "FK_supplier_offers_supplier_profile"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_supplier_offers_supplier_profile_product"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "supplier_offers"`);

    await queryRunner.query(
      `ALTER TABLE "supplier_profiles" DROP CONSTRAINT IF EXISTS "FK_supplier_profiles_user"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "supplier_profiles"`);

    await queryRunner.query(
      `ALTER TABLE "branch_staff_assignments" DROP CONSTRAINT IF EXISTS "FK_branch_staff_assignments_user"`,
    );
    await queryRunner.query(
      `ALTER TABLE "branch_staff_assignments" DROP CONSTRAINT IF EXISTS "FK_branch_staff_assignments_branch"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "branch_staff_assignments"`);

    await queryRunner.query(
      `ALTER TABLE "branches" DROP CONSTRAINT IF EXISTS "FK_branches_owner"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_branches_ownerId_name"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "branches"`);

    await queryRunner.query(`DROP TYPE IF EXISTS "pos_sync_jobs_status_enum"`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "pos_sync_jobs_synctype_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "partner_credentials_status_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "partner_credentials_partnertype_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "purchase_orders_status_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "supplier_offers_availabilitystatus_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "supplier_offers_status_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "supplier_profiles_onboardingstatus_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "branch_staff_assignments_role_enum"`,
    );
  }
}
