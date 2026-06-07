import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePropertyRentalInventory20260625000100
  implements MigrationInterface
{
  name = 'CreatePropertyRentalInventory20260625000100';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── Property units ────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "pos_property_units" (
        "id" BIGSERIAL NOT NULL,
        "branchId" integer NOT NULL,
        "propertyCode" character varying(64) NOT NULL,
        "name" character varying(255) NOT NULL,
        "unitType" character varying(16) NOT NULL DEFAULT 'OTHER',
        "address" character varying(255),
        "capacity" integer,
        "areaSqm" numeric(10,2),
        "status" character varying(16) NOT NULL DEFAULT 'ACTIVE',
        "metadata" jsonb,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_pos_property_units_id" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_pos_property_unit_branch_status" ON "pos_property_units" ("branchId", "status")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "uq_pos_property_unit_branch_code" ON "pos_property_units" ("branchId", "propertyCode")`,
    );

    // ── Rate plans ────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "pos_property_rate_plans" (
        "id" BIGSERIAL NOT NULL,
        "branchId" integer NOT NULL,
        "name" character varying(255) NOT NULL,
        "propertyId" bigint,
        "monthlyRate" numeric(14,2),
        "weeklyRate" numeric(14,2),
        "nightlyRate" numeric(14,2),
        "depositAmount" numeric(14,2),
        "lateFeeAmount" numeric(14,2),
        "currency" character varying(8) NOT NULL DEFAULT 'ETB',
        "taxPercent" numeric(6,2),
        "isActive" boolean NOT NULL DEFAULT true,
        "validFrom" date,
        "validTo" date,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_pos_property_rate_plans_id" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_pos_property_rate_plan_branch" ON "pos_property_rate_plans" ("branchId")`,
    );

    // ── Reservations ──────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "pos_property_reservations" (
        "id" BIGSERIAL NOT NULL,
        "branchId" integer NOT NULL,
        "status" character varying(16) NOT NULL DEFAULT 'HOLD',
        "propertyCode" character varying(64),
        "renterName" character varying(255) NOT NULL,
        "renterPhone" character varying(64),
        "renterEmail" character varying(255),
        "numberOfOccupants" integer,
        "leaseStartAt" date,
        "leaseEndAt" date,
        "ratePlanId" bigint,
        "bookingId" bigint,
        "notes" text,
        "createdByUserId" integer,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_pos_property_reservations_id" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_pos_property_reservation_branch" ON "pos_property_reservations" ("branchId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_pos_property_reservation_branch_status" ON "pos_property_reservations" ("branchId", "status")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_pos_property_reservation_branch_start" ON "pos_property_reservations" ("branchId", "leaseStartAt")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "pos_property_reservations"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "pos_property_rate_plans"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "pos_property_units"`);
  }
}
