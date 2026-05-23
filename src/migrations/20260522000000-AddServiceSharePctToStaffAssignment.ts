import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddServiceSharePctToStaffAssignment20260522000000
  implements MigrationInterface
{
  name = 'AddServiceSharePctToStaffAssignment20260522000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "branch_staff_assignments" ADD COLUMN IF NOT EXISTS "serviceSharePct" smallint DEFAULT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "branch_staff_assignments" DROP COLUMN IF EXISTS "serviceSharePct"`,
    );
  }
}
