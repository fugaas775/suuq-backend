import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateEquityPartnerBnplCreditLedger20260501123000
  implements MigrationInterface
{
  name = 'CreateEquityPartnerBnplCreditLedger20260501123000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."equity_partner_bnpl_credit_ledger_entrytype_enum" AS ENUM('CREDIT_APPLIED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "equity_partner_bnpl_credit_ledger" (
        "id" SERIAL NOT NULL,
        "equityPartnerId" integer NOT NULL,
        "bnplActivationId" integer NOT NULL,
        "branchId" integer NOT NULL,
        "targetOwnerUserId" integer NOT NULL,
        "period" character varying(16) NOT NULL,
        "entryType" "public"."equity_partner_bnpl_credit_ledger_entrytype_enum" NOT NULL DEFAULT 'CREDIT_APPLIED',
        "grossAmount" numeric(12,2) NOT NULL,
        "equityCreditAmount" numeric(12,2) NOT NULL,
        "settlementAmountDue" numeric(12,2) NOT NULL,
        "currency" character varying(8) NOT NULL DEFAULT 'ETB',
        "activationStatus" "public"."equity_partner_bnpl_status_enum" NOT NULL DEFAULT 'OUTSTANDING',
        "settlementReferenceId" character varying(128),
        "metadata" jsonb,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_equity_partner_bnpl_credit_ledger_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_equity_partner_bnpl_credit_ledger_activation" UNIQUE ("bnplActivationId")
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_equity_partner_bnpl_credit_ledger_partner_created" ON "equity_partner_bnpl_credit_ledger" ("equityPartnerId", "createdAt")`,
    );
    await queryRunner.query(
      `ALTER TABLE "equity_partner_bnpl_credit_ledger" ADD CONSTRAINT "FK_equity_partner_bnpl_credit_ledger_partner" FOREIGN KEY ("equityPartnerId") REFERENCES "equity_partners"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "equity_partner_bnpl_credit_ledger" ADD CONSTRAINT "FK_equity_partner_bnpl_credit_ledger_activation" FOREIGN KEY ("bnplActivationId") REFERENCES "equity_partner_bnpl_activations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `INSERT INTO "equity_partner_bnpl_credit_ledger" (
        "equityPartnerId",
        "bnplActivationId",
        "branchId",
        "targetOwnerUserId",
        "period",
        "entryType",
        "grossAmount",
        "equityCreditAmount",
        "settlementAmountDue",
        "currency",
        "activationStatus",
        "settlementReferenceId",
        "metadata",
        "createdAt",
        "updatedAt"
      )
      SELECT
        a."equityPartnerId",
        a."id",
        a."branchId",
        a."targetOwnerUserId",
        a."period",
        'CREDIT_APPLIED',
        a."amountDue",
        COALESCE(a."equityCreditAmount", 0),
        COALESCE(a."settlementAmountDue", a."amountDue"),
        a."currency",
        a."status",
        a."settlementReferenceId",
        jsonb_build_object(
          'targetOwnerEmail', a."metadata"->>'targetOwnerEmail',
          'settlementModel', a."metadata"->>'settlementModel'
        ),
        a."createdAt",
        a."updatedAt"
      FROM "equity_partner_bnpl_activations" a
      ON CONFLICT ("bnplActivationId") DO NOTHING`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "equity_partner_bnpl_credit_ledger" DROP CONSTRAINT IF EXISTS "FK_equity_partner_bnpl_credit_ledger_activation"`,
    );
    await queryRunner.query(
      `ALTER TABLE "equity_partner_bnpl_credit_ledger" DROP CONSTRAINT IF EXISTS "FK_equity_partner_bnpl_credit_ledger_partner"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_equity_partner_bnpl_credit_ledger_partner_created"`,
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS "equity_partner_bnpl_credit_ledger"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."equity_partner_bnpl_credit_ledger_entrytype_enum"`,
    );
  }
}
