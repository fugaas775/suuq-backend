import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Seed the TUITION_REVENUE (code 4200) account into the general-ledger chart of
 * accounts so a SCHOOL fee settlement can post its revenue leg.
 *
 * `gl_journal_lines.accountCode` has an FK to `gl_accounts.code`, so the row must
 * exist before any tuition entry can post. `GL_ACCOUNT_SEED` in
 * `src/accounting/gl-accounts.constant.ts` already carries the account, but that
 * constant is only ever READ (by ledger-statements.service.ts, to render a chart
 * of accounts) — nothing inserts from it, so adding an entry there does not put
 * the row in the table.
 *
 * This one matters more than its 6100 precedent. SCHOOL is the first cash-basis
 * format routed to a revenue account other than SERVICE_REVENUE, and
 * `PosCheckoutService.postCheckoutToLedger` is invoked fire-and-forget with a
 * `logger.warn` catch — so a missing account row fails silently: the fee lands in
 * `pos_checkouts` and every POS report shows it, while the ledger and the
 * ledger-backed statements show nothing. That is the same invisible divergence
 * `pos-sync/rental-revenue-reconciliation.ts` exists to clean up after.
 *
 * Guarded the same way as AddBadDebtExpenseGlAccount: the general-ledger tables
 * are bootstrapped separately and are not live in every environment, so when
 * `gl_accounts` is absent this is a safe no-op; when present, the account is
 * inserted idempotently.
 *
 * Values are copied verbatim from GL_ACCOUNT_SEED so the table and the constant
 * cannot disagree.
 */
export class AddTuitionRevenueGlAccount20260810000000
  implements MigrationInterface
{
  name = 'AddTuitionRevenueGlAccount20260810000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = 'gl_accounts'
        ) THEN
          INSERT INTO "gl_accounts"
            ("code", "name", "type", "normalBalance", "isCurrent", "contra")
          VALUES
            ('4200', 'Tuition & fee revenue', 'REVENUE', 'CREDIT', NULL, false)
          ON CONFLICT ("code") DO NOTHING;
        END IF;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = 'gl_accounts'
        ) THEN
          DELETE FROM "gl_accounts" WHERE "code" = '4200';
        END IF;
      END $$;
    `);
  }
}
