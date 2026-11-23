import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Messages from the heads to the staff — to one teacher, several, or the
 * whole staff list — with who has read each. One row per message, never
 * deleted (taken down stays on the office's list). No backfill.
 */
export class AddSchoolStaffNotices20261123090000 implements MigrationInterface {
  name = 'AddSchoolStaffNotices20261123090000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "pos_school_staff_notices" (
        "id" BIGSERIAL PRIMARY KEY,
        "branchId" integer NOT NULL,
        "title" character varying(200),
        "body" text NOT NULL,
        "audience" character varying(16) NOT NULL DEFAULT 'ALL',
        "employeeIds" jsonb,
        "readBy" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "isActive" boolean NOT NULL DEFAULT true,
        "createdByUserId" integer,
        "createdByName" character varying(160),
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_pos_school_staff_notices_branch_created"
        ON "pos_school_staff_notices" ("branchId", "createdAt")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "pos_school_staff_notices"`);
  }
}
