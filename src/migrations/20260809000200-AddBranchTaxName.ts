import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Lets a branch say what its tax is CALLED — "VAT", "TOT", "Sales Tax".
 *
 * Null means VAT, so every receipt already printed keeps reading exactly as it
 * did and no branch has to be touched.
 *
 * This is the Turnover Tax story. An Ethiopian business below the VAT threshold
 * charges 2% TOT rather than 15% VAT, and the two differ, as far as a till can
 * tell, in the rate and the word on the slip — the system has no input-credit
 * concept for a second regime to behave differently in. Printing "VAT" on the
 * receipt of a business that is not VAT-registered misstates its tax status to
 * its own customers, which is the part that actually matters.
 */
export class AddBranchTaxName20260809000200 implements MigrationInterface {
  name = 'AddBranchTaxName20260809000200';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "branches" ADD COLUMN IF NOT EXISTS "taxName" character varying(32)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "branches" DROP COLUMN IF EXISTS "taxName"`,
    );
  }
}
