import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Switch tenant_subscriptions to per-branch billing with explicit period
 * length and total amount. Existing legacy MONTHLY rows are preserved with
 * NULL branchId/periodMonths/amountTotal so they continue to function as
 * tenant-wide records until the next renewal upgrades them.
 */
export class AddTenantSubscriptionPeriodAndBranch20260501000000
  implements MigrationInterface
{
  name = 'AddTenantSubscriptionPeriodAndBranch20260501000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "tenant_subscriptions" ADD COLUMN IF NOT EXISTS "periodMonths" integer NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "tenant_subscriptions" ADD COLUMN IF NOT EXISTS "amountTotal" numeric(12,2) NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "tenant_subscriptions" ADD COLUMN IF NOT EXISTS "branchId" integer NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_tenant_subscriptions_branchId" ON "tenant_subscriptions" ("branchId") WHERE "branchId" IS NOT NULL`,
    );

    // Extend the billing-interval enum to include the new per-branch periods.
    // Postgres needs ALTER TYPE ADD VALUE statements (idempotent via IF NOT EXISTS).
    await queryRunner.query(
      `ALTER TYPE "tenant_subscriptions_billinginterval_enum" ADD VALUE IF NOT EXISTS 'SIX_MONTHS'`,
    );
    await queryRunner.query(
      `ALTER TYPE "tenant_subscriptions_billinginterval_enum" ADD VALUE IF NOT EXISTS 'ONE_YEAR'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Postgres cannot drop enum values; leave the enum as-is on rollback.
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_tenant_subscriptions_branchId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tenant_subscriptions" DROP COLUMN IF EXISTS "branchId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tenant_subscriptions" DROP COLUMN IF EXISTS "amountTotal"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tenant_subscriptions" DROP COLUMN IF EXISTS "periodMonths"`,
    );
  }
}
