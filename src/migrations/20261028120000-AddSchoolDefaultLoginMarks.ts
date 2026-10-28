import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Every SCHOOL pupil gets a parent's and a student's login by default (owner
 * 2026-10-28: "Create Parent logins and Students logins like SMAQ School by
 * default"). The marks record which records have had theirs, so the sweep
 * never re-creates a login the office removed.
 *
 * Seeded with every record that holds a login today: those are "given".
 */
export class AddSchoolDefaultLoginMarks20261028120000
  implements MigrationInterface
{
  name = 'AddSchoolDefaultLoginMarks20261028120000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "pos_school_default_login_marks" (
        "id" BIGSERIAL PRIMARY KEY,
        "branchId" integer NOT NULL,
        "folioId" integer NOT NULL,
        "kind" varchar(16) NOT NULL,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "uq_pos_school_default_login_marks" UNIQUE ("branchId", "folioId", "kind")
      )`,
    );
    await queryRunner.query(
      `INSERT INTO "pos_school_default_login_marks" ("branchId", "folioId", "kind")
       SELECT "branchId", "folioId", 'STUDENT' FROM "pos_school_student_accounts"
       ON CONFLICT DO NOTHING`,
    );
    await queryRunner.query(
      `INSERT INTO "pos_school_default_login_marks" ("branchId", "folioId", "kind")
       SELECT DISTINCT g."branchId", p."folioId", 'PARENT'
         FROM "pos_school_guardian_pupils" p
         JOIN "pos_school_guardians" g ON g.id = p."guardianId"
       ON CONFLICT DO NOTHING`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TABLE IF EXISTS "pos_school_default_login_marks"`,
    );
  }
}
