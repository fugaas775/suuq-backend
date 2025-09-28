import { MigrationInterface, QueryRunner } from 'typeorm';

// Removes legacy telegram_url column from user table. Previous telegram migrations kept for history.
export class RemoveTelegramColumn1757089200000 implements MigrationInterface {
  name = 'RemoveTelegramColumn1757089200000';
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Drop column if it still exists
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN IF EXISTS "telegram_url"`);
  }
  public async down(queryRunner: QueryRunner): Promise<void> {
    // Recreate column for rollback (data cannot be recovered)
    await queryRunner.query(`ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "telegram_url" character varying(255)`);
  }
}
