import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAuditLogIndexes1759500000000 implements MigrationInterface {
  name = 'AddAuditLogIndexes1759500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_audit_target_created" ON "audit_log" ("targetType", "targetId", "createdAt" DESC, "id" DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_audit_action" ON "audit_log" ("action")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_audit_action"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_audit_target_created"`);
  }
}
