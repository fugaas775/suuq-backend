import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The vehicle registry for the Somali Regional State Bureau of Trade and
 * Transport.
 *
 * Seven tables behind one idea: a VEHICLE is an identity that exists once, and
 * a REGISTRATION is a licence that exists per ownership period. Everything else
 * hangs off that split — history is preserved by construction rather than by an
 * audit trail somebody has to remember to write, and a transfer closes one row
 * and opens another instead of overwriting the previous keeper out of existence.
 *
 * Three constraints below are load-bearing, and each answers a way a paper
 * registry fails today:
 *
 *   1. UNIQUE (tenantId, UPPER(vin)) — a chassis registered in Jigjiga cannot be
 *      registered again in Godey. This is the one place the platform's
 *      branch-scoping convention is deliberately broken: uniqueness spans the
 *      TENANT (the Bureau), while access stays branch-checked by
 *      PosBranchAccessGuard. Case-folded because a VIN is transcribed by hand
 *      off a stamped plate.
 *
 *   2. UNIQUE (tenantId, UPPER(plateNumber)) — the duplicate-plate-across-two-
 *      woredas problem, which is the fault the Bureau most needs closed.
 *
 *   3. UNIQUE (vehicleId) WHERE status='ACTIVE' — one live registration per
 *      vehicle, guaranteed by Postgres rather than by service discipline. Two
 *      live licences on one chassis is the corruption the whole system exists to
 *      prevent, so it is not left to a code path to remember.
 *
 * No foreign keys, following the house convention for operational tables (see
 * pos_school_classes, pos_hotel_rooms): branches and users are managed
 * elsewhere, and ON DELETE cascades are the last thing a statutory register
 * should have. Integrity is the service's job; these indexes are what make the
 * service's job checkable.
 *
 * No backfill. This is a new domain with nothing to migrate — the paper fleet
 * arrives later through the bulk importer, which routes through the same
 * issuance path so every imported vehicle gets a certificate and a QR.
 */
