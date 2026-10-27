import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * A NEW branch starts with tax switched OFF — in every service format, schools
 * included (owner's policy, 2026-10-27). Reverses DefaultBranchTaxEnabled
 * (2026-08-07), which made every branch inserted without the column start at
 * 15%: the one creation path that still relied on the column default (the
 * admin `POST /pos/v1/branches`) produced a school charging VAT on tuition.
 *
 * `ALTER COLUMN ... SET DEFAULT` touches only rows inserted from here on. The
 * four branches that charge tax today chose to (inclusive pricing, two with a
 * TIN on file) and keep it; an owner switches tax on or off in Seller HQ.
 */
export class DefaultBranchTaxDisabled20261027000000
  implements MigrationInterface
{
  name = 'DefaultBranchTaxDisabled20261027000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "branches" ALTER COLUMN "taxEnabled" SET DEFAULT false`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "branches" ALTER COLUMN "taxEnabled" SET DEFAULT true`,
    );
  }
}
