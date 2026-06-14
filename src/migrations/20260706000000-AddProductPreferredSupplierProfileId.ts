import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProductPreferredSupplierProfileId20260706000000
  implements MigrationInterface
{
  name = 'AddProductPreferredSupplierProfileId20260706000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "product" ADD COLUMN IF NOT EXISTS "preferred_supplier_profile_id" integer`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "product" DROP COLUMN IF EXISTS "preferred_supplier_profile_id"`,
    );
  }
}
