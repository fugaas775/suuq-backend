import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Makes a NEW branch start with tax switched on (15%, added at checkout).
 *
 * `ALTER COLUMN ... SET DEFAULT` only affects rows inserted from here on; it
 * does not rewrite existing ones. That is the entire point of doing it this way
 * rather than with an UPDATE: at the time of writing 40 branches were trading
 * and only one charged tax, so flipping them all would have raised every price
 * at 39 businesses by 15% the moment their till re-synced — including hotels
 * with guests mid-stay and live property leases. On a multi-tenant platform
 * those are other people's customers and other people's tax registrations.
 *
 * An existing branch turns tax on the same way it always could: its owner, in
 * Seller HQ.
 */
export class DefaultBranchTaxEnabled20260807000200
  implements MigrationInterface
{
  name = 'DefaultBranchTaxEnabled20260807000200';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "branches" ALTER COLUMN "taxEnabled" SET DEFAULT true`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "branches" ALTER COLUMN "taxEnabled" SET DEFAULT false`,
    );
  }
}
