import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Gives a branch somewhere to record who turned up.
 *
 * The SCHOOL format could bill a family, chase them and file a child's marks,
 * and could not say whether the child was in the room. Schools already keep the
 * figure — SMAK's own mark sheets carry an "Attendance" component that their
 * teachers compute by hand off paper registers — so the product was asking for
 * a number it gave them no way to produce. The same gap exists on the staff
 * side: `pos_branch_employees` knows what 22 people are owed each month and
 * nothing anywhere knows which of them came in.
 *
 * ONE table for both, with a `subjectType` discriminator. A pupil's register and
 * a teacher's register are the same document — four states, a day key and a
 * month of arithmetic — taken by the same office on the same morning. What
 * differs is who may read them, and that is a controller's job, not a schema's.
 *
 * NOT stored on the pupil's folio, where marks live. An employee has no folio;
 * 242 pupils over a 200-day year is ~48,000 marks against a JSON blob that every
 * fee payment rewrites; and "who is absent in 4aad today" is one indexed read
 * here against a crawl of every folio in the school otherwise.
 *
 * `attendanceDate` is a DATE. A school day is a calendar day in the school's own
 * town — no instant, no zone — and a naive timestamp would read hours early for
 * an Ethiopian branch and file the register on the wrong day.
 *
 * `subjectRef` carries no foreign key and `subjectName` is denormalised beside
 * it, both for the same reason: the row must survive its subject. A pupil
 * withdrawn in week three would otherwise disappear from the three weeks they
 * attended, leaving the register short by exactly the children whose attendance
 * was in question.
 */
export class AddBranchAttendance20260817000000 implements MigrationInterface {
  name = 'AddBranchAttendance20260817000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "pos_branch_attendance" (
        "id" BIGSERIAL PRIMARY KEY,
        "branchId" integer NOT NULL,
        "attendanceDate" date NOT NULL,
        "subjectType" character varying(16) NOT NULL,
        "subjectRef" character varying(64) NOT NULL,
        "subjectName" character varying(255),
        "classCode" character varying(64),
        "status" character varying(16) NOT NULL,
        "minutesLate" integer,
        "note" character varying(200),
        "recordedByUserId" integer,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
      )
    `);

    // One mark per person per day. This index is what makes re-taking a register
    // an UPDATE: a teacher correcting one child at eleven o'clock must not leave
    // two answers for the morning, and the service upserts onto it rather than
    // reading first and hoping.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_pos_branch_attendance_subject_day"
        ON "pos_branch_attendance"
        ("branchId", "subjectType", "subjectRef", "attendanceDate")
    `);

    // The day sheet and the month grid.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_pos_branch_attendance_branch_type_date"
        ON "pos_branch_attendance" ("branchId", "subjectType", "attendanceDate")
    `);

    // The class-day read — "who is absent in 4aad today", the one query the
    // register runs every morning.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_pos_branch_attendance_class_date"
        ON "pos_branch_attendance" ("branchId", "classCode", "attendanceDate")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "pos_branch_attendance"`);
  }
}
