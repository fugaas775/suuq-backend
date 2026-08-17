import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * A per-branch address for the emails the platform writes TO a branch.
 *
 * Until now the only address available was the OWNER's account email, which
 * cannot tell two branches apart. One person owning a school in Godey and a
 * school in Qalaafe received both schools' enrolment applications in a single
 * inbox, and neither school's office received any — the desk that actually
 * answers a family had no way to be told.
 *
 * Nullable, and null keeps exactly today's behaviour: fall back to the owner.
 * Nothing is backfilled, because guessing a school's office address from the
 * owner's would silently make one person's inbox look like the school's.
 *
 * ⚠ Not a public contact address — see the note on `Branch.notificationEmail`.
 */
export class AddBranchNotificationEmail20260817030000
  implements MigrationInterface
{
  name = 'AddBranchNotificationEmail20260817030000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "branches" ADD COLUMN IF NOT EXISTS "notificationEmail" character varying(255)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "branches" DROP COLUMN IF EXISTS "notificationEmail"`,
    );
  }
}
