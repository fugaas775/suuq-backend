import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBranchServiceFormat1775300000000 implements MigrationInterface {
  name = 'AddBranchServiceFormat1775300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "branches" ADD COLUMN IF NOT EXISTS "serviceFormat" character varying(32)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "branches" DROP COLUMN IF EXISTS "serviceFormat"`,
    );
  }
}
