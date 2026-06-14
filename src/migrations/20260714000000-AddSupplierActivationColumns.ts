import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds the supplier go-live billing lifecycle to supplier_profiles:
 *   - activationStatus (enum, default PENDING_PAYMENT)
 *   - lastActivatedAt (timestamptz)
 *
 * Already-approved suppliers are backfilled to ACTIVE so the new payment gate
 * does not regress accounts that pre-date this change.
 */
export class AddSupplierActivationColumns20260714000000
  implements MigrationInterface
{
  name = 'AddSupplierActivationColumns20260714000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_type
          WHERE typname = 'supplier_profiles_activationstatus_enum'
        ) THEN
          CREATE TYPE "public"."supplier_profiles_activationstatus_enum" AS ENUM (
            'PENDING_PAYMENT', 'ACTIVE', 'PAST_DUE', 'EXPIRED', 'CANCELLED'
          );
        END IF;
      END
      $$;
    `);
    await queryRunner.query(
      `ALTER TABLE "supplier_profiles" ADD COLUMN IF NOT EXISTS "activationStatus" "public"."supplier_profiles_activationstatus_enum" NOT NULL DEFAULT 'PENDING_PAYMENT'`,
    );
    await queryRunner.query(
      `ALTER TABLE "supplier_profiles" ADD COLUMN IF NOT EXISTS "lastActivatedAt" TIMESTAMP WITH TIME ZONE`,
    );
    // Preserve already-approved suppliers as active (don't lock them behind payment).
    await queryRunner.query(
      `UPDATE "supplier_profiles" SET "activationStatus" = 'ACTIVE' WHERE "onboardingStatus" = 'APPROVED'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "supplier_profiles" DROP COLUMN IF EXISTS "lastActivatedAt"`,
    );
    await queryRunner.query(
      `ALTER TABLE "supplier_profiles" DROP COLUMN IF EXISTS "activationStatus"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."supplier_profiles_activationstatus_enum"`,
    );
  }
}
