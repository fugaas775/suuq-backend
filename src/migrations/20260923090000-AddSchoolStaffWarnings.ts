import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Formal staff warnings — verbal, written, final written — the steps a
 * school records before anyone is dismissed. One row per warning, never
 * deleted (withdrawn stays on file as withdrawn). No backfill.
 */
export class AddSchoolStaffWarnings20260923090000 implements MigrationInterface {
  name = 'AddSchoolStaffWarnings20260923090000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "pos_school_staff_warnings" (
        "id" BIGSERIAL PRIMARY KEY,
        "branchId" integer NOT NULL,
        "employeeId" integer NOT NULL,
        "employeeName" character varying(160),
        "level" character varying(16) NOT NULL,
        "category" character varying(24) NOT NULL,
        "reason" text NOT NULL,
        "expectation" character varying(1000),
        "issuedOn" date NOT NULL,
        "expiresOn" date,
        "issuedByUserId" integer,
        "issuedByName" character varying(160),
        "acknowledgedAt" TIMESTAMP WITH TIME ZONE,
        "acknowledgedByUserId" integer,
        "status" character varying(16) NOT NULL DEFAULT 'ACTIVE',
        "withdrawnAt" TIMESTAMP WITH TIME ZONE,
        "withdrawnByUserId" integer,
        "withdrawnByName" character varying(160),
        "withdrawNote" character varying(400),
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_pos_school_staff_warnings_branch_employee"
        ON "pos_school_staff_warnings" ("branchId", "employeeId")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_pos_school_staff_warnings_branch_issued"
        ON "pos_school_staff_warnings" ("branchId", "issuedOn")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "pos_school_staff_warnings"`);
  }
}
