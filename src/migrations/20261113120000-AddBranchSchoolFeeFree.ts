import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Lets a SCHOOL branch say it is a public school — one that collects no fees.
 *
 * Private and public schools share the one SCHOOL format; this flag is the
 * whole difference. Defaulting to false keeps every existing school collecting
 * fees exactly as it does today.
 */
export class AddBranchSchoolFeeFree20261113120000
  implements MigrationInterface
{
  name = 'AddBranchSchoolFeeFree20261113120000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "branches" ADD COLUMN IF NOT EXISTS "schoolFeeFree" boolean NOT NULL DEFAULT false`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "branches" DROP COLUMN IF EXISTS "schoolFeeFree"`,
    );
  }
}
