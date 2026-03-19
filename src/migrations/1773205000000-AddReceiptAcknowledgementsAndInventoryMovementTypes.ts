import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddReceiptAcknowledgementsAndInventoryMovementTypes1773205000000
  implements MigrationInterface
{
  name = 'AddReceiptAcknowledgementsAndInventoryMovementTypes1773205000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "stock_movements_movementtype_enum" ADD VALUE IF NOT EXISTS 'TRANSFER'`,
    );
    await queryRunner.query(
      `ALTER TYPE "stock_movements_movementtype_enum" ADD VALUE IF NOT EXISTS 'SALE'`,
    );
    await queryRunner.query(
      `ALTER TYPE "stock_movements_movementtype_enum" ADD VALUE IF NOT EXISTS 'ADJUSTMENT'`,
    );

    await queryRunner.query(
      `ALTER TABLE "purchase_order_receipt_events" ADD COLUMN IF NOT EXISTS "supplierAcknowledgedAt" TIMESTAMP`,
    );
    await queryRunner.query(
      `ALTER TABLE "purchase_order_receipt_events" ADD COLUMN IF NOT EXISTS "supplierAcknowledgedByUserId" integer`,
    );
    await queryRunner.query(
      `ALTER TABLE "purchase_order_receipt_events" ADD COLUMN IF NOT EXISTS "supplierAcknowledgementNote" character varying(500)`,
    );
    await queryRunner.query(
      `ALTER TABLE "purchase_order_receipt_events" ADD COLUMN IF NOT EXISTS "discrepancyStatus" character varying(32)`,
    );
    await queryRunner.query(
      `ALTER TABLE "purchase_order_receipt_events" ADD COLUMN IF NOT EXISTS "discrepancyResolutionNote" text`,
    );
    await queryRunner.query(
      `ALTER TABLE "purchase_order_receipt_events" ADD COLUMN IF NOT EXISTS "discrepancyMetadata" jsonb`,
    );
    await queryRunner.query(
      `ALTER TABLE "purchase_order_receipt_events" ADD COLUMN IF NOT EXISTS "discrepancyResolvedAt" TIMESTAMP`,
    );
    await queryRunner.query(
      `ALTER TABLE "purchase_order_receipt_events" ADD COLUMN IF NOT EXISTS "discrepancyResolvedByUserId" integer`,
    );

    await queryRunner
      .query(
        `ALTER TABLE "purchase_order_receipt_events" ADD CONSTRAINT "FK_purchase_order_receipt_events_supplier_ack_user" FOREIGN KEY ("supplierAcknowledgedByUserId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
      )
      .catch(() => undefined);
    await queryRunner
      .query(
        `ALTER TABLE "purchase_order_receipt_events" ADD CONSTRAINT "FK_purchase_order_receipt_events_discrepancy_resolved_user" FOREIGN KEY ("discrepancyResolvedByUserId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
      )
      .catch(() => undefined);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "purchase_order_receipt_events" DROP CONSTRAINT IF EXISTS "FK_purchase_order_receipt_events_discrepancy_resolved_user"`,
    );
    await queryRunner.query(
      `ALTER TABLE "purchase_order_receipt_events" DROP CONSTRAINT IF EXISTS "FK_purchase_order_receipt_events_supplier_ack_user"`,
    );

    await queryRunner.query(
      `ALTER TABLE "purchase_order_receipt_events" DROP COLUMN IF EXISTS "discrepancyResolvedByUserId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "purchase_order_receipt_events" DROP COLUMN IF EXISTS "discrepancyResolvedAt"`,
    );
    await queryRunner.query(
      `ALTER TABLE "purchase_order_receipt_events" DROP COLUMN IF EXISTS "discrepancyMetadata"`,
    );
    await queryRunner.query(
      `ALTER TABLE "purchase_order_receipt_events" DROP COLUMN IF EXISTS "discrepancyResolutionNote"`,
    );
    await queryRunner.query(
      `ALTER TABLE "purchase_order_receipt_events" DROP COLUMN IF EXISTS "discrepancyStatus"`,
    );
    await queryRunner.query(
      `ALTER TABLE "purchase_order_receipt_events" DROP COLUMN IF EXISTS "supplierAcknowledgementNote"`,
    );
    await queryRunner.query(
      `ALTER TABLE "purchase_order_receipt_events" DROP COLUMN IF EXISTS "supplierAcknowledgedByUserId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "purchase_order_receipt_events" DROP COLUMN IF EXISTS "supplierAcknowledgedAt"`,
    );
  }
}
