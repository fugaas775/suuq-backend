import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTipAmountToPosCheckouts20260620000000
  implements MigrationInterface
{
  name = 'AddTipAmountToPosCheckouts20260620000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "pos_checkouts"
      ADD COLUMN IF NOT EXISTS "tipAmount" numeric(12,2) NOT NULL DEFAULT 0
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "pos_checkouts" DROP COLUMN IF EXISTS "tipAmount"
    `);
  }
}
