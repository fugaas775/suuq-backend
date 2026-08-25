import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Gives a purchase run the id the DEVICE gave it, so one market trip cannot
 * become two.
 *
 * Filing a run is a POST from a phone standing in a market. The write lands,
 * the response does not come back, the purchaser taps again — and the branch
 * has two runs for one trip. Approve both and the books carry the food twice.
 * Nothing upstream prevents it: the server had no way to tell a retry from a
 * second trip to the same stall on the same morning.
 *
 * `clientRef` is minted on the device when the draft is started and travels
 * with it, so a retry after ANY kind of failure — lost response, reload, the
 * phone sleeping mid-request — carries the same one. The unique index is what
 * actually enforces it; the service reads the existing row back and returns it,
 * so the retry looks like success because it is.
 *
 * Nullable, and unique only where present: every run filed before this has no
 * ref and none of them should collide with each other.
 */
export class AddPurchaseRunClientRef20260825140000
  implements MigrationInterface
{
  name = 'AddPurchaseRunClientRef20260825140000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "pos_purchase_runs" ADD COLUMN IF NOT EXISTS "clientRef" character varying(64)`,
    );
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_pos_purchase_runs_branch_client_ref"
        ON "pos_purchase_runs" ("branchId", "clientRef")
        WHERE "clientRef" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "uq_pos_purchase_runs_branch_client_ref"`,
    );
    await queryRunner.query(
      `ALTER TABLE "pos_purchase_runs" DROP COLUMN IF EXISTS "clientRef"`,
    );
  }
}
