import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * A payroll run says WHAT it pays: the month's SALARY (every run so far), or
 * TUTORIAL pay — the per-period rate an exam grade's evening tutorial earns on
 * top of salary (SMAQ, ETB 300 a period).
 *
 * The two must not share a cap. A salary run claims against the monthly salary
 * through `pos_payroll_run_members`; a tutorial run claims LESSONS (its frozen
 * lines name each one), writes no member row, and so can never make a month's
 * salary read as paid — nor be refused because it already was.
 *
 * Additive with a default: every existing run is a SALARY run, and code that
 * predates the column never reads it.
 */
export class AddPayrollRunKind20261019120000 implements MigrationInterface {
  name = 'AddPayrollRunKind20261019120000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "pos_payroll_runs"
        ADD COLUMN IF NOT EXISTS "kind" varchar(16) NOT NULL DEFAULT 'SALARY'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "pos_payroll_runs" DROP COLUMN IF EXISTS "kind"
    `);
  }
}
