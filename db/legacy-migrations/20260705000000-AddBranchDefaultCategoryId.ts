import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBranchDefaultCategoryId20260705000000
  implements MigrationInterface
{
  name = 'AddBranchDefaultCategoryId20260705000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "branches" ADD COLUMN IF NOT EXISTS "defaultCategoryId" integer`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "branches" DROP COLUMN IF EXISTS "defaultCategoryId"`,
    );
  }
}
