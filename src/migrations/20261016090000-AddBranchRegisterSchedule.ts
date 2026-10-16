import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * A branch's register schedule, both "HH:MM" 24h EAT, both optional.
 *
 * - registerClosesAt: every register session still open at this time is
 *   closed by the server (PosRegisterScheduleService).
 * - registerOpensAt: an operator cannot start a session between the closing
 *   time (or midnight) and this time; a manager or the owner still can.
 */
export class AddBranchRegisterSchedule20261016090000
  implements MigrationInterface
{
  name = 'AddBranchRegisterSchedule20261016090000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "branches" ADD COLUMN IF NOT EXISTS "registerOpensAt" character varying(5)`,
    );
    await queryRunner.query(
      `ALTER TABLE "branches" ADD COLUMN IF NOT EXISTS "registerClosesAt" character varying(5)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "branches" DROP COLUMN IF EXISTS "registerClosesAt"`,
    );
    await queryRunner.query(
      `ALTER TABLE "branches" DROP COLUMN IF EXISTS "registerOpensAt"`,
    );
  }
}
