import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProcurementReceiptDiscrepancyWebhookEvents1774101200000
  implements MigrationInterface
{
  name = 'AddProcurementReceiptDiscrepancyWebhookEvents1774101200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "procurement_webhook_deliveries_eventtype_enum" ADD VALUE IF NOT EXISTS 'PROCUREMENT_RECEIPT_DISCREPANCY_RESOLVED'`,
    );
    await queryRunner.query(
      `ALTER TYPE "procurement_webhook_deliveries_eventtype_enum" ADD VALUE IF NOT EXISTS 'PROCUREMENT_RECEIPT_DISCREPANCY_APPROVED'`,
    );
  }

  public async down(): Promise<void> {
    // PostgreSQL enum values cannot be removed safely without recreating the type.
  }
}
