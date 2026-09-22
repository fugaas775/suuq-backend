import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Who marked a teacher's lesson, by name.
 *
 * The day register learned the recorder's name on 2026-09-20
 * (AddAttendanceRecordedByName); the lesson register carried only a user id,
 * which is not something a head teacher reads off the lesson grid. The name
 * is denormalised like `subjectName`: the row must still say who marked it
 * after that person leaves. Nullable — lessons marked before today carry none.
 */
export class AddLessonAttendanceRecordedBy20260922000000
  implements MigrationInterface
{
  name = 'AddLessonAttendanceRecordedBy20260922000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "pos_branch_lesson_attendance"
        ADD COLUMN IF NOT EXISTS "recordedByName" character varying(120)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "pos_branch_lesson_attendance"
        DROP COLUMN IF EXISTS "recordedByName"
    `);
  }
}
