import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPosUsernameAuthModeToUser20260428100000
  implements MigrationInterface
{
  name = 'AddPosUsernameAuthModeToUser20260428100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "posUsername" varchar(64) NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_user_posUsername" ON "user" ("posUsername") WHERE "posUsername" IS NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "authMode" varchar(16) NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_user_posUsername"`);
    await queryRunner.query(
      `ALTER TABLE "user" DROP COLUMN IF EXISTS "posUsername"`,
    );
    await queryRunner.query(
      `ALTER TABLE "user" DROP COLUMN IF EXISTS "authMode"`,
    );
  }
}
