import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds OWNER_CONTRIBUTION to the branch expense categories, so an owner putting
 * their own money into the business finally has somewhere to record it.
 *
 * Until now the books had only a money-out door: every row in branch_expenses
 * reduced cash, and the one thing that raises it outside a sale — the owner
 * funding the branch — could not be written down at all. A school owner who
 * covered payroll from their own pocket saw the expense land and the cash that
 * paid it appear from nowhere.
 *
 * OWNER_CONTRIBUTION rows debit CASH (1000) and credit OWNER_EQUITY (3000).
 * They never touch the P&L — contributed capital is not income — and the
 * balance sheet adds them to cash instead of subtracting. See
 * `isCapitalContributionCategory`.
 *
 * Postgres note: `ALTER TYPE ... ADD VALUE` is supported inside a transaction on
 * PG 12+ (migrations run in TypeORM's default 'all' transaction mode). The new
 * value is not used by any migration in the same transaction — only at runtime
 * after deploy — so the "can't use a new enum value in the same transaction"
 * restriction does not apply. `IF NOT EXISTS` keeps it idempotent.
 */
export class AddOwnerContributionExpenseCategory20260905090000
  implements MigrationInterface
{
  name = 'AddOwnerContributionExpenseCategory20260905090000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."branch_expenses_category_enum" ADD VALUE IF NOT EXISTS 'OWNER_CONTRIBUTION'`,
    );
  }

  public async down(): Promise<void> {
    // Postgres cannot drop an enum value without recreating the type, and any
    // row already using it would block that. An unused enum value costs nothing.
  }
}
