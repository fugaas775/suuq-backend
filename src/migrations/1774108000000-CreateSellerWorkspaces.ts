import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSellerWorkspaces1774108000000 implements MigrationInterface {
  name = 'CreateSellerWorkspaces1774108000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('seller_workspaces')) {
      return;
    }

    await queryRunner.query(
      `DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_type WHERE typname = 'seller_workspaces_billingstatus_enum'
        ) THEN
          CREATE TYPE "seller_workspaces_billingstatus_enum" AS ENUM ('NOT_STARTED', 'PLAN_SELECTED', 'TRIAL', 'ACTIVE', 'PAST_DUE', 'CANCELLED');
        END IF;
      END $$`,
    );
    await queryRunner.query(
      `DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_type WHERE typname = 'seller_workspaces_status_enum'
        ) THEN
          CREATE TYPE "seller_workspaces_status_enum" AS ENUM ('ACTIVE', 'ARCHIVED');
        END IF;
      END $$`,
    );
    await queryRunner.query(
      `CREATE TABLE "seller_workspaces" (
        "id" SERIAL NOT NULL,
        "ownerUserId" integer NOT NULL,
        "primaryVendorId" integer,
        "primaryRetailTenantId" integer,
        "selectedPlanCode" character varying(32),
        "billingStatus" "seller_workspaces_billingstatus_enum" NOT NULL DEFAULT 'NOT_STARTED',
        "status" "seller_workspaces_status_enum" NOT NULL DEFAULT 'ACTIVE',
        "planSelectedAt" TIMESTAMP,
        "onboardingState" jsonb,
        "channelState" jsonb,
        "metadata" jsonb,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_seller_workspaces_id" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_seller_workspaces_owner" ON "seller_workspaces" ("ownerUserId")`,
    );
    await queryRunner.query(
      `ALTER TABLE "seller_workspaces" ADD CONSTRAINT "FK_seller_workspaces_owner" FOREIGN KEY ("ownerUserId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "seller_workspaces" ADD CONSTRAINT "FK_seller_workspaces_primary_vendor" FOREIGN KEY ("primaryVendorId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "seller_workspaces" ADD CONSTRAINT "FK_seller_workspaces_primary_tenant" FOREIGN KEY ("primaryRetailTenantId") REFERENCES "retail_tenants"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "seller_workspaces" DROP CONSTRAINT IF EXISTS "FK_seller_workspaces_primary_tenant"`,
    );
    await queryRunner.query(
      `ALTER TABLE "seller_workspaces" DROP CONSTRAINT IF EXISTS "FK_seller_workspaces_primary_vendor"`,
    );
    await queryRunner.query(
      `ALTER TABLE "seller_workspaces" DROP CONSTRAINT IF EXISTS "FK_seller_workspaces_owner"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_seller_workspaces_owner"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "seller_workspaces"`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "seller_workspaces_status_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "seller_workspaces_billingstatus_enum"`,
    );
  }
}
