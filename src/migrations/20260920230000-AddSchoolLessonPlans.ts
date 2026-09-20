import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Lesson plans: what a teacher means to teach in each slot of their
 * timetable, its status afterwards, and the heads' sign-off. One row per
 * (teacher, day, period, class) — the lesson attendance's own key. No
 * backfill; a plan exists because a teacher wrote it.
 */
export class AddSchoolLessonPlans20260920230000 implements MigrationInterface {
  name = 'AddSchoolLessonPlans20260920230000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "pos_school_lesson_plans" (
        "id" BIGSERIAL PRIMARY KEY,
        "branchId" integer NOT NULL,
        "employeeId" integer NOT NULL,
        "teacherName" character varying(160),
        "lessonDate" date NOT NULL,
        "periodCode" character varying(16) NOT NULL,
        "classCode" character varying(64) NOT NULL,
        "subject" character varying(120) NOT NULL,
        "topic" character varying(200) NOT NULL,
        "objectives" text,
        "activities" text,
        "materials" text,
        "assessment" text,
        "status" character varying(16) NOT NULL DEFAULT 'PLANNED',
        "taughtOn" date,
        "statusNote" character varying(200),
        "reviewedByUserId" integer,
        "reviewedByName" character varying(160),
        "reviewedAt" TIMESTAMP WITH TIME ZONE,
        "reviewComment" character varying(400),
        "createdByUserId" integer,
        "updatedByUserId" integer,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_pos_school_lesson_plans_lesson"
        ON "pos_school_lesson_plans" ("branchId", "employeeId", "lessonDate", "periodCode", "classCode")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_pos_school_lesson_plans_branch_date"
        ON "pos_school_lesson_plans" ("branchId", "lessonDate")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_pos_school_lesson_plans_branch_employee"
        ON "pos_school_lesson_plans" ("branchId", "employeeId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "pos_school_lesson_plans"`);
  }
}
