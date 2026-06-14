import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePaymentLogs1773150000000 implements MigrationInterface {
  name = 'CreatePaymentLogs1773150000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "payment_logs" (
        "id" SERIAL NOT NULL,
        "provider" character varying(32) NOT NULL,
        "channel" character varying(32) NOT NULL,
        "orderId" character varying(64),
        "eventType" character varying(64),
        "processingStatus" character varying(64),
        "signatureValid" boolean,
        "requestHeaders" jsonb,
        "rawPayload" jsonb,
        "processingMeta" jsonb,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_payment_logs_id" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_payment_logs_provider_createdAt" ON "payment_logs" ("provider", "createdAt")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_payment_logs_orderId" ON "payment_logs" ("orderId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_payment_logs_orderId"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_payment_logs_provider_createdAt"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "payment_logs"`);
  }
}
