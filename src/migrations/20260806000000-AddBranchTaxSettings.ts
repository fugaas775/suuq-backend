import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds the per-branch tax (VAT) setting to branches.
 *
 * `taxEnabled` gates it and `taxRate` holds the rate as a FRACTION (0.1500 =
 * 15%) — the same unit used on the wire (`items[].taxRate`) and in the POS
 * session, so nothing has to convert between percent and fraction outside the
 * Seller HQ input.
 *
 * Both columns are NOT NULL with defaults, so there is no backfill: every
 * existing branch lands on taxEnabled=false with 15% pre-filled and keeps
 * trading exactly as before until its owner ticks the box in Seller HQ.
 */
export class AddBranchTaxSettings20260806000000 implements MigrationInterface {
  name = 'AddBranchTaxSettings20260806000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "branches" ADD COLUMN IF NOT EXISTS "taxEnabled" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE "branches" ADD COLUMN IF NOT EXISTS "taxRate" numeric(5,4) NOT NULL DEFAULT 0.15`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "branches" DROP COLUMN IF EXISTS "taxRate"`,
    );
    await queryRunner.query(
      `ALTER TABLE "branches" DROP COLUMN IF EXISTS "taxEnabled"`,
    );
  }
}
