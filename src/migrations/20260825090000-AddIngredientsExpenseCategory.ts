import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds INGREDIENTS to the branch expense categories, so goods bought to be
 * cooked or resold can be recorded as what they are: a direct cost of sales.
 *
 * Until now the nearest category was SUPPLIES, which posts to EXPENSE_SUPPLIES
 * (6030) — an operating expense, below the gross-profit line. That is the wrong
 * line for the single largest cost a restaurant has. A QSR's P&L computes COGS
 * from purchase-order history, and a restaurant that buys its meat and
 * vegetables at the market has no purchase orders at all, so every one of them
 * reported cost-of-sales 0 and a 100% gross margin while the real food cost sat
 * further down among the rent and the airtime.
 *
 * INGREDIENTS rows debit COGS (5000) and are reported against gross profit.
 *
 * Existing SUPPLIES rows are deliberately NOT converted, for the reason the
 * TAX_REMITTANCE migration left TAXES alone: SUPPLIES is a legitimate category
 * for things that really are operating supplies — cleaning materials, till roll,
 * bin bags — and this migration cannot tell those apart from a misfiled food
 * purchase. An owner who wants one moved can delete and re-record it.
 *
 * Postgres note: `ALTER TYPE ... ADD VALUE` is supported inside a transaction on
 * PG 12+ (migrations run in TypeORM's default 'all' transaction mode). The new
 * value is not used by any migration in the same transaction — only at runtime
 * after deploy — so the "can't use a new enum value in the same transaction"
 * restriction does not apply. `IF NOT EXISTS` keeps it idempotent.
 */
export class AddIngredientsExpenseCategory20260825090000
  implements MigrationInterface
{
  name = 'AddIngredientsExpenseCategory20260825090000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."branch_expenses_category_enum" ADD VALUE IF NOT EXISTS 'INGREDIENTS'`,
    );
  }

  public async down(): Promise<void> {
    // Postgres cannot drop an enum value without recreating the type, and any
    // row already using it would block that. An unused enum value costs nothing.
  }
}
