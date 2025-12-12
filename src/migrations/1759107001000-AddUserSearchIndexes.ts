import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserSearchIndexes1759107001000 implements MigrationInterface {
  name = 'AddUserSearchIndexes1759107001000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Ensure pg_trgm is available for efficient ILIKE searches
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);
    // Create trigram indexes on lowercased fields used for search
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_user_email_trgm ON "user" USING gin (lower(email) gin_trgm_ops)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_user_displayname_trgm ON "user" USING gin (lower("displayName") gin_trgm_ops)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_user_displayname_trgm`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_user_email_trgm`);
    // Do not drop extension on down; it may be shared
  }
}
