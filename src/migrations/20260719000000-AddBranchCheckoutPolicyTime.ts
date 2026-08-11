import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds a per-branch HOTEL checkout-time policy to branches.
 *
 * Stored as "HH:MM" 24h EAT (e.g. "11:00", "11:30", "10:30"). Drives the
 * seeded folio default check-in/checkout time and the early-check-in /
 * late-checkout fee boundary on the register. Null = use the global 11:00
 * default. HOTEL-only; other service formats ignore it.
 */
export class AddBranchCheckoutPolicyTime20260719000000
  implements MigrationInterface
{
  name = 'AddBranchCheckoutPolicyTime20260719000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "branches" ADD COLUMN IF NOT EXISTS "checkoutPolicyTime" character varying(5)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "branches" DROP COLUMN IF EXISTS "checkoutPolicyTime"`,
    );
  }
}
