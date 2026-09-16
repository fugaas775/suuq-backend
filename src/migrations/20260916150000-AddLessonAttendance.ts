import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Teachers' attendance, period by period.
 *
 * The day register says whether a teacher came in. A school with a timetable
 * can ask the finer question — did they teach Monday P1 in 3aad — and the
 * answer is a different document with a different key: (person, day, period,
 * class), because one teacher holds the same period code in two shifts at
 * two different hours. A second table rather than a grain column on the day
 * register, so nothing that reads the day register has to learn to filter,
 * and this deploy adds a table without touching a live index.
 *
 * No backfill. A lesson is in the register because somebody marked it.
 */
export class AddLessonAttendance20260916150000 implements MigrationInterface {
  name = 'AddLessonAttendance20260916150000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "pos_branch_lesson_attendance" (
        "id" BIGSERIAL PRIMARY KEY,
        "branchId" integer NOT NULL,
        "attendanceDate" date NOT NULL,
        "subjectType" character varying(16) NOT NULL,
        "subjectRef" character varying(64) NOT NULL,
        "subjectName" character varying(255),
        "periodCode" character varying(16) NOT NULL,
        "classCode" character varying(64) NOT NULL,
        "subject" character varying(120),
        "status" character varying(16) NOT NULL,
        "minutesLate" integer,
        "note" character varying(200),
        "recordedByUserId" integer,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
      )
    `);
    // One mark per person per lesson. The service upserts onto it, so a
    // corrected mark is an UPDATE and a day can never hold two answers for
    // the same lesson.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_pos_branch_lesson_attendance_lesson"
        ON "pos_branch_lesson_attendance"
        ("branchId", "subjectType", "subjectRef", "attendanceDate", "periodCode", "classCode")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_pos_branch_lesson_attendance_branch_type_date"
        ON "pos_branch_lesson_attendance" ("branchId", "subjectType", "attendanceDate")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TABLE IF EXISTS "pos_branch_lesson_attendance"`,
    );
  }
}
