import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds indexes to accelerate admin user filtering queries.
 * - Composite on (isActive, verificationStatus)
 * - GIN on roles array
 * NOTE: Uses table name "user" (entity User maps to that) and column casing matching entity.
 */
export class AddUserFilterIndexes1731848400000 implements MigrationInterface {
  name = 'AddUserFilterIndexes1731848400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Composite B-Tree index for activity + verification status filters
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS idx_user_active_verification ON "user" ("isActive", "verificationStatus")',
    );
    // GIN index for roles array containment queries (roles @> ARRAY['VENDOR'])
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS idx_user_roles_gin ON "user" USING GIN (roles)',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS idx_user_roles_gin');
    await queryRunner.query(
      'DROP INDEX IF EXISTS idx_user_active_verification',
    );
  }
}
