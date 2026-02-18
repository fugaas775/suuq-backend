import { MigrationInterface, QueryRunner } from 'typeorm';

export class ReduceCommissionToThreePercent1770800000000
  implements MigrationInterface
{
  name = 'ReduceCommissionToThreePercent1770800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Update the default value for the column
    await queryRunner.query(
      `ALTER TABLE "user" ALTER COLUMN "commissionRate" SET DEFAULT 0.03`,
    );

    // 2. Update existing rows that have the old default (0.05) to the new default (0.03)
    // This updates all vendors currently set to the standard 5% rate.
    await queryRunner.query(
      `UPDATE "user" SET "commissionRate" = 0.03 WHERE "commissionRate" = 0.05`,
    );

    // 3. Update the UI setting key used by OrdersService (stores integer 3 for 3%)
    // If a row exists with key 'vendor_commission_percentage', update it.
    await queryRunner.query(
      `UPDATE "ui_setting" SET "value" = '3' WHERE "key" = 'vendor_commission_percentage'`,
    );

    // 4. Also update the 'commission_rate' key which appears in seed scripts
    await queryRunner.query(
      `UPDATE "ui_setting" SET "value" = '3' WHERE "key" = 'commission_rate'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user" ALTER COLUMN "commissionRate" SET DEFAULT 0.05`,
    );
    // We cannot safely revert the data update without tracking previous state,
    // but typically down migrations revert to the old default.
    await queryRunner.query(
      `UPDATE "user" SET "commissionRate" = 0.05 WHERE "commissionRate" = 0.03`,
    );
    await queryRunner.query(
      `UPDATE "ui_setting" SET "value" = '5' WHERE "key" = 'vendor_commission_percentage'`,
    );
  }
}
