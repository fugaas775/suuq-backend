import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAuditLog1724300000000 implements MigrationInterface {
  name = 'AddAuditLog1724300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS "audit_log" (
          "id" SERIAL PRIMARY KEY,
          "actorId" integer NULL,
          "actorEmail" varchar(255) NULL,
          "action" varchar(128) NOT NULL,
          "targetType" varchar(64) NOT NULL,
          "targetId" integer NOT NULL,
          "reason" text NULL,
          "meta" jsonb NULL,
          "createdAt" TIMESTAMP NOT NULL DEFAULT now()
        )`);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_audit_log_target" ON "audit_log" ("targetType", "targetId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_audit_log_action" ON "audit_log" ("action")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "audit_log"`);
  }
}
