import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Pupils' own logins for the SCHOOL format: one row per (school, pupil
 * record), naming the `user` row that signs in. The login itself is an
 * ordinary `user` (posUsername + password, authMode MANUAL) — nothing on
 * `user` changes. Additive; no backfill — the office creates each login.
 */
export class AddSchoolStudentAccounts20261016120000
  implements MigrationInterface
{
  name = 'AddSchoolStudentAccounts20261016120000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "pos_school_student_accounts" (
        "id" BIGSERIAL PRIMARY KEY,
        "branchId" integer NOT NULL,
        "userId" integer NOT NULL,
        "folioId" integer NOT NULL,
        "displayName" character varying(160),
        "isActive" boolean NOT NULL DEFAULT true,
        "createdByUserId" integer,
        "createdByName" character varying(160),
        "passwordIssuedAt" TIMESTAMP WITH TIME ZONE,
        "passwordChangedAt" TIMESTAMP WITH TIME ZONE,
        "lastLoginAt" TIMESTAMP WITH TIME ZONE,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "uq_pos_school_student_accounts_branch_folio" UNIQUE ("branchId", "folioId"),
        CONSTRAINT "uq_pos_school_student_accounts_branch_user" UNIQUE ("branchId", "userId")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_pos_school_student_accounts_user"
        ON "pos_school_student_accounts" ("userId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TABLE IF EXISTS "pos_school_student_accounts"`,
    );
  }
}
