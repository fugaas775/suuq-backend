import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Lets the admin's Branches page read what each branch receipted today and
 * this month, and find its most recent sale, without walking every checkout
 * the platform has ever taken.
 *
 * Until now the only indexes on pos_checkouts led with branchId followed by a
 * key (idempotency, external id), so any question about a period of time read
 * all of a branch's rows. Index only — no data is changed.
 */
export class AddPosCheckoutBranchOccurredAtIndex20261122090000
  implements MigrationInterface
{
  name = 'AddPosCheckoutBranchOccurredAtIndex20261122090000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_pos_checkouts_branch_occurred_at" ON "pos_checkouts" ("branchId", "occurredAt")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_pos_checkouts_branch_occurred_at"`,
    );
  }
}
