import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The gap between issuing a plate and the plate reaching the car.
 *
 * Until now those were the same moment in the code and different moments in
 * reality. `ISSUED` meant "assigned on paper", and nothing recorded whether the
 * plate ever went on. In between, the record says one number and the vehicle
 * wears another — which is indistinguishable from a stolen car wearing a
 * swapped plate, and open-ended: a thief could register a stolen vehicle,
 * collect a genuine certificate, and simply never come back for the plate.
 *
 * Three columns close it:
 *
 *   plateFittedAt / plateFittedByUserId — when the plate actually went on, and
 *     who saw it. Null is not "unknown", it is "not yet", and that distinction
 *     is the whole point.
 *
 *   interimPermitNumber / interimPermitExpiresAt — the paper that makes the
 *     mismatch explainable at a checkpoint rather than suspicious. It names
 *     BOTH numbers, which is what an officer needs.
 *
 * The permit window is configurable per class (interimPermitDays, default 30)
 * rather than hard-coded, because the right answer is however long the office
 * actually takes to produce a plate — a number the Bureau knows and we do not.
 *
 * ── What this deliberately does NOT do ──────────────────────────────────────
 *
 * An expired permit does not suspend the registration. A citizen whose plate
 * the office has not produced would lose their registration through no fault of
 * their own, and the office's backlog would become the driver's offence. The
 * expiry makes the vehicle OVERDUE and puts it on a worklist; what follows is
 * the Bureau's decision, not this migration's.
 */
export class PlateFitmentWindow20260821130000 implements MigrationInterface {
  name = 'PlateFitmentWindow20260821130000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "pos_vehicle_registrations"
        ADD COLUMN IF NOT EXISTS "plateFittedAt" TIMESTAMP WITH TIME ZONE,
        ADD COLUMN IF NOT EXISTS "plateFittedByUserId" integer,
        ADD COLUMN IF NOT EXISTS "interimPermitNumber" character varying(64),
        ADD COLUMN IF NOT EXISTS "interimPermitExpiresAt" TIMESTAMP WITH TIME ZONE
    `);

    await queryRunner.query(`
      ALTER TABLE "pos_vehicle_classes"
        ADD COLUMN IF NOT EXISTS "interimPermitDays" integer NOT NULL DEFAULT 30
    `);

    // The worklist: everything registered whose plate has not gone on, oldest
    // first. Partial because a fitted registration is the overwhelming majority
    // once the drive settles, and none of them belong in this query.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_pos_vehicle_registrations_awaiting_plate"
        ON "pos_vehicle_registrations" ("branchId", "interimPermitExpiresAt")
        WHERE "plateFittedAt" IS NULL AND "status" = 'ACTIVE'
    `);

    // Every registration that predates this change was issued under the old
    // meaning of ISSUED, where handing the plate over was assumed. Treating
    // them as awaiting fitment would invent a backlog that never existed and
    // put working vehicles on an overdue list.
    await queryRunner.query(`
      UPDATE "pos_vehicle_registrations"
         SET "plateFittedAt" = "issuedAt"
       WHERE "plateFittedAt" IS NULL
         AND "issuedAt" IS NOT NULL
         AND "status" = 'ACTIVE'
    `);

    await queryRunner.query(`
      UPDATE "pos_vehicle_plates"
         SET "status" = 'FITTED'
       WHERE "status" = 'ISSUED'
         AND "registrationId" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "pos_vehicle_plates" SET "status" = 'ISSUED' WHERE "status" = 'FITTED'`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_pos_vehicle_registrations_awaiting_plate"`,
    );
    await queryRunner.query(`
      ALTER TABLE "pos_vehicle_classes" DROP COLUMN IF EXISTS "interimPermitDays"
    `);
    await queryRunner.query(`
      ALTER TABLE "pos_vehicle_registrations"
        DROP COLUMN IF EXISTS "plateFittedAt",
        DROP COLUMN IF EXISTS "plateFittedByUserId",
        DROP COLUMN IF EXISTS "interimPermitNumber",
        DROP COLUMN IF EXISTS "interimPermitExpiresAt"
    `);
  }
}
