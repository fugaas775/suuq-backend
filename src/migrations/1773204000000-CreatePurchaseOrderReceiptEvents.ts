import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePurchaseOrderReceiptEvents1773204000000
  implements MigrationInterface
{
  name = 'CreatePurchaseOrderReceiptEvents1773204000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "purchase_order_receipt_events" (
        "id" SERIAL NOT NULL,
        "purchaseOrderId" integer NOT NULL,
        "actorUserId" integer,
        "note" text,
        "receiptLines" jsonb NOT NULL,
        "metadata" jsonb,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_purchase_order_receipt_events_id" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `ALTER TABLE "purchase_order_receipt_events" ADD CONSTRAINT "FK_purchase_order_receipt_events_purchase_order" FOREIGN KEY ("purchaseOrderId") REFERENCES "purchase_orders"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "purchase_order_receipt_events" ADD CONSTRAINT "FK_purchase_order_receipt_events_actor" FOREIGN KEY ("actorUserId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "purchase_order_receipt_events" DROP CONSTRAINT IF EXISTS "FK_purchase_order_receipt_events_actor"`,
    );
    await queryRunner.query(
      `ALTER TABLE "purchase_order_receipt_events" DROP CONSTRAINT IF EXISTS "FK_purchase_order_receipt_events_purchase_order"`,
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS "purchase_order_receipt_events"`,
    );
  }
}
