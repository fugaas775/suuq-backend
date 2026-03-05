import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddVendorPostLoginIndexes1772328600000
  implements MigrationInterface
{
  name = 'AddVendorPostLoginIndexes1772328600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'product' AND column_name = 'vendorId'
        ) AND EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'product' AND column_name = 'deleted_at'
        ) AND EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'product' AND column_name = 'createdAt'
        ) THEN
          CREATE INDEX IF NOT EXISTS "idx_product_vendor_deleted_created" ON "product" ("vendorId", "deleted_at", "createdAt" DESC);
        ELSIF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'product' AND column_name = 'vendor_id'
        ) AND EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'product' AND column_name = 'deleted_at'
        ) AND EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'product' AND column_name = 'created_at'
        ) THEN
          CREATE INDEX IF NOT EXISTS "idx_product_vendor_deleted_created" ON "product" ("vendor_id", "deleted_at", "created_at" DESC);
        END IF;
      END
      $$;
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_order_item_product_id" ON "order_item" ("productId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_order_status" ON "order" ("status")`,
    );
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'withdrawals' AND column_name = 'userId'
        ) AND EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'withdrawals' AND column_name = 'createdAt'
        ) THEN
          CREATE INDEX IF NOT EXISTS "idx_withdrawals_user_created_at" ON "withdrawals" ("userId", "createdAt" DESC);
        ELSIF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'withdrawals' AND column_name = 'user_id'
        ) AND EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'withdrawals' AND column_name = 'created_at'
        ) THEN
          CREATE INDEX IF NOT EXISTS "idx_withdrawals_user_created_at" ON "withdrawals" ("user_id", "created_at" DESC);
        END IF;
      END
      $$;
    `);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'payout_log' AND column_name = 'vendorId'
        ) AND EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'payout_log' AND column_name = 'createdAt'
        ) THEN
          CREATE INDEX IF NOT EXISTS "idx_payout_log_vendor_created_at" ON "payout_log" ("vendorId", "createdAt" DESC);
        ELSIF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'payout_log' AND column_name = 'vendor_id'
        ) AND EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'payout_log' AND column_name = 'created_at'
        ) THEN
          CREATE INDEX IF NOT EXISTS "idx_payout_log_vendor_created_at" ON "payout_log" ("vendor_id", "created_at" DESC);
        END IF;
      END
      $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_payout_log_vendor_created_at"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_withdrawals_user_created_at"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_order_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_order_item_product_id"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_product_vendor_deleted_created"`,
    );
  }
}
