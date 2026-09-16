import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The home room teacher — who answers for a class's daily register.
 *
 * Both live schools are subject-taught from Grade 1: every class is held by
 * six to nine different teachers across twenty-eight periods a week, and the
 * FIRST period of a class is taken by three to five different people over the
 * five days. So there is no rule that derives the register-taker from the
 * timetable — "whoever teaches P1" is a different person every weekday — and
 * the consequence was that nobody owned a class's register at all, while every
 * teacher who could open Attendance could mark all eleven classes.
 *
 * Hence a named teacher, on the class, where the office sets it once.
 *
 * `homeroomTeacherName` is denormalised beside the id, exactly as the
 * timetable's `teacherName` and attendance's `subjectName` are: a class must
 * still say who its home room teacher was after that person has left the
 * branch, and a board that joined back to the live staff list would blank the
 * classes whose teacher had gone.
 *
 * No backfill — there is nothing to infer, which is the whole point above.
 */
export class AddSchoolClassHomeroom20260916190000
  implements MigrationInterface
{
  name = 'AddSchoolClassHomeroom20260916190000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "pos_school_classes"
        ADD COLUMN IF NOT EXISTS "homeroomEmployeeId" integer,
        ADD COLUMN IF NOT EXISTS "homeroomTeacherName" character varying(255)
    `);
    // "Which classes am I the home room teacher of" is the read a teacher's
    // till makes on every visit to Attendance, answered from the signed-in
    // user's staff row. Not a partial index, even though the column is null
    // on every class until an office names somebody: the entity declares this
    // index too, and a WHERE clause here that the entity does not carry reads
    // as schema drift to anything comparing the two. A registry is twenty-odd
    // rows a branch — the nulls cost nothing.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_pos_school_classes_branch_homeroom"
        ON "pos_school_classes" ("branchId", "homeroomEmployeeId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_pos_school_classes_branch_homeroom"`,
    );
    await queryRunner.query(`
      ALTER TABLE "pos_school_classes"
        DROP COLUMN IF EXISTS "homeroomTeacherName",
        DROP COLUMN IF EXISTS "homeroomEmployeeId"
    `);
  }
}
