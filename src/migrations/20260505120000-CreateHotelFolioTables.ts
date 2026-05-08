import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateHotelFolioTables20260505120000
  implements MigrationInterface
{
  name = 'CreateHotelFolioTables20260505120000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "pos_hotel_folios" (
        "id" BIGSERIAL NOT NULL,
        "branchId" integer NOT NULL,
        "localRef" character varying(255),
        "status" character varying(16) NOT NULL DEFAULT 'OPEN',
        "roomNumber" character varying(64) NOT NULL,
        "guestName" character varying(255),
        "checkInAt" date,
        "checkOutAt" date,
        "currency" character varying(8) NOT NULL DEFAULT 'ETB',
        "chargesTotal" numeric(14,2) NOT NULL DEFAULT 0,
        "settledCheckoutId" character varying(128),
        "paidAmount" numeric(14,2),
        "voidReason" text,
        "transferredToRoom" character varying(64),
        "idempotencyKey" character varying(255),
        "openedByUserId" integer,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "settledAt" TIMESTAMPTZ,
        "voidedAt" TIMESTAMPTZ,
        CONSTRAINT "PK_pos_hotel_folios_id" PRIMARY KEY ("id"),
        CONSTRAINT "uq_pos_hotel_folios_idempotency_key" UNIQUE ("idempotencyKey")
      )
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_pos_hotel_folios_branch_status" ON "pos_hotel_folios" ("branchId", "status")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_pos_hotel_folios_branch_created" ON "pos_hotel_folios" ("branchId", "createdAt")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_pos_hotel_folios_local_ref" ON "pos_hotel_folios" ("localRef")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "pos_hotel_folio_charges" (
        "id" BIGSERIAL NOT NULL,
        "folioId" bigint NOT NULL,
        "branchId" integer NOT NULL,
        "chargeGroupCode" character varying(64),
        "chargeName" character varying(255) NOT NULL,
        "amount" numeric(14,2) NOT NULL,
        "currency" character varying(8) NOT NULL DEFAULT 'ETB',
        "quantity" integer NOT NULL DEFAULT 1,
        "idempotencyKey" character varying(255),
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_pos_hotel_folio_charges_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_pos_hotel_folio_charges_folio" FOREIGN KEY ("folioId") REFERENCES "pos_hotel_folios"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_pos_hotel_folio_charge_folio" ON "pos_hotel_folio_charges" ("folioId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_pos_hotel_folio_charge_branch_created" ON "pos_hotel_folio_charges" ("branchId", "createdAt")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "uq_pos_hotel_folio_charge_folio_idempotency" ON "pos_hotel_folio_charges" ("folioId", "idempotencyKey") WHERE "idempotencyKey" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "pos_hotel_folio_charges"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "pos_hotel_folios"`);
  }
}
