import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Subscription payments made by transfer and verified by an admin against the
 * attached receipt. Additive; nothing to backfill — past Ebirr payments stay in
 * `ebirr_transaction` and are still shown in billing history.
 */
export class CreateSubscriptionPaymentClaims20261121090000
  implements MigrationInterface
{
  name = 'CreateSubscriptionPaymentClaims20261121090000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "subscription_payment_claims" (
        "id" SERIAL PRIMARY KEY,
        "referenceId" character varying(96) NOT NULL,
        "kind" character varying(24) NOT NULL,
        "status" character varying(12) NOT NULL DEFAULT 'SUBMITTED',
        "userId" integer NOT NULL,
        "branchId" integer,
        "tenantId" integer,
        "supplierProfileId" integer,
        "bnplActivationId" integer,
        "subjectName" character varying(160),
        "period" character varying(16),
        "periodMonths" integer,
        "amount" numeric(12,2) NOT NULL,
        "currency" character varying(8) NOT NULL DEFAULT 'ETB',
        "channel" character varying(12) NOT NULL,
        "payerReference" character varying(80) NOT NULL,
        "payerName" character varying(120),
        "receiptUrl" text,
        "reviewedByUserId" integer,
        "reviewedAt" TIMESTAMP WITH TIME ZONE,
        "reviewNote" character varying(500),
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_subscription_payment_claims_reference"
        ON "subscription_payment_claims" ("referenceId")
    `);
    // One bank/wallet transaction can pay for one thing. A rejected claim frees
    // its transaction number so a mistyped one can be submitted again.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_subscription_payment_claims_payer_ref"
        ON "subscription_payment_claims" ("channel", UPPER("payerReference"))
        WHERE "status" <> 'REJECTED'
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_subscription_payment_claims_status"
        ON "subscription_payment_claims" ("status")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_subscription_payment_claims_branch"
        ON "subscription_payment_claims" ("branchId")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_subscription_payment_claims_supplier"
        ON "subscription_payment_claims" ("supplierProfileId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TABLE IF EXISTS "subscription_payment_claims"`,
    );
  }
}
