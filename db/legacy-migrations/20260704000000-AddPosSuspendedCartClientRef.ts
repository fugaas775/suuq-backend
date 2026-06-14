import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Idempotency key for offline-parked baskets. POS lanes can now hold a basket
 * while the connection is down and replay it on reconnect; a retry whose response
 * was dropped mid-reconnect must dedupe to the originally-created cart rather than
 * create a duplicate. We add a nullable `clientRef` column and a unique
 * (branchId, clientRef) index — Postgres treats NULLs as distinct, so existing
 * online/legacy carts (which carry no clientRef) stay unconstrained.
 */
export class AddPosSuspendedCartClientRef20260704000000
  implements MigrationInterface
{
  name = 'AddPosSuspendedCartClientRef20260704000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "pos_suspended_carts" ADD COLUMN "clientRef" character varying(128)`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_pos_suspended_carts_branch_client_ref" ON "pos_suspended_carts" ("branchId", "clientRef")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "IDX_pos_suspended_carts_branch_client_ref"`,
    );
    await queryRunner.query(
      `ALTER TABLE "pos_suspended_carts" DROP COLUMN "clientRef"`,
    );
  }
}
