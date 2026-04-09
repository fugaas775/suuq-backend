import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePosCheckouts1774106000000 implements MigrationInterface {
  name = 'CreatePosCheckouts1774106000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('pos_checkouts')) {
      return;
    }

    await queryRunner.query(
      `DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_type WHERE typname = 'pos_checkouts_transactiontype_enum'
        ) THEN
          CREATE TYPE "pos_checkouts_transactiontype_enum" AS ENUM ('SALE', 'RETURN');
        END IF;
      END $$`,
    );
    await queryRunner.query(
      `DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_type WHERE typname = 'pos_checkouts_status_enum'
        ) THEN
          CREATE TYPE "pos_checkouts_status_enum" AS ENUM ('RECEIVED', 'PROCESSED', 'FAILED');
        END IF;
      END $$`,
    );
    await queryRunner.query(
      `CREATE TABLE "pos_checkouts" (
        "id" SERIAL NOT NULL,
        "branchId" integer NOT NULL,
        "partnerCredentialId" integer,
        "externalCheckoutId" character varying(255),
        "idempotencyKey" character varying(255),
        "registerId" character varying(128),
        "registerSessionId" character varying(128),
        "receiptNumber" character varying(128),
        "transactionType" "pos_checkouts_transactiontype_enum" NOT NULL,
        "status" "pos_checkouts_status_enum" NOT NULL DEFAULT 'RECEIVED',
        "currency" character varying(3) NOT NULL,
        "subtotal" numeric(12,2) NOT NULL,
        "discountAmount" numeric(12,2) NOT NULL DEFAULT '0',
        "taxAmount" numeric(12,2) NOT NULL DEFAULT '0',
        "total" numeric(12,2) NOT NULL,
        "paidAmount" numeric(12,2) NOT NULL DEFAULT '0',
        "changeDue" numeric(12,2) NOT NULL DEFAULT '0',
        "itemCount" integer NOT NULL DEFAULT 0,
        "occurredAt" TIMESTAMP NOT NULL,
        "processedAt" TIMESTAMP,
        "cashierUserId" integer,
        "cashierName" character varying(255),
        "note" text,
        "failureReason" text,
        "metadata" jsonb,
        "tenders" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "items" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_pos_checkouts_id" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_pos_checkouts_branch_idempotency" ON "pos_checkouts" ("branchId", "idempotencyKey")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_pos_checkouts_branch_external_checkout" ON "pos_checkouts" ("branchId", "externalCheckoutId")`,
    );
    await queryRunner.query(
      `ALTER TABLE "pos_checkouts" ADD CONSTRAINT "FK_pos_checkouts_branch" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "pos_checkouts" ADD CONSTRAINT "FK_pos_checkouts_partner_credential" FOREIGN KEY ("partnerCredentialId") REFERENCES "partner_credentials"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "pos_checkouts" DROP CONSTRAINT IF EXISTS "FK_pos_checkouts_partner_credential"`,
    );
    await queryRunner.query(
      `ALTER TABLE "pos_checkouts" DROP CONSTRAINT IF EXISTS "FK_pos_checkouts_branch"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_pos_checkouts_branch_external_checkout"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_pos_checkouts_branch_idempotency"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "pos_checkouts"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "pos_checkouts_status_enum"`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "pos_checkouts_transactiontype_enum"`,
    );
  }
}
