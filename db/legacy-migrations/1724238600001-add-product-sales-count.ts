import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProductSalesCount1724238600001 implements MigrationInterface {
  name = 'AddProductSalesCount1724238600001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "product" ADD COLUMN IF NOT EXISTS "sales_count" integer NOT NULL DEFAULT 0`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "product" DROP COLUMN IF EXISTS "sales_count"`,
    );
  }
}
