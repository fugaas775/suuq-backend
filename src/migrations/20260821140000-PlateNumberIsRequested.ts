import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * A real plate number is REQUESTED, not taken off a shelf.
 *
 * The registry was built assuming an office holds blank plates and hands one
 * over at the counter. That is not how this works. A real number requires a
 * request through the Bureau, and the zonal office cannot simply allocate one —
 * so registration had a hard dependency on stock the office does not have.
 *
 * The consequence was total: `draftRegistration` allocated a plate
 * unconditionally and threw when none was available, which meant an office with
 * no stock could not register a single vehicle. The whole point of the drive —
 * getting unregistered cars onto a register — was blocked by a plate the Bureau
 * was never going to issue at that moment.
 *
 * ── What the Bureau actually wants ──────────────────────────────────────────
 *
 *   1. Register vehicles that have no real plate number.
 *   2. Let anyone verify whether a vehicle is registered.
 *
 * The plate is a later, separate matter. So a registration with NO plate is now
 * the normal, valid, expected state — not a half-finished one — and these
 * columns record the request when the office makes it, so a vehicle waiting on
 * a number can be chased rather than forgotten.
 */
export class PlateNumberIsRequested20260821140000 implements MigrationInterface {
  name = 'PlateNumberIsRequested20260821140000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "pos_vehicle_registrations"
        ADD COLUMN IF NOT EXISTS "federalPlateRequestedAt" TIMESTAMP WITH TIME ZONE,
        ADD COLUMN IF NOT EXISTS "federalPlateRequestReference" character varying(128),
        ADD COLUMN IF NOT EXISTS "federalPlateRequestedByUserId" integer
    `);

    // The office's real worklist: registered vehicles with no number yet.
    // Partial, because once the drive matures most registrations will have one
    // and none of those belong in this query.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_pos_vehicle_registrations_no_plate"
        ON "pos_vehicle_registrations" ("branchId", "federalPlateRequestedAt")
        WHERE "plateId" IS NULL AND "status" = 'ACTIVE'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_pos_vehicle_registrations_no_plate"`,
    );
    await queryRunner.query(`
      ALTER TABLE "pos_vehicle_registrations"
        DROP COLUMN IF EXISTS "federalPlateRequestedAt",
        DROP COLUMN IF EXISTS "federalPlateRequestReference",
        DROP COLUMN IF EXISTS "federalPlateRequestedByUserId"
    `);
  }
}
