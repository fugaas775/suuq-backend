import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The teacher who took the register should be known.
 *
 * Every mark already carried `recordedByUserId`; nothing carried a name, and
 * a user id is not something a head teacher reads off a board. The name is
 * denormalised like `subjectName`: the row must still say who took it after
 * that person leaves. Nullable — rows written before today carry none.
 */
export class AddAttendanceRecordedByName20260920210000
  implements MigrationInterface
{
  name = 'AddAttendanceRecordedByName20260920210000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "pos_branch_attendance"
        ADD COLUMN IF NOT EXISTS "recordedByName" character varying(160)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "pos_branch_attendance"
        DROP COLUMN IF EXISTS "recordedByName"
    `);
  }
}
