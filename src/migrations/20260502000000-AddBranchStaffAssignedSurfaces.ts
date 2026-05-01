import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds an optional list of surface IDs (e.g. 'pos-s', 'reports') to each
 * branch staff assignment so that POS workspace owners can fine-tune the
 * surfaces that managers and operators may access. NULL means "no
 * restriction beyond role default".
 */
export class AddBranchStaffAssignedSurfaces20260502000000
  implements MigrationInterface
{
  name = 'AddBranchStaffAssignedSurfaces20260502000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "branch_staff_assignments" ADD COLUMN IF NOT EXISTS "assignedSurfaces" text NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "branch_staff_assignments" DROP COLUMN IF EXISTS "assignedSurfaces"`,
    );
  }
}
