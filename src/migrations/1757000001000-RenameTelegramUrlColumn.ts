import { MigrationInterface, QueryRunner } from 'typeorm';

export class RenameTelegramUrlColumn1757000001000
  implements MigrationInterface
{
  name = 'RenameTelegramUrlColumn1757000001000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // If old camelCase column exists and new snake_case does not, rename
    const hasOld = await queryRunner.query(
      `SELECT 1 FROM information_schema.columns WHERE table_name='user' AND column_name='telegramUrl'`,
    );
    const hasNew = await queryRunner.query(
      `SELECT 1 FROM information_schema.columns WHERE table_name='user' AND column_name='telegram_url'`,
    );
    const oldExists = Array.isArray(hasOld) && hasOld.length > 0;
    const newExists = Array.isArray(hasNew) && hasNew.length > 0;
    if (oldExists && !newExists) {
      await queryRunner.query(
        `ALTER TABLE "user" RENAME COLUMN "telegramUrl" TO "telegram_url"`,
      );
    }
    if (!oldExists && !newExists) {
      await queryRunner.query(
        `ALTER TABLE "user" ADD COLUMN "telegram_url" character varying(255)`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Best effort: if camelCase not present but snake_case is, rename back (unlikely needed)
    const hasOld = await queryRunner.query(
      `SELECT 1 FROM information_schema.columns WHERE table_name='user' AND column_name='telegramUrl'`,
    );
    const hasNew = await queryRunner.query(
      `SELECT 1 FROM information_schema.columns WHERE table_name='user' AND column_name='telegram_url'`,
    );
    const oldExists = Array.isArray(hasOld) && hasOld.length > 0;
    const newExists = Array.isArray(hasNew) && hasNew.length > 0;
    if (!oldExists && newExists) {
      await queryRunner.query(
        `ALTER TABLE "user" RENAME COLUMN "telegram_url" TO "telegramUrl"`,
      );
    }
  }
}
