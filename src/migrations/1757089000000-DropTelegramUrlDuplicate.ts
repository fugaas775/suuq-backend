import { MigrationInterface, QueryRunner } from 'typeorm';

// Consolidate telegram columns: keep snake_case telegram_url only. If camelCase exists with data, merge then drop.
export class DropTelegramUrlDuplicate1757089000000
  implements MigrationInterface
{
  name = 'DropTelegramUrlDuplicate1757089000000';
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Detect both columns existing
    const cols = await queryRunner.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name='user'`,
    );
    const names = new Set(cols.map((r: any) => r.column_name));
    if (names.has('telegram_url') && names.has('telegramUrl')) {
      // Backfill snake_case from camelCase if empty
      await queryRunner.query(
        `UPDATE "user" SET telegram_url = "telegramUrl" WHERE telegram_url IS NULL AND "telegramUrl" IS NOT NULL`,
      );
      // Safely drop camelCase column
      await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "telegramUrl"`);
    }
  }
  public async down(queryRunner: QueryRunner): Promise<void> {
    // Recreate camelCase column if needed (empty) for rollback
    const cols = await queryRunner.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name='user'`,
    );
    const names = new Set(cols.map((r: any) => r.column_name));
    if (names.has('telegram_url') && !names.has('telegramUrl')) {
      await queryRunner.query(
        `ALTER TABLE "user" ADD COLUMN "telegramUrl" character varying(255)`,
      );
      await queryRunner.query(
        `UPDATE "user" SET "telegramUrl" = telegram_url WHERE "telegramUrl" IS NULL AND telegram_url IS NOT NULL`,
      );
    }
  }
}
