import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: HOTEL format alignment
 *
 * 1. pos_hotel_folios       — add guest detail columns, rateId, reservationId
 * 2. pos_hotel_rate_plans   — add mealPlan, minimumNights, validFrom, validTo
 * 3. pos_hotel_night_audit_logs — add status column
 */
export class AddHotelFolioGuestFieldsAndRatePlanExtensions20260607000000
  implements MigrationInterface
{
  name = 'AddHotelFolioGuestFieldsAndRatePlanExtensions20260607000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── pos_hotel_folios: guest detail + rate/reservation links ─────────────

    await queryRunner.query(`
      ALTER TABLE "pos_hotel_folios"
        ADD COLUMN IF NOT EXISTS "guestPhone"       character varying(64),
        ADD COLUMN IF NOT EXISTS "guestNationality" character varying(64),
        ADD COLUMN IF NOT EXISTS "guestIdType"      character varying(32),
        ADD COLUMN IF NOT EXISTS "guestIdNumber"    character varying(128),
        ADD COLUMN IF NOT EXISTS "rateId"           bigint,
        ADD COLUMN IF NOT EXISTS "reservationId"    bigint
    `);

    // ── pos_hotel_rate_plans: meal plan, minimum stay, validity window ───────

    await queryRunner.query(`
      ALTER TABLE "pos_hotel_rate_plans"
        ADD COLUMN IF NOT EXISTS "mealPlan"       character varying(32) NOT NULL DEFAULT 'ROOM_ONLY',
        ADD COLUMN IF NOT EXISTS "minimumNights"  integer               NOT NULL DEFAULT 1,
        ADD COLUMN IF NOT EXISTS "validFrom"      date,
        ADD COLUMN IF NOT EXISTS "validTo"        date
    `);

    // ── pos_hotel_night_audit_logs: lifecycle status ─────────────────────────

    await queryRunner.query(`
      ALTER TABLE "pos_hotel_night_audit_logs"
        ADD COLUMN IF NOT EXISTS "status" character varying(16) NOT NULL DEFAULT 'COMPLETED'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "pos_hotel_night_audit_logs"
        DROP COLUMN IF EXISTS "status"
    `);

    await queryRunner.query(`
      ALTER TABLE "pos_hotel_rate_plans"
        DROP COLUMN IF EXISTS "mealPlan",
        DROP COLUMN IF EXISTS "minimumNights",
        DROP COLUMN IF EXISTS "validFrom",
        DROP COLUMN IF EXISTS "validTo"
    `);

    await queryRunner.query(`
      ALTER TABLE "pos_hotel_folios"
        DROP COLUMN IF EXISTS "guestPhone",
        DROP COLUMN IF EXISTS "guestNationality",
        DROP COLUMN IF EXISTS "guestIdType",
        DROP COLUMN IF EXISTS "guestIdNumber",
        DROP COLUMN IF EXISTS "rateId",
        DROP COLUMN IF EXISTS "reservationId"
    `);
  }
}
