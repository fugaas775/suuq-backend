import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddReceiptDiscrepancyApprovalFields1773206000000
  implements MigrationInterface
{
  name = 'AddReceiptDiscrepancyApprovalFields1773206000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "purchase_order_receipt_events" ADD COLUMN IF NOT EXISTS "discrepancyApprovedAt" TIMESTAMP`,
    );
    await queryRunner.query(
      `ALTER TABLE "purchase_order_receipt_events" ADD COLUMN IF NOT EXISTS "discrepancyApprovedByUserId" integer`,
    );
    await queryRunner.query(
      `ALTER TABLE "purchase_order_receipt_events" ADD COLUMN IF NOT EXISTS "discrepancyApprovalNote" text`,
    );
    await queryRunner
      .query(
        `ALTER TABLE "purchase_order_receipt_events" ADD CONSTRAINT "FK_purchase_order_receipt_events_discrepancy_approved_user" FOREIGN KEY ("discrepancyApprovedByUserId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
      )
      .catch(() => undefined);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "purchase_order_receipt_events" DROP CONSTRAINT IF EXISTS "FK_purchase_order_receipt_events_discrepancy_approved_user"`,
    );
    await queryRunner.query(
      `ALTER TABLE "purchase_order_receipt_events" DROP COLUMN IF EXISTS "discrepancyApprovalNote"`,
    );
    await queryRunner.query(
      `ALTER TABLE "purchase_order_receipt_events" DROP COLUMN IF EXISTS "discrepancyApprovedByUserId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "purchase_order_receipt_events" DROP COLUMN IF EXISTS "discrepancyApprovedAt"`,
    );
  }
}
