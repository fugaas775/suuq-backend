import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBranchStaffCapabilities20260505000000
  implements MigrationInterface
{
  name = 'AddBranchStaffCapabilities20260505000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "branch_staff_assignments" ADD COLUMN IF NOT EXISTS "capabilities" text NOT NULL DEFAULT ''`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "branch_staff_assignments" DROP COLUMN IF EXISTS "capabilities"`,
    );
  }
}
