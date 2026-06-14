import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWebhookTimestampToPaymentLogs1773150600000
  implements MigrationInterface
{
  name = 'AddWebhookTimestampToPaymentLogs1773150600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "payment_logs" ADD "webhookTimestamp" character varying(64)`,
    );
    await queryRunner.query(
      `UPDATE "payment_logs"
       SET "webhookTimestamp" = COALESCE("requestHeaders"->>'x-timestamp', "requestHeaders"->>'X-Timestamp')
       WHERE "webhookTimestamp" IS NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_payment_logs_webhookTimestamp" ON "payment_logs" ("webhookTimestamp")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_payment_logs_webhookTimestamp"`,
    );
    await queryRunner.query(
      `ALTER TABLE "payment_logs" DROP COLUMN "webhookTimestamp"`,
    );
  }
}
