import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Removes the platform commission from the marketplace ("free marketplace").
 *
 * The EBIRR 1% gateway fee is a real third-party pass-through cost and is NOT
 * affected by this migration — only the platform commission is set to 0.
 *
 * Steps:
 *  1. Change the "user"."commissionRate" column default to 0.
 *  2. Zero out commissionRate for ALL existing vendors (covers any per-vendor
 *     overrides such as the previous 0.03/0.05 rates).
 *  3. Set the UI settings that drive OrdersService to 0.
 *
 * Safe to re-run.
 */
export class RemovePlatformCommission20260626000000
  implements MigrationInterface
{
  name = 'RemovePlatformCommission20260626000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. New column default: no platform commission
    await queryRunner.query(
      `ALTER TABLE "user" ALTER COLUMN "commissionRate" SET DEFAULT 0`,
    );

    // 2. Zero out every existing vendor's commission rate
    await queryRunner.query(
      `UPDATE "user" SET "commissionRate" = 0 WHERE "commissionRate" <> 0`,
    );

    // 3. Drive the global setting(s) read by OrdersService to 0
    await queryRunner.query(
      `UPDATE "ui_setting" SET "value" = '0' WHERE "key" = 'vendor_commission_percentage'`,
    );
    await queryRunner.query(
      `UPDATE "ui_setting" SET "value" = '0' WHERE "key" = 'commission_rate'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Revert to the previous 3% configuration.
    await queryRunner.query(
      `ALTER TABLE "user" ALTER COLUMN "commissionRate" SET DEFAULT 0.03`,
    );
    await queryRunner.query(
      `UPDATE "user" SET "commissionRate" = 0.03 WHERE "commissionRate" = 0`,
    );
    await queryRunner.query(
      `UPDATE "ui_setting" SET "value" = '3' WHERE "key" = 'vendor_commission_percentage'`,
    );
    await queryRunner.query(
      `UPDATE "ui_setting" SET "value" = '3' WHERE "key" = 'commission_rate'`,
    );
  }
}
