import { MigrationInterface, QueryRunner } from 'typeorm';

export class EnsureTelegramColumns1757000002000 implements MigrationInterface {
  name = 'EnsureTelegramColumns1757000002000';
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Detect existing columns
    const cols = await queryRunner.query(`SELECT column_name FROM information_schema.columns WHERE table_name='user'`);
    const names = new Set(cols.map((r: any) => r.column_name));

    if (!names.has('telegramUrl') && !names.has('telegram_url')) {
      await queryRunner.query(`ALTER TABLE "user" ADD COLUMN "telegramUrl" character varying(255)`);
    }
    // If only camelCase exists and you prefer snake_case, optionally duplicate
    if (names.has('telegramUrl') && !names.has('telegram_url')) {
      // Create snake_case as a generated (stored) column if Postgres 12+ not used we just add a nullable copy
      await queryRunner.query(`ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "telegram_url" character varying(255)`);
      await queryRunner.query(`UPDATE "user" SET telegram_url = telegramUrl WHERE telegram_url IS NULL AND telegramUrl IS NOT NULL`);
    }
    if (!names.has('telegramUrl') && names.has('telegram_url')) {
      // Add camelCase alias column for ORM mapping
      await queryRunner.query(`ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "telegramUrl" character varying(255)`);
      await queryRunner.query(`UPDATE "user" SET "telegramUrl" = telegram_url WHERE telegramUrl IS NULL AND telegram_url IS NOT NULL`);
    }
  }
  public async down(queryRunner: QueryRunner): Promise<void> {
    // Non-destructive: leave columns (avoid accidental data loss)
  }
}
