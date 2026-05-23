import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateHotelInventory20260621000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── pos_hotel_rooms ──────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "pos_hotel_rooms" (
        "id"            bigserial     PRIMARY KEY,
        "branchId"      int           NOT NULL,
        "roomNumber"    varchar(64)   NOT NULL,
        "roomType"      varchar(64),
        "floor"         int,
        "maxOccupancy"  int           DEFAULT 2,
        "description"   text,
        "status"        varchar(16)   NOT NULL DEFAULT 'ACTIVE',
        "metadata"      jsonb,
        "createdAt"     timestamptz   NOT NULL DEFAULT now(),
        "updatedAt"     timestamptz   NOT NULL DEFAULT now(),
        CONSTRAINT "uq_pos_hotel_rooms_branch_number" UNIQUE ("branchId", "roomNumber")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_pos_hotel_rooms_branch"
        ON "pos_hotel_rooms" ("branchId")
    `);

    // ── pos_hotel_rate_plans ─────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "pos_hotel_rate_plans" (
        "id"                   bigserial       PRIMARY KEY,
        "branchId"             int             NOT NULL,
        "name"                 varchar(255)    NOT NULL,
        "roomType"             varchar(64),
        "weekdayRate"          numeric(14,2)   NOT NULL,
        "weekendRate"          numeric(14,2),
        "currency"             varchar(8)      NOT NULL DEFAULT 'ETB',
        "taxPercent"           numeric(6,2),
        "serviceChargePercent" numeric(6,2),
        "isActive"             boolean         NOT NULL DEFAULT true,
        "createdAt"            timestamptz     NOT NULL DEFAULT now(),
        "updatedAt"            timestamptz     NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_pos_hotel_rate_plans_branch"
        ON "pos_hotel_rate_plans" ("branchId")
    `);

    // ── pos_hotel_reservations ───────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "pos_hotel_reservations" (
        "id"                bigserial     PRIMARY KEY,
        "branchId"          int           NOT NULL,
        "status"            varchar(24)   NOT NULL DEFAULT 'CONFIRMED',
        "roomNumber"        varchar(64),
        "roomType"          varchar(64),
        "guestName"         varchar(255)  NOT NULL,
        "guestPhone"        varchar(64),
        "guestEmail"        varchar(255),
        "guestNationality"  varchar(64),
        "guestIdType"       varchar(32),
        "guestIdNumber"     varchar(128),
        "numberOfGuests"    int           DEFAULT 1,
        "checkInAt"         date          NOT NULL,
        "checkOutAt"        date          NOT NULL,
        "ratePlanId"        bigint,
        "folioId"           bigint,
        "notes"             text,
        "createdByUserId"   int,
        "createdAt"         timestamptz   NOT NULL DEFAULT now(),
        "updatedAt"         timestamptz   NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_pos_hotel_res_branch"
        ON "pos_hotel_reservations" ("branchId")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_pos_hotel_res_branch_status"
        ON "pos_hotel_reservations" ("branchId", "status")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_pos_hotel_res_checkin"
        ON "pos_hotel_reservations" ("branchId", "checkInAt")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "pos_hotel_reservations"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "pos_hotel_rate_plans"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "pos_hotel_rooms"`);
  }
}
