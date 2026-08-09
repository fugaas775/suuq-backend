import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds TAX_REMITTANCE to the branch expense categories, so paying collected VAT
 * over to the authority can be recorded as what it is: settling a liability.
 *
 * Until now the only way to record it was the TAXES category, which posts to
 * EXPENSE_TAXES (6060). That is wrong twice over. VAT collected was never
 * revenue — it is credited to TAX_PAYABLE (2100) on every sale and netted out of
 * the P&L already — so booking the payment as an expense understates profit by
 * the whole remittance. And because nothing ever debited TAX_PAYABLE, the
 * liability grew forever: cash went down, the balance sheet still said the money
 * was owed, and equity absorbed the difference twice.
 *
 * TAX_REMITTANCE rows debit TAX_PAYABLE instead, and are excluded from operating
 * expenses. Cash still falls, because it is the same cash leg either way.
 *
 * Existing TAXES rows are deliberately NOT converted. TAXES is a legitimate
 * expense category for taxes that really are costs — a business licence, a
 * municipal levy — and this migration cannot tell those apart from a misfiled
 * VAT payment. An owner who filed a VAT payment under TAXES can delete it (which
 * reverses its ledger entry) and re-record it as a remittance.
 *
 * Postgres note: `ALTER TYPE ... ADD VALUE` is supported inside a transaction on
 * PG 12+ (migrations run in TypeORM's default 'all' transaction mode). The new
 * value is not used by any migration in the same transaction — only at runtime
 * after deploy — so the "can't use a new enum value in the same transaction"
 * restriction does not apply. `IF NOT EXISTS` keeps it idempotent.
 *
 * Mirrored into db/baseline/schema.sql so fresh environments bootstrap with it.
 */
export class AddTaxRemittanceExpenseCategory20260809000000
  implements MigrationInterface
{
  name = 'AddTaxRemittanceExpenseCategory20260809000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."branch_expenses_category_enum" ADD VALUE IF NOT EXISTS 'TAX_REMITTANCE'`,
    );
  }

  public async down(): Promise<void> {
    // Postgres cannot drop an enum value without recreating the type, and any
    // row already using it would block that. Leaving the value in place is the
    // safe, reversible-enough path — an unused enum value costs nothing.
  }
}
