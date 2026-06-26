import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Seed the BAD_DEBT_EXPENSE (code 6100) account into the general-ledger chart of
 * accounts so a manager-approved BAD_DEBT write-off tender can post its loss leg.
 *
 * `gl_journal_lines.accountCode` has an FK to `gl_accounts.code`, so the row must
 * exist before any bad-debt entry can post. This migration is intentionally
 * guarded: the general-ledger tables are bootstrapped by the (separate)
 * CreateGeneralLedger migration, which is not yet live in every environment. When
 * `gl_accounts` is absent this is a safe no-op (CreateGeneralLedger seeds the row
 * itself from GL_ACCOUNT_SEED when it runs); when present, the account is inserted
 * idempotently.
 */
export class AddBadDebtExpenseGlAccount20260726000000
  implements MigrationInterface
{
  name = 'AddBadDebtExpenseGlAccount20260726000000';

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
            ('6100', 'Bad debt expense', 'EXPENSE', 'DEBIT', NULL, false)
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
          DELETE FROM "gl_accounts" WHERE "code" = '6100';
        END IF;
      END $$;
    `);
  }
}
