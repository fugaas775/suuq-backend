import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProcurementWebhookRetryState1774100600000
  implements MigrationInterface
{
  name = 'AddProcurementWebhookRetryState1774100600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "procurement_webhook_deliveries" ADD "nextRetryAt" TIMESTAMP`,
    );
    await queryRunner.query(
      `ALTER TABLE "procurement_webhook_deliveries" ADD "finalFailureAt" TIMESTAMP`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_procurement_webhook_deliveries_next_retry" ON "procurement_webhook_deliveries" ("nextRetryAt")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_procurement_webhook_deliveries_next_retry"`,
    );
    await queryRunner.query(
      `ALTER TABLE "procurement_webhook_deliveries" DROP COLUMN "finalFailureAt"`,
    );
    await queryRunner.query(
      `ALTER TABLE "procurement_webhook_deliveries" DROP COLUMN "nextRetryAt"`,
    );
  }
}
