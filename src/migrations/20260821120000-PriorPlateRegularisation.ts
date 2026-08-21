import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * What the vehicle arrived carrying.
 *
 * The registry was built for a clean slate: a vehicle turns up with no history,
 * gets a plate from stock, and the chassis is a reliable anchor. That is not the
 * situation in the Somali Region. The fleet being registered has never been on a
 * register at all, and most of it is already wearing a number — some invented,
 * some issued by a zonal office with no regional record behind it, some nothing
 * at all.
 *
 * Three consequences the original model could not express:
 *
 *   1. THE OLD NUMBER MUST REMAIN SEARCHABLE. A car is known locally by the
 *      number on it. Police reports, insurance claims and ownership disputes
 *      all reference it. An officer holding a case file that says "3-SM-00042"
 *      must be able to find the vehicle that now carries something else.
 *
 *   2. PRESENTED NUMBERS ARE NOT UNIQUE, and must not be. Two invented plates
 *      can carry the same number, and both cars are real and both need
 *      registering. Indexed for lookup, never constrained — the unique index
 *      belongs on plates WE issue, and only there.
 *
 *   3. A FAKE NUMBER CAN COLLIDE WITH REAL STOCK. If a car is wearing an
 *      invented "3-SM-00042" and that number is sitting in an office drawer,
 *      issuing it to a different vehicle puts two cars on the road with one
 *      number — the exact fault this registry exists to end, created by the
 *      registry itself. Hence the QUARANTINED plate state.
 *
 * ── And the reason chassisCondition exists ──────────────────────────────────
 *
 * A first-registration drive is the best opportunity anyone will ever have to
 * launder a stolen vehicle into a legitimate record: no prior register to
 * contradict the claim, and a queue of genuinely unregistered cars to hide in.
 * The chassis is the only identity a thief cannot repaint, which is why it is
 * the one they grind off. Recording that it was worn, tampered or absent — at
 * the moment of registration, by the clerk who saw it — is what lets the Bureau
 * come back to those records later. A field left blank tells you nothing; a
 * field that says ABSENT tells you where to look.
 */
export class PriorPlateRegularisation20260821120000
  implements MigrationInterface
{
  name = 'PriorPlateRegularisation20260821120000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "pos_vehicles"
        ADD COLUMN IF NOT EXISTS "presentedPlateNumber" character varying(32),
        ADD COLUMN IF NOT EXISTS "presentedPlateOrigin" character varying(24),
        ADD COLUMN IF NOT EXISTS "presentedPlateNote" character varying(512),
        ADD COLUMN IF NOT EXISTS "chassisCondition" character varying(24)
    `);

    // Deliberately NOT unique. Two invented plates can share a number and both
    // cars are real. This index is for finding a vehicle by the number it used
    // to wear, which is how a police file from before the drive resolves.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_pos_vehicles_presented_plate"
        ON "pos_vehicles" ("tenantId", UPPER("presentedPlateNumber"))
        WHERE "presentedPlateNumber" IS NOT NULL
    `);

    // Reporting the drive: how much of the fleet arrived with an invented
    // number, how much from a zonal office, how much with nothing.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_pos_vehicles_presented_origin"
        ON "pos_vehicles" ("tenantId", "presentedPlateOrigin")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_pos_vehicles_presented_origin"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_pos_vehicles_presented_plate"`,
    );
    await queryRunner.query(`
      ALTER TABLE "pos_vehicles"
        DROP COLUMN IF EXISTS "presentedPlateNumber",
        DROP COLUMN IF EXISTS "presentedPlateOrigin",
        DROP COLUMN IF EXISTS "presentedPlateNote",
        DROP COLUMN IF EXISTS "chassisCondition"
    `);
  }
}
