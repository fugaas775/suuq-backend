import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * A person's claim on a month becomes an AMOUNT, not a flag — so a salary can
 * be paid in parts: an advance on the 10th, the remainder at month end.
 *
 * The one-row-per-(person, month) unique index enforced "paid once"; the
 * invariant that actually matters is "paid up to the salary". A member row now
 * records how much its run paid, several rows per (person, month) may exist
 * (one per wave), and the cap is enforced in the service inside a
 * branch-scoped advisory-locked transaction — the lock serialises payroll
 * writers per branch, which is what the unique index used to do for the
 * double-press case.
 *
 * Backfill: every existing member row gets its amount from the run's frozen
 * line, so months already paid read as fully claimed the moment the unique
 * index drops.
 */
export class PayrollPartialAmounts20260906150000 implements MigrationInterface {
  name = 'PayrollPartialAmounts20260906150000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "pos_payroll_run_members"
        ADD COLUMN IF NOT EXISTS "amount" numeric(14,2) NOT NULL DEFAULT 0
    `);
    await queryRunner.query(`
      UPDATE "pos_payroll_run_members" m
      SET "amount" = l."amount"
      FROM (
        SELECT r."id" AS "runId",
               (line->>'employeeId')::bigint AS "employeeId",
               (line->>'amount')::numeric AS "amount"
        FROM "pos_payroll_runs" r
        CROSS JOIN LATERAL jsonb_array_elements(r."lines") AS line
        WHERE line->>'employeeId' IS NOT NULL
      ) l
      WHERE m."runId" = l."runId"
        AND m."employeeId" = l."employeeId"
        AND m."amount" = 0
    `);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "uq_pos_payroll_member_period"`,
    );
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "ix_pos_payroll_member_period"
        ON "pos_payroll_run_members" ("branchId", "periodKey", "employeeId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "ix_pos_payroll_member_period"`,
    );
    // Fails where a person was genuinely paid in parts — data this rollback
    // would otherwise make illegal, so failing is right.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_pos_payroll_member_period"
        ON "pos_payroll_run_members" ("branchId", "periodKey", "employeeId")
    `);
    await queryRunner.query(`
      ALTER TABLE "pos_payroll_run_members" DROP COLUMN IF EXISTS "amount"
    `);
  }
}
