import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPosExperienceProfileCodeToStaffAssignment20260603000000
  implements MigrationInterface
{
  name = 'AddPosExperienceProfileCodeToStaffAssignment20260603000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "branch_staff_assignments" ADD COLUMN IF NOT EXISTS "posExperienceProfileCode" character varying DEFAULT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "branch_staff_assignments" DROP COLUMN IF EXISTS "posExperienceProfileCode"`,
    );
  }
}
