import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Lets a branch say whether its prices ALREADY contain the tax.
 *
 * false (the default, and what every branch has been doing) = exclusive: the
 * catalog price is net and tax is added at checkout. true = inclusive: the
 * shelf price is what the customer pays and the tax is extracted out of it.
 *
 * Defaulting to false keeps every existing branch on the exclusive behaviour
 * that shipped with taxEnabled/taxRate, so this migration changes no money.
 */
export class AddBranchTaxInclusive20260806000100 implements MigrationInterface {
  name = 'AddBranchTaxInclusive20260806000100';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "branches" ADD COLUMN IF NOT EXISTS "taxInclusive" boolean NOT NULL DEFAULT false`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "branches" DROP COLUMN IF EXISTS "taxInclusive"`,
    );
  }
}
