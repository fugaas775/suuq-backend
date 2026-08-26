import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Makes a recorded expense voidable instead of deletable.
 *
 * `branch_expenses` had no lifecycle at all: the only way to correct a row was
 * `DELETE`, which is what the Financials → Capital & books panel did on a single
 * tap. The amount, the note, the date and who recorded it were gone; the only
 * surviving trace was a reversing journal entry whose memo read
 * "Reversal of expense-123", with no actor and no reason, netting to zero on the
 * P&L so no statement ever admitted a row had existed.
 *
 * A void keeps the row and records who did it, when, and why. Readers that
 * answer "what did this branch spend" filter `voidedAt IS NULL`; the partial
 * index below is the one they use.
 *
 * Nothing to backfill — every existing row is live, which is exactly what a null
 * `voidedAt` means. Rows already hard-deleted before this cannot be recovered.
 */
export class AddBranchExpenseVoid20260826100000 implements MigrationInterface {
  name = 'AddBranchExpenseVoid20260826100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "branch_expenses" ADD COLUMN IF NOT EXISTS "voidedAt" TIMESTAMP NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "branch_expenses" ADD COLUMN IF NOT EXISTS "voidedByUserId" integer NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "branch_expenses" ADD COLUMN IF NOT EXISTS "voidedByName" character varying(160) NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "branch_expenses" ADD COLUMN IF NOT EXISTS "voidReason" text NULL`,
    );
    // Every money question this table answers is "live rows, this branch, this
    // date range" — a partial index keeps voided rows out of that scan entirely.
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_branch_expenses_live" ON "branch_expenses" ("branchId", "occurredAt") WHERE "voidedAt" IS NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_branch_expenses_live"`);
    await queryRunner.query(
      `ALTER TABLE "branch_expenses" DROP COLUMN IF EXISTS "voidReason"`,
    );
    await queryRunner.query(
      `ALTER TABLE "branch_expenses" DROP COLUMN IF EXISTS "voidedByName"`,
    );
    await queryRunner.query(
      `ALTER TABLE "branch_expenses" DROP COLUMN IF EXISTS "voidedByUserId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "branch_expenses" DROP COLUMN IF EXISTS "voidedAt"`,
    );
  }
}
