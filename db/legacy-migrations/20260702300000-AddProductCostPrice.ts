import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProductCostPrice20260702300000 implements MigrationInterface {
  name = 'AddProductCostPrice20260702300000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "product" ADD COLUMN IF NOT EXISTS "cost_price" numeric(12,2)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "product" DROP COLUMN IF EXISTS "cost_price"`,
    );
  }
}
