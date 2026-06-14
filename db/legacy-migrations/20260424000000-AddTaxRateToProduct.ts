import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTaxRateToProduct20260424000000 implements MigrationInterface {
  name = 'AddTaxRateToProduct20260424000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "product" ADD COLUMN IF NOT EXISTS "tax_rate" numeric(5,4)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "product" DROP COLUMN IF EXISTS "tax_rate"`,
    );
  }
}
