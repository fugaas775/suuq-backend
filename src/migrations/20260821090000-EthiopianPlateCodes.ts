import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Teach the registry the real Ethiopian plate system.
 *
 * The first cut modelled a plate as "a prefix and a number" and seeded the
 * Somali Region with prefix '5'. That was wrong twice over. In the Ethiopian
 * system 5 is not a region at all — it is the CLASS code for religious and
 * civic bodies — and the Somali Region's code is ሶማ / SM. A plate carries two
 * independent identifiers:
 *
 *   CLASS code   1 taxi · 2 private · 3 commercial · 4 government
 *                5 religious & civic · ፖሊስ police · UN · AU · ተላላፊ temporary
 *   REGION code  ኢት/ET · አአ/AA · አፋ/AF · አማ/AM · ቤጉ/BG · ድሬ/DR
 *                ጋም/GM · ሐረ/HR · ኦሮ/OR · ሶማ/SM
 *
 * The class also fixes the plate's COLOURS, which are how a traffic officer
 * reads a vehicle's category from thirty metres — a red plate is a taxi, green
 * lettering is commercial, orange is an NGO. Colour is therefore registry data,
 * not decoration, and it belongs on the class rather than in a stylesheet.
 *
 * ── Components stored, display derived ──────────────────────────────────────
 *
 * The class code, the region code and the serial are stored as separate columns
 * and the printed string is composed from them. The source does not state the
 * exact arrangement, so composing at read time means a correction from the
 * Bureau is a formatting change rather than a migration that rewrites every
 * plate a vehicle is already carrying.
 *
 * Safe to run on live data: every column is nullable or defaulted, and no
 * existing row is rewritten. At the time of writing the only plates in
 * existence are 200 unissued blanks on a test office, bound to no registration.
 */
export class EthiopianPlateCodes20260821090000 implements MigrationInterface {
  name = 'EthiopianPlateCodes20260821090000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── Classes carry the plate code and its colours ───────────────────────
    await queryRunner.query(`
      ALTER TABLE "pos_vehicle_classes"
        ADD COLUMN IF NOT EXISTS "plateCode" character varying(16),
        ADD COLUMN IF NOT EXISTS "plateBackgroundColour" character varying(24),
        ADD COLUMN IF NOT EXISTS "plateTextColour" character varying(24)
    `);

    // ── A series is a block of ONE class's plates for ONE region ───────────
    await queryRunner.query(`
      ALTER TABLE "pos_vehicle_plate_series"
        ADD COLUMN IF NOT EXISTS "plateCode" character varying(16),
        ADD COLUMN IF NOT EXISTS "regionCode" character varying(16)
    `);

    // A plate's own components, so a number can be read back apart without
    // parsing the printed string — which is exactly the parsing that would
    // break the day the Bureau confirms a different arrangement.
    await queryRunner.query(`
      ALTER TABLE "pos_vehicle_plates"
        ADD COLUMN IF NOT EXISTS "plateCode" character varying(16),
        ADD COLUMN IF NOT EXISTS "regionCode" character varying(16),
        ADD COLUMN IF NOT EXISTS "serial" integer
    `);

    // Backfill the serial from sortKey, which has always been the numeric part.
    await queryRunner.query(`
      UPDATE "pos_vehicle_plates"
         SET "serial" = "sortKey"
       WHERE "serial" IS NULL
    `);

    // Region lookups: "every plate this region has issued" is a real question
    // for a bureau that shares a national numbering scheme with nine others.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_pos_vehicle_plates_region_code"
        ON "pos_vehicle_plates" ("tenantId", "regionCode", "plateCode")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_pos_vehicle_plates_region_code"`,
    );
    await queryRunner.query(`
      ALTER TABLE "pos_vehicle_plates"
        DROP COLUMN IF EXISTS "plateCode",
        DROP COLUMN IF EXISTS "regionCode",
        DROP COLUMN IF EXISTS "serial"
    `);
    await queryRunner.query(`
      ALTER TABLE "pos_vehicle_plate_series"
        DROP COLUMN IF EXISTS "plateCode",
        DROP COLUMN IF EXISTS "regionCode"
    `);
    await queryRunner.query(`
      ALTER TABLE "pos_vehicle_classes"
        DROP COLUMN IF EXISTS "plateCode",
        DROP COLUMN IF EXISTS "plateBackgroundColour",
        DROP COLUMN IF EXISTS "plateTextColour"
    `);
  }
}
