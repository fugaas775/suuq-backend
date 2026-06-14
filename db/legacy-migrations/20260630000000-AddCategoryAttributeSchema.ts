import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCategoryAttributeSchema20260630000000
  implements MigrationInterface
{
  name = 'AddCategoryAttributeSchema20260630000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "category" ADD COLUMN IF NOT EXISTS "attribute_schema" jsonb`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "category" DROP COLUMN IF EXISTS "attribute_schema"`,
    );
  }
}
