import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateRetailTenantSubscriptions1773300000000
  implements MigrationInterface
{
  name = 'CreateRetailTenantSubscriptions1773300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "retail_tenants_status_enum" AS ENUM ('ACTIVE', 'SUSPENDED', 'ARCHIVED')`,
    );
    await queryRunner.query(
      `CREATE TYPE "tenant_module_entitlements_module_enum" AS ENUM ('POS_CORE', 'INVENTORY_CORE', 'INVENTORY_AUTOMATION', 'DESKTOP_BACKOFFICE', 'ACCOUNTING', 'HR_ATTENDANCE', 'ERP_CONNECTORS', 'AI_ANALYTICS')`,
    );
    await queryRunner.query(
      `CREATE TYPE "tenant_subscriptions_status_enum" AS ENUM ('TRIAL', 'ACTIVE', 'PAST_DUE', 'CANCELLED', 'EXPIRED')`,
    );
    await queryRunner.query(
      `CREATE TYPE "tenant_subscriptions_billinginterval_enum" AS ENUM ('MONTHLY', 'YEARLY', 'CUSTOM')`,
    );

    await queryRunner.query(
      `CREATE TABLE "retail_tenants" (
        "id" SERIAL NOT NULL,
        "name" character varying(255) NOT NULL,
        "code" character varying(32),
        "status" "retail_tenants_status_enum" NOT NULL DEFAULT 'ACTIVE',
        "billingEmail" character varying(255),
        "defaultCurrency" character varying(8),
        "ownerUserId" integer,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_retail_tenants_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_retail_tenants_name" UNIQUE ("name"),
        CONSTRAINT "UQ_retail_tenants_code" UNIQUE ("code")
      )`,
    );

    await queryRunner
      .query(
        `ALTER TABLE "retail_tenants" ADD CONSTRAINT "FK_retail_tenants_owner" FOREIGN KEY ("ownerUserId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
      )
      .catch(() => undefined);

    await queryRunner.query(
      `ALTER TABLE "branches" ADD COLUMN IF NOT EXISTS "retailTenantId" integer`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_branches_retail_tenant" ON "branches" ("retailTenantId")`,
    );
    await queryRunner
      .query(
        `ALTER TABLE "branches" ADD CONSTRAINT "FK_branches_retail_tenant" FOREIGN KEY ("retailTenantId") REFERENCES "retail_tenants"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
      )
      .catch(() => undefined);

    await queryRunner.query(
      `CREATE TABLE "tenant_subscriptions" (
        "id" SERIAL NOT NULL,
        "tenantId" integer NOT NULL,
        "planCode" character varying(64) NOT NULL,
        "status" "tenant_subscriptions_status_enum" NOT NULL,
        "billingInterval" "tenant_subscriptions_billinginterval_enum" NOT NULL DEFAULT 'MONTHLY',
        "amount" numeric(12,2),
        "currency" character varying(8),
        "startsAt" TIMESTAMP NOT NULL,
        "endsAt" TIMESTAMP,
        "autoRenew" boolean NOT NULL DEFAULT false,
        "metadata" jsonb,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_tenant_subscriptions_id" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `ALTER TABLE "tenant_subscriptions" ADD CONSTRAINT "FK_tenant_subscriptions_tenant" FOREIGN KEY ("tenantId") REFERENCES "retail_tenants"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );

    await queryRunner.query(
      `CREATE TABLE "tenant_module_entitlements" (
        "id" SERIAL NOT NULL,
        "tenantId" integer NOT NULL,
        "module" "tenant_module_entitlements_module_enum" NOT NULL,
        "enabled" boolean NOT NULL DEFAULT true,
        "startsAt" TIMESTAMP,
        "expiresAt" TIMESTAMP,
        "reason" text,
        "metadata" jsonb,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_tenant_module_entitlements_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_tenant_module_entitlements_tenant_module" UNIQUE ("tenantId", "module")
      )`,
    );
    await queryRunner.query(
      `ALTER TABLE "tenant_module_entitlements" ADD CONSTRAINT "FK_tenant_module_entitlements_tenant" FOREIGN KEY ("tenantId") REFERENCES "retail_tenants"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "tenant_module_entitlements" DROP CONSTRAINT IF EXISTS "FK_tenant_module_entitlements_tenant"`,
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS "tenant_module_entitlements"`,
    );

    await queryRunner.query(
      `ALTER TABLE "tenant_subscriptions" DROP CONSTRAINT IF EXISTS "FK_tenant_subscriptions_tenant"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "tenant_subscriptions"`);

    await queryRunner.query(
      `ALTER TABLE "branches" DROP CONSTRAINT IF EXISTS "FK_branches_retail_tenant"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_branches_retail_tenant"`,
    );
    await queryRunner.query(
      `ALTER TABLE "branches" DROP COLUMN IF EXISTS "retailTenantId"`,
    );

    await queryRunner.query(
      `ALTER TABLE "retail_tenants" DROP CONSTRAINT IF EXISTS "FK_retail_tenants_owner"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "retail_tenants"`);

    await queryRunner.query(
      `DROP TYPE IF EXISTS "tenant_module_entitlements_module_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "tenant_subscriptions_billinginterval_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "tenant_subscriptions_status_enum"`,
    );
    await queryRunner.query(`DROP TYPE IF EXISTS "retail_tenants_status_enum"`);
  }
}
