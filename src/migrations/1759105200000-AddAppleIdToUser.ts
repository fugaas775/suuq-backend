import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAppleIdToUser1759105200000 implements MigrationInterface {
  name = 'AddAppleIdToUser1759105200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "appleId" varchar NULL`,
    );
    try {
      await queryRunner.query(
        `CREATE INDEX IF NOT EXISTS "IDX_user_appleId" ON "user" ("appleId")`,
      );
    } catch {}
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    try {
      await queryRunner.query(`DROP INDEX IF EXISTS "IDX_user_appleId"`);
    } catch {}
    await queryRunner.query(
      `ALTER TABLE "user" DROP COLUMN IF EXISTS "appleId"`,
    );
  }
}
