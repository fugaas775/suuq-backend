import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTelegramToUser1757000000000 implements MigrationInterface {
  name = 'AddTelegramToUser1757000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add nullable telegramUrl column to user table if not exists
    await queryRunner.query(
      `ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "telegramUrl" character varying(255)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user" DROP COLUMN IF EXISTS "telegramUrl"`,
    );
  }
}
