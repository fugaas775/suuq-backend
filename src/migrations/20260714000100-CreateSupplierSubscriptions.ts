import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates supplier_subscriptions — the supplier (wholesaler) account billing
 * table. Separate from tenant_subscriptions (which is bound to RetailTenant/
 * Branch) to keep the live POS billing path untouched; reuses the same
 * status/interval value sets via table-scoped enum types.
 */
export class CreateSupplierSubscriptions20260714000100
  implements MigrationInterface
{
  name = 'CreateSupplierSubscriptions20260714000100';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_type WHERE typname = 'supplier_subscriptions_status_enum'
        ) THEN
          CREATE TYPE "public"."supplier_subscriptions_status_enum" AS ENUM (
            'TRIAL', 'ACTIVE', 'PAST_DUE', 'CANCELLED', 'EXPIRED'
          );
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM pg_type WHERE typname = 'supplier_subscriptions_billinginterval_enum'
        ) THEN
          CREATE TYPE "public"."supplier_subscriptions_billinginterval_enum" AS ENUM (
            'MONTHLY', 'YEARLY', 'CUSTOM', 'SIX_MONTHS', 'ONE_YEAR'
          );
        END IF;
      END
      $$;
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "supplier_subscriptions" (
        "id" SERIAL NOT NULL,
        "supplierProfileId" integer NOT NULL,
        "planCode" character varying(64) NOT NULL,
        "status" "public"."supplier_subscriptions_status_enum" NOT NULL,
        "billingInterval" "public"."supplier_subscriptions_billinginterval_enum" NOT NULL DEFAULT 'MONTHLY',
        "amount" numeric(12,2),
        "currency" character varying(8),
        "periodMonths" integer,
        "amountTotal" numeric(12,2),
        "startsAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "endsAt" TIMESTAMP WITH TIME ZONE,
        "autoRenew" boolean NOT NULL DEFAULT false,
        "metadata" jsonb,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_supplier_subscriptions" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_supplier_subscriptions_profile"
        ON "supplier_subscriptions" ("supplierProfileId")
    `);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE constraint_name = 'FK_supplier_subscriptions_profile'
        ) THEN
          ALTER TABLE "supplier_subscriptions"
            ADD CONSTRAINT "FK_supplier_subscriptions_profile"
            FOREIGN KEY ("supplierProfileId")
            REFERENCES "supplier_profiles"("id") ON DELETE CASCADE;
        END IF;
      END
      $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "supplier_subscriptions"`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."supplier_subscriptions_status_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."supplier_subscriptions_billinginterval_enum"`,
    );
  }
}
