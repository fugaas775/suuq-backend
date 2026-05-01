import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBranchPhoneAndTin20260426130000 implements MigrationInterface {
  name = 'AddBranchPhoneAndTin20260426130000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "branches" ADD COLUMN IF NOT EXISTS "phone" character varying(32)`,
    );
    await queryRunner.query(
      `ALTER TABLE "branches" ADD COLUMN IF NOT EXISTS "tinNumber" character varying(64)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "branches" DROP COLUMN IF EXISTS "tinNumber"`,
    );
    await queryRunner.query(
      `ALTER TABLE "branches" DROP COLUMN IF EXISTS "phone"`,
    );
  }
}
