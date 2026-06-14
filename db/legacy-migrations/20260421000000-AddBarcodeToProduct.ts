import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBarcodeToProduct20260421000000 implements MigrationInterface {
  name = 'AddBarcodeToProduct20260421000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "product" ADD COLUMN IF NOT EXISTS "barcode" character varying(64)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "product" DROP COLUMN IF EXISTS "barcode"`,
    );
  }
}
