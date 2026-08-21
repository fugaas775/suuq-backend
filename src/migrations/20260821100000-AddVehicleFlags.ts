import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Reports against a vehicle — stolen, impounded, wanted, court-held.
 *
 * Brought forward from the lifecycle phase because the public verification page
 * is where a flag earns its keep: a scan that cannot say "this vehicle is
 * reported stolen" is a forgery check and nothing more. The whole point of
 * putting a QR on a certificate is that the database knows something the paper
 * cannot.
 *
 * Keyed on the VEHICLE rather than the registration, so a flag survives a
 * transfer. A thief's first move is to re-register; a flag hung off a
 * registration would be cleared by exactly that.
 *
 * The partial index is the one the verification page hits on every scan — only
 * OPEN flags matter there, and there will be far more cleared rows than open
 * ones once the registry has been running a while.
 */
export class AddVehicleFlags20260821100000 implements MigrationInterface {
  name = 'AddVehicleFlags20260821100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "pos_vehicle_flags" (
        "id" BIGSERIAL PRIMARY KEY,
        "tenantId" integer NOT NULL,
        "vehicleId" bigint NOT NULL,
        "type" character varying(24) NOT NULL,
        "reference" character varying(128),
        "note" character varying(1024),
        "raisedByUserId" integer,
        "raisedAtBranchId" integer,
        "raisedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "clearedAt" TIMESTAMP WITH TIME ZONE,
        "clearedByUserId" integer,
        "clearReason" character varying(1024),
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_pos_vehicle_flags_vehicle"
        ON "pos_vehicle_flags" ("vehicleId")
    `);

    // What every verification scan asks: does this vehicle have an OPEN flag?
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_pos_vehicle_flags_open"
        ON "pos_vehicle_flags" ("vehicleId", "type")
        WHERE "clearedAt" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "pos_vehicle_flags"`);
  }
}
