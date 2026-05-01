import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds optional referrer + cascade payout columns to equity_partner so
 * that the referral system can pay a smaller share to the partner who
 * recruited a downstream partner.
 */
export class AddEquityPartnerReferrerAndCascade20260503000000
  implements MigrationInterface
{
  name = 'AddEquityPartnerReferrerAndCascade20260503000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "equity_partners" ADD COLUMN IF NOT EXISTS "referrerEquityPartnerId" integer NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "equity_partners" ADD COLUMN IF NOT EXISTS "tierNumerator" integer NOT NULL DEFAULT 1`,
    );
    await queryRunner.query(
      `ALTER TABLE "equity_partners" ADD COLUMN IF NOT EXISTS "tierDenominator" integer NOT NULL DEFAULT 10`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_equity_partners_referrer" ON "equity_partners" ("referrerEquityPartnerId") WHERE "referrerEquityPartnerId" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_equity_partners_referrer"`,
    );
    await queryRunner.query(
      `ALTER TABLE "equity_partners" DROP COLUMN IF EXISTS "tierDenominator"`,
    );
    await queryRunner.query(
      `ALTER TABLE "equity_partners" DROP COLUMN IF EXISTS "tierNumerator"`,
    );
    await queryRunner.query(
      `ALTER TABLE "equity_partners" DROP COLUMN IF EXISTS "referrerEquityPartnerId"`,
    );
  }
}
