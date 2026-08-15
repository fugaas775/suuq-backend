import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Gives a branch somewhere to record who it employs and what they are paid.
 *
 * Until now the platform had two half-answers and no whole one:
 * `branch_staff_assignments` holds LOGIN accounts — a row there is a username and
 * a set of POS permissions, which is the wrong shape for the cleaner and the
 * guards — and `branch_expenses` takes a PAYROLL category as one undifferentiated
 * lump with no person attached. So "what does this branch spend on staff" could
 * only be answered by typing a number into a note, and "what does this person
 * earn" could not be answered at all.
 *
 * The first real roster to arrive (a 242-pupil school) was spending an estimated
 * 65% of its fee income on wages that the P&L could not see, because nobody had
 * anywhere to put them.
 *
 * A run is a document with its own frozen `lines`, not a live calculation — see
 * PayrollRun — and posts exactly one `branch_expenses` row so it inherits the
 * ledger posting, the P&L classification and reversal-on-delete that rent and
 * utilities already have.
 */
export class AddBranchPayroll20260816000000 implements MigrationInterface {
  name = 'AddBranchPayroll20260816000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "pos_branch_employees" (
        "id" BIGSERIAL PRIMARY KEY,
        "branchId" integer NOT NULL,
        "fullName" character varying(255) NOT NULL,
        "jobTitle" character varying(120),
        "monthlySalary" numeric(12,2),
        "currency" character varying(8) NOT NULL DEFAULT 'ETB',
        "status" character varying(16) NOT NULL DEFAULT 'ACTIVE',
        "userId" integer,
        "startedAt" date,
        "endedAt" date,
        "note" text,
        "metadata" jsonb,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_pos_branch_employees_branch_status"
        ON "pos_branch_employees" ("branchId", "status")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "pos_payroll_runs" (
        "id" BIGSERIAL PRIMARY KEY,
        "branchId" integer NOT NULL,
        "periodKey" character varying(32) NOT NULL,
        "label" character varying(255),
        "total" numeric(14,2) NOT NULL,
        "currency" character varying(8) NOT NULL DEFAULT 'ETB',
        "headcount" integer NOT NULL DEFAULT 0,
        "lines" jsonb NOT NULL,
        "expenseId" integer,
        "occurredAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "postedByUserId" integer,
        "note" text,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
      )
    `);

    // One run per branch per period. Payroll is the figure a hesitant user
    // presses twice, and a double post overstates costs by a whole month of
    // wages with nothing on screen to suggest it happened. The service saves the
    // run BEFORE the expense so this index, not a prior read, is what decides.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_pos_payroll_runs_branch_period"
        ON "pos_payroll_runs" ("branchId", "periodKey")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "pos_payroll_runs"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "pos_branch_employees"`);
  }
}
