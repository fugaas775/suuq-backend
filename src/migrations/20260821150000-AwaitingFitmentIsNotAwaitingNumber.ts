import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The fitting worklist stopped meaning anything once plateless became normal.
 *
 * `idx_pos_vehicle_registrations_awaiting_plate` was built for the query behind
 * "which plates are waiting to go on a car", and its predicate — `plateFittedAt
 * IS NULL AND status = 'ACTIVE'` — was a good match for that when every
 * registration came with a plate. It no longer is. A real number is granted by
 * the Federal Trade Ministry on the Bureau's application rather than taken off
 * a shelf, so most registrations legitimately have none, and a vehicle with no
 * number has no fitment date either. The index therefore came to cover very
 * nearly the whole register.
 *
 * Measured against a 50,000-row register with one vehicle actually awaiting
 * fitment: the planner abandoned the old index and sequentially scanned,
 * discarding 50,003 rows to find 1 — 2.6 ms and 673 buffers, growing linearly
 * with every vehicle the drive registers. With a predicate that matches the
 * query the same answer costs 0.016 ms and 8 buffers, and the index is 16 kB
 * against 344 kB because it holds only the rows that are genuinely waiting.
 *
 * The old index is dropped rather than left alongside: nothing else uses that
 * predicate, and an index nothing reads is still maintained on every write and
 * still grows with the register. `down()` puts it back.
 *
 * Note this is an INDEX-shaped consequence of a correctness fix. The query it
 * serves also gained `plateId IS NOT NULL`, without which the fitting worklist
 * listed every vehicle waiting on a federal number — offering the office a
 * "Fitted" button for a plate that had never been issued, and making one
 * worklist a superset of the other instead of the separate backlog it is.
 */
export class AwaitingFitmentIsNotAwaitingNumber20260821150000
  implements MigrationInterface
{
  name = 'AwaitingFitmentIsNotAwaitingNumber20260821150000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_pos_vehicle_registrations_awaiting_fitment"
        ON "pos_vehicle_registrations" ("branchId", "interimPermitExpiresAt")
        WHERE "plateId" IS NOT NULL
          AND "plateFittedAt" IS NULL
          AND "status" = 'ACTIVE'
    `);

    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_pos_vehicle_registrations_awaiting_plate"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_pos_vehicle_registrations_awaiting_plate"
        ON "pos_vehicle_registrations" ("branchId", "interimPermitExpiresAt")
        WHERE "plateFittedAt" IS NULL AND "status" = 'ACTIVE'
    `);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_pos_vehicle_registrations_awaiting_fitment"`,
    );
  }
}
