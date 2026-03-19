import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPurchaseOrderReceiptLineFields1773203000000
  implements MigrationInterface
{
  name = 'AddPurchaseOrderReceiptLineFields1773203000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "purchase_order_items" ADD COLUMN IF NOT EXISTS "shortageQuantity" integer NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE "purchase_order_items" ADD COLUMN IF NOT EXISTS "damagedQuantity" integer NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE "purchase_order_items" ADD COLUMN IF NOT EXISTS "note" text`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "purchase_order_items" DROP COLUMN IF EXISTS "note"`,
    );
    await queryRunner.query(
      `ALTER TABLE "purchase_order_items" DROP COLUMN IF EXISTS "damagedQuantity"`,
    );
    await queryRunner.query(
      `ALTER TABLE "purchase_order_items" DROP COLUMN IF EXISTS "shortageQuantity"`,
    );
  }
}
