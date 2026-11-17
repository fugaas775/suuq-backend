import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Exam timetables — "Mid Exam I" and the like — one document per exam per
 * branch. Additive; nothing to backfill.
 */
export class AddSchoolExamTimetables20261117090000
  implements MigrationInterface
{
  name = 'AddSchoolExamTimetables20261117090000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "pos_school_exam_timetables" (
        "id" BIGSERIAL PRIMARY KEY,
        "branchId" integer NOT NULL,
        "title" character varying(80) NOT NULL,
        "startsOn" character varying(10) NOT NULL,
        "status" character varying(12) NOT NULL DEFAULT 'DRAFT',
        "sittings" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "notes" character varying(600),
        "updatedByUserId" integer,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_pos_school_exam_timetables_branch_title"
        ON "pos_school_exam_timetables" ("branchId", LOWER("title"))
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_pos_school_exam_timetables_branch"
        ON "pos_school_exam_timetables" ("branchId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TABLE IF EXISTS "pos_school_exam_timetables"`,
    );
  }
}
