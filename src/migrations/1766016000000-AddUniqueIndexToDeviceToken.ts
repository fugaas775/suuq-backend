import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUniqueIndexToDeviceToken1766016000000 implements MigrationInterface {
  name = 'AddUniqueIndexToDeviceToken1766016000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Remove duplicate device tokens, keeping the earliest entry per token
    await queryRunner.query(`
      WITH ranked AS (
        SELECT id,
               ROW_NUMBER() OVER (PARTITION BY token ORDER BY id) AS rn
        FROM device_tokens
      )
      DELETE FROM device_tokens dt
      USING ranked r
      WHERE dt.id = r.id
        AND r.rn > 1;
    `);

    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "idx_device_tokens_token_unique" ON "device_tokens" ("token")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_device_tokens_token_unique"`,
    );
  }
}
