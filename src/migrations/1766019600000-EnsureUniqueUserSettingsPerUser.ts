import { MigrationInterface, QueryRunner } from 'typeorm';

export class EnsureUniqueUserSettingsPerUser1766019600000 implements MigrationInterface {
  name = 'EnsureUniqueUserSettingsPerUser1766019600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Remove duplicate settings per user, keeping the lowest id (earliest)
    await queryRunner.query(`
      WITH ranked AS (
        SELECT id, "userId",
               ROW_NUMBER() OVER (PARTITION BY "userId" ORDER BY id) AS rn
        FROM user_settings
      )
      DELETE FROM user_settings us
      USING ranked r
      WHERE us.id = r.id AND r.rn > 1;
    `);

    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "idx_user_settings_user_id_unique" ON "user_settings" ("userId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_user_settings_user_id_unique"`,
    );
  }
}
