import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Lets a month be paid in waves — some staff now, the rest when the money is in.
 *
 * `(branchId, periodKey)` was unique on `pos_payroll_runs`, so one run claimed
 * the whole month: pay 5 of 22 and the other 17 could never be paid through a
 * run at all. Real branches pay in waves — the teachers on the 1st, the guards
 * when the fees clear — so the run-level claim goes, and the guarantee that
 * actually matters moves DOWN a level: no PERSON may be paid twice for the same
 * month.
 *
 * `pos_payroll_run_members` is that guarantee — one row per (person, month),
 * unique, written with the run and cascaded away with it. As before, the index
 * decides a double press, not a prior read: two concurrent runs that both think
 * someone is unpaid will race to the insert, and exactly one wins.
 *
 * The backfill gives every person an existing run paid their claim on that
 * month, so a school that has already run September cannot run it again for the
 * same people the moment the run-level lock disappears.
 */
export class AllowPartialPayrollRuns20260906090000
  implements MigrationInterface
{
  name = 'AllowPartialPayrollRuns20260906090000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "pos_payroll_run_members" (
        "id" BIGSERIAL PRIMARY KEY,
        "runId" bigint NOT NULL
          REFERENCES "pos_payroll_runs"("id") ON DELETE CASCADE,
        "branchId" integer NOT NULL,
        "periodKey" character varying(32) NOT NULL,
        "employeeId" bigint NOT NULL
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_pos_payroll_member_period"
        ON "pos_payroll_run_members" ("branchId", "periodKey", "employeeId")
    `);

    // Everyone an existing run paid claims their month, BEFORE the run-level
    // lock is dropped — no window in which a paid month reads as open.
    await queryRunner.query(`
      INSERT INTO "pos_payroll_run_members" ("runId", "branchId", "periodKey", "employeeId")
      SELECT r."id", r."branchId", r."periodKey", (l->>'employeeId')::bigint
      FROM "pos_payroll_runs" r
      CROSS JOIN LATERAL jsonb_array_elements(r."lines") AS l
      WHERE l->>'employeeId' IS NOT NULL
      ON CONFLICT DO NOTHING
    `);

    await queryRunner.query(
      `DROP INDEX IF EXISTS "uq_pos_payroll_runs_branch_period"`,
    );
    // Still the lookup the runs list makes; just no longer unique.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "ix_pos_payroll_runs_branch_period"
        ON "pos_payroll_runs" ("branchId", "periodKey")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "ix_pos_payroll_runs_branch_period"`,
    );
    // Fails if a period already holds several runs — which is data this
    // rollback would otherwise silently make illegal, so failing is right.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_pos_payroll_runs_branch_period"
        ON "pos_payroll_runs" ("branchId", "periodKey")
    `);
    await queryRunner.query(`DROP TABLE IF EXISTS "pos_payroll_run_members"`);
  }
}