export class AddVehicleRegistry20260820120000 implements MigrationInterface {
  name = 'AddVehicleRegistry20260820120000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── Classes ────────────────────────────────────────────────────────────
    // Tenant-scoped: a minibus is a minibus in every zone, and per-office class
    // tables would let two woredas diverge on what a vehicle is.
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "pos_vehicle_classes" (
        "id" BIGSERIAL PRIMARY KEY,
        "tenantId" integer NOT NULL,
        "code" character varying(64) NOT NULL,
        "nameEn" character varying(255) NOT NULL,
        "nameSo" character varying(255),
        "nameAm" character varying(255),
        "plateSeriesPrefix" character varying(16),
        "renewalMonths" integer NOT NULL DEFAULT 12,
        "inspectionRequired" boolean NOT NULL DEFAULT true,
        "plateFollowsVehicle" boolean NOT NULL DEFAULT true,
        "registrationFeeSku" character varying(64),
        "renewalFeeSku" character varying(64),
        "transferFeeSku" character varying(64),
        "plateFeeSku" character varying(64),
        "inspectionFeeSku" character varying(64),
        "penaltyFeeSku" character varying(64),
        "sortOrder" integer NOT NULL DEFAULT 0,
        "status" character varying(16) NOT NULL DEFAULT 'ACTIVE',
        "metadata" jsonb,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_pos_vehicle_classes_tenant_code"
        ON "pos_vehicle_classes" ("tenantId", LOWER("code"))
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_pos_vehicle_classes_tenant_status"
        ON "pos_vehicle_classes" ("tenantId", "status")
    `);

    // ── Owners ─────────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "pos_vehicle_owners" (
        "id" BIGSERIAL PRIMARY KEY,
        "tenantId" integer NOT NULL,
        "kind" character varying(16) NOT NULL DEFAULT 'PERSON',
        "fullName" character varying(255) NOT NULL,
        "nationalId" character varying(64),
        "tin" character varying(64),
        "phone" character varying(32),
        "email" character varying(255),
        "address" character varying(512),
        "zone" character varying(128),
        "woreda" character varying(128),
        "metadata" jsonb,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
      )
    `);
    // Partial: an ID is optional, because a registry that turned a vehicle away
    // for want of one would leave it unregistered — worse for the Bureau than a
    // record with a gap. Where it IS given, one person is one owner.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_pos_vehicle_owners_tenant_national_id"
        ON "pos_vehicle_owners" ("tenantId", LOWER("nationalId"))
        WHERE "nationalId" IS NOT NULL
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_pos_vehicle_owners_tenant_phone"
        ON "pos_vehicle_owners" ("tenantId", "phone")
    `);
    // The counter searches by name constantly and an owner's name is rarely
    // typed the same way twice; trigram beats LIKE for "Cabdi" vs "Abdi".
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_pos_vehicle_owners_name_trgm"
        ON "pos_vehicle_owners" USING gin (LOWER("fullName") gin_trgm_ops)
    `);

    // ── Vehicles ───────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "pos_vehicles" (
        "id" BIGSERIAL PRIMARY KEY,
        "tenantId" integer NOT NULL,
        "homeBranchId" integer NOT NULL,
        "classId" bigint NOT NULL,
        "vin" character varying(64) NOT NULL,
        "engineNumber" character varying(64),
        "make" character varying(128),
        "model" character varying(128),
        "modelYear" integer,
        "colour" character varying(64),
        "fuel" character varying(32),
        "seats" integer,
        "grossWeightKg" integer,
        "engineCc" integer,
        "importRef" character varying(128),
        "metadata" jsonb,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
      )
    `);
    // Constraint 1. Region-wide, case-folded.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_pos_vehicles_tenant_vin"
        ON "pos_vehicles" ("tenantId", UPPER("vin"))
    `);
    // Indexed, NOT unique: an engine is replaceable, so two vehicles can
    // honestly share an engine number across a rebuild. Still the field an
    // investigator searches on.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_pos_vehicles_tenant_engine"
        ON "pos_vehicles" ("tenantId", UPPER("engineNumber"))
        WHERE "engineNumber" IS NOT NULL
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_pos_vehicles_tenant_class"
        ON "pos_vehicles" ("tenantId", "classId")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_pos_vehicles_home_branch"
        ON "pos_vehicles" ("homeBranchId")
    `);

    // ── Plate series ───────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "pos_vehicle_plate_series" (
        "id" BIGSERIAL PRIMARY KEY,
        "tenantId" integer NOT NULL,
        "branchId" integer NOT NULL,
        "classId" bigint,
        "prefix" character varying(16) NOT NULL,
        "rangeStart" integer NOT NULL,
        "rangeEnd" integer NOT NULL,
        "numberWidth" integer NOT NULL DEFAULT 5,
        "status" character varying(16) NOT NULL DEFAULT 'ACTIVE',
        "metadata" jsonb,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "chk_pos_vehicle_plate_series_range"
          CHECK ("rangeEnd" >= "rangeStart")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_pos_vehicle_plate_series_branch_status"
        ON "pos_vehicle_plate_series" ("branchId", "status")
    `);

    // ── Plates ─────────────────────────────────────────────────────────────
    // A row per physical blank, materialised when its series is created. That
    // is what makes allocation a single FOR UPDATE SKIP LOCKED statement, makes
    // "how many are left in Godey" a COUNT, and gives a spoiled plate somewhere
    // to be recorded.
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "pos_vehicle_plates" (
        "id" BIGSERIAL PRIMARY KEY,
        "tenantId" integer NOT NULL,
        "branchId" integer NOT NULL,
        "seriesId" bigint NOT NULL,
        "plateNumber" character varying(32) NOT NULL,
        "sortKey" integer NOT NULL,
        "status" character varying(16) NOT NULL DEFAULT 'IN_STOCK',
        "registrationId" bigint,
        "statusReason" character varying(512),
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
      )
    `);
    // Constraint 2.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_pos_vehicle_plates_tenant_number"
        ON "pos_vehicle_plates" ("tenantId", UPPER("plateNumber"))
    `);
    // The allocation pick reads exactly this: series + IN_STOCK, lowest sortKey.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_pos_vehicle_plates_pick"
        ON "pos_vehicle_plates" ("seriesId", "status", "sortKey")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_pos_vehicle_plates_branch_status"
        ON "pos_vehicle_plates" ("branchId", "status")
    `);

    // ── Registrations ──────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "pos_vehicle_registrations" (
        "id" BIGSERIAL PRIMARY KEY,
        "tenantId" integer NOT NULL,
        "branchId" integer NOT NULL,
        "vehicleId" bigint NOT NULL,
        "ownerId" bigint NOT NULL,
        "plateId" bigint,
        "certificateNumber" character varying(64),
        "verificationCode" character varying(16),
        "status" character varying(24) NOT NULL DEFAULT 'PENDING_ISSUE',
        "issuedAt" TIMESTAMP WITH TIME ZONE,
        "expiresAt" TIMESTAMP WITH TIME ZONE,
        "endedAt" TIMESTAMP WITH TIME ZONE,
        "issuedCheckoutId" integer,
        "issuedByUserId" integer,
        "previousRegistrationId" bigint,
        "metadata" jsonb,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
      )
    `);
    // Constraint 3. Postgres guarantees it, not the service.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_pos_vehicle_registrations_active_vehicle"
        ON "pos_vehicle_registrations" ("vehicleId")
        WHERE "status" = 'ACTIVE'
    `);
    // Global, not per tenant: the verification URL carries no tenant to
    // disambiguate a collision with.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_pos_vehicle_registrations_verification_code"
        ON "pos_vehicle_registrations" ("verificationCode")
        WHERE "verificationCode" IS NOT NULL
    `);
    // Issuance is idempotent on the checkout that paid for it, so a retried or
    // double-submitted settle cannot mint two registrations or eat two plates.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_pos_vehicle_registrations_checkout"
        ON "pos_vehicle_registrations" ("issuedCheckoutId")
        WHERE "issuedCheckoutId" IS NOT NULL
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_pos_vehicle_registrations_vehicle"
        ON "pos_vehicle_registrations" ("vehicleId", "status")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_pos_vehicle_registrations_owner"
        ON "pos_vehicle_registrations" ("ownerId")
    `);
    // The expiry pipeline: everything falling due in the next N days, by office.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_pos_vehicle_registrations_expiry"
        ON "pos_vehicle_registrations" ("tenantId", "status", "expiresAt")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_pos_vehicle_registrations_branch"
        ON "pos_vehicle_registrations" ("branchId", "issuedAt")
    `);

    // ── Events ─────────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "pos_vehicle_events" (
        "id" BIGSERIAL PRIMARY KEY,
        "tenantId" integer NOT NULL,
        "branchId" integer NOT NULL,
        "vehicleId" bigint NOT NULL,
        "registrationId" bigint,
        "type" character varying(24) NOT NULL,
        "actorUserId" integer,
        "checkoutId" integer,
        "reason" character varying(1024),
        "meta" jsonb,
        "occurredAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_pos_vehicle_events_vehicle"
        ON "pos_vehicle_events" ("vehicleId", "occurredAt")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_pos_vehicle_events_registration"
        ON "pos_vehicle_events" ("registrationId")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_pos_vehicle_events_branch_type"
        ON "pos_vehicle_events" ("branchId", "type", "occurredAt")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Reverse creation order. pg_trgm is left installed: other things may come
    // to rely on it, and dropping a shared extension to undo one table is a
    // worse trade than leaving it.
    await queryRunner.query(`DROP TABLE IF EXISTS "pos_vehicle_events"`);
    await queryRunner.query(
      `DROP TABLE IF EXISTS "pos_vehicle_registrations"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "pos_vehicle_plates"`);
    await queryRunner.query(
      `DROP TABLE IF EXISTS "pos_vehicle_plate_series"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "pos_vehicles"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "pos_vehicle_owners"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "pos_vehicle_classes"`);
  }
}
