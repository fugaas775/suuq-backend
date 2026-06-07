import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePropertyRentalBookingTables20260625000000
  implements MigrationInterface
{
  name = 'CreatePropertyRentalBookingTables20260625000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "pos_property_rental_bookings" (
        "id" BIGSERIAL NOT NULL,
        "branchId" integer NOT NULL,
        "localRef" character varying(255),
        "status" character varying(16) NOT NULL DEFAULT 'OPEN',
        "propertyCode" character varying(64) NOT NULL,
        "propertyId" bigint,
        "renterName" character varying(255),
        "renterPhone" character varying(64),
        "renterEmail" character varying(255),
        "tenantType" character varying(16) NOT NULL DEFAULT 'INDIVIDUAL',
        "renterNationality" character varying(64),
        "idType" character varying(32),
        "idNumber" character varying(128),
        "areaSqm" numeric(10,2),
        "ratePlanId" bigint,
        "reservationId" bigint,
        "leaseStartAt" date,
        "leaseEndAt" date,
        "billingCycle" character varying(8) NOT NULL DEFAULT 'MONTH',
        "periodsBilled" integer NOT NULL DEFAULT 0,
        "currency" character varying(8) NOT NULL DEFAULT 'ETB',
        "depositAmount" numeric(14,2) NOT NULL DEFAULT 0,
        "depositRefund" numeric(14,2),
        "chargesTotal" numeric(14,2) NOT NULL DEFAULT 0,
        "settledCheckoutId" character varying(128),
        "paidAmount" numeric(14,2),
        "voidReason" text,
        "transferredToProperty" character varying(64),
        "idempotencyKey" character varying(255),
        "openedByUserId" integer,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "settledAt" TIMESTAMPTZ,
        "voidedAt" TIMESTAMPTZ,
        CONSTRAINT "PK_pos_property_rental_bookings_id" PRIMARY KEY ("id"),
        CONSTRAINT "uq_pos_property_rental_bookings_idempotency_key" UNIQUE ("idempotencyKey")
      )
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_pos_property_booking_branch_status" ON "pos_property_rental_bookings" ("branchId", "status")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_pos_property_booking_branch_created" ON "pos_property_rental_bookings" ("branchId", "createdAt")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_pos_property_booking_local_ref" ON "pos_property_rental_bookings" ("localRef")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "pos_property_rental_booking_charges" (
        "id" BIGSERIAL NOT NULL,
        "bookingId" bigint NOT NULL,
        "branchId" integer NOT NULL,
        "chargeGroupCode" character varying(64),
        "chargeName" character varying(255) NOT NULL,
        "amount" numeric(14,2) NOT NULL,
        "currency" character varying(8) NOT NULL DEFAULT 'ETB',
        "quantity" integer NOT NULL DEFAULT 1,
        "recurring" boolean NOT NULL DEFAULT false,
        "notes" text,
        "idempotencyKey" character varying(255),
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_pos_property_rental_booking_charges_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_pos_property_rental_booking_charges_booking" FOREIGN KEY ("bookingId") REFERENCES "pos_property_rental_bookings"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_pos_property_charge_booking" ON "pos_property_rental_booking_charges" ("bookingId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_pos_property_charge_branch_created" ON "pos_property_rental_booking_charges" ("branchId", "createdAt")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "uq_pos_property_charge_booking_idempotency" ON "pos_property_rental_booking_charges" ("bookingId", "idempotencyKey") WHERE "idempotencyKey" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TABLE IF EXISTS "pos_property_rental_booking_charges"`,
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS "pos_property_rental_bookings"`,
    );
  }
}
