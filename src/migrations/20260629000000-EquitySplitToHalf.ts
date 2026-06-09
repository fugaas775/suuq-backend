import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Moves the equity-partner revenue split from 1/3 (633 ETB/month) to
 * 1/2 (950 ETB/month) of the 1,900 ETB branch subscription.
 *
 * Scope (per product decision "all active partners going forward"):
 *  1. Change column defaults so NEW rows use the 1/2 model.
 *  2. Migrate existing ACTIVE split assignments from 1/3 → 1/2.
 *  3. Leave historical `equity_payouts` rows untouched — already-paid and
 *     already-recorded payouts keep their original 633 amounts for audit.
 *     Future payouts are computed from EQUITY_PRICING (now 1/2) at runtime.
 *
 * Safe to re-run.
 */
export class EquitySplitToHalf20260629000000 implements MigrationInterface {
  name = 'EquitySplitToHalf20260629000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1a. New split assignments default to 1/2.
    await queryRunner.query(
      `ALTER TABLE "equity_split_assignments" ALTER COLUMN "splitDenominator" SET DEFAULT 2`,
    );

    // 1b. New payout rows record the 1/2 share by default.
    await queryRunner.query(
      `ALTER TABLE "equity_payouts" ALTER COLUMN "splitAmount" SET DEFAULT 950`,
    );

    // 2. Migrate existing ACTIVE assignments that are still on the 1/3 split.
    //    Only touch perpetual or not-yet-expired assignments; leave terminated
    //    ones as a historical record.
    await queryRunner.query(
      `UPDATE "equity_split_assignments"
         SET "splitDenominator" = 2
       WHERE "splitNumerator" = 1
         AND "splitDenominator" = 3
         AND ("activeUntil" IS NULL OR "activeUntil" > now())`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "equity_split_assignments" ALTER COLUMN "splitDenominator" SET DEFAULT 3`,
    );
    await queryRunner.query(
      `ALTER TABLE "equity_payouts" ALTER COLUMN "splitAmount" SET DEFAULT 633`,
    );
    // Revert the active assignments that were migrated above.
    await queryRunner.query(
      `UPDATE "equity_split_assignments"
         SET "splitDenominator" = 3
       WHERE "splitNumerator" = 1
         AND "splitDenominator" = 2
         AND ("activeUntil" IS NULL OR "activeUntil" > now())`,
    );
  }
}
