import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * A lost book is money, and money is the office's.
 *
 * The title carries what a replacement costs; the loan carries when and for
 * how much the office billed it, and which folio line is the bill. The line
 * on the folio is the money; these three columns are the register's memory
 * of it, so "who still owes us a book" can be answered from the register
 * alone and a book billed once is never billed twice.
 */
export class AddSchoolTextbookPricesAndBilling20260920150000
  implements MigrationInterface
{
  name = 'AddSchoolTextbookPricesAndBilling20260920150000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "pos_school_textbook_titles"
        ADD COLUMN IF NOT EXISTS "replacementPrice" numeric(12,2)
    `);
    await queryRunner.query(`
      ALTER TABLE "pos_school_textbook_loans"
        ADD COLUMN IF NOT EXISTS "billedAt" date,
        ADD COLUMN IF NOT EXISTS "billedAmount" numeric(12,2),
        ADD COLUMN IF NOT EXISTS "billedLineId" character varying(64)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "pos_school_textbook_loans"
        DROP COLUMN IF EXISTS "billedLineId",
        DROP COLUMN IF EXISTS "billedAmount",
        DROP COLUMN IF EXISTS "billedAt"
    `);
    await queryRunner.query(`
      ALTER TABLE "pos_school_textbook_titles"
        DROP COLUMN IF EXISTS "replacementPrice"
    `);
  }
}
