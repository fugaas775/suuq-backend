import { MigrationInterface, QueryRunner } from 'typeorm';

export class ExtendVendorStoreSchema20260623000000
  implements MigrationInterface
{
  name = 'ExtendVendorStoreSchema20260623000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // serviceFormat: mirrors branches.serviceFormat for fast consumer queries
    await queryRunner.query(`
      ALTER TABLE "vendor_stores"
        ADD COLUMN IF NOT EXISTS "serviceFormat" character varying(32)
    `);

    // coverImageUrl: CDN path for the consumer-facing store cover photo
    await queryRunner.query(`
      ALTER TABLE "vendor_stores"
        ADD COLUMN IF NOT EXISTS "coverImageUrl" character varying(512)
    `);

    // operatingHours: JSONB keyed by day (MON..SUN), each value has open/close or closed:true
    await queryRunner.query(`
      ALTER TABLE "vendor_stores"
        ADD COLUMN IF NOT EXISTS "operatingHours" jsonb
    `);

    // Index on serviceFormat for consumer-facing list queries
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_vendor_stores_service_format"
        ON "vendor_stores" ("serviceFormat")
    `);

    // Composite index for the common listing query: visible stores by city (via join)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_vendor_stores_visible"
        ON "vendor_stores" ("isConsumerVisible")
        WHERE "isConsumerVisible" = true
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_vendor_stores_visible"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_vendor_stores_service_format"`,
    );
    await queryRunner.query(
      `ALTER TABLE "vendor_stores" DROP COLUMN IF EXISTS "operatingHours"`,
    );
    await queryRunner.query(
      `ALTER TABLE "vendor_stores" DROP COLUMN IF EXISTS "coverImageUrl"`,
    );
    await queryRunner.query(
      `ALTER TABLE "vendor_stores" DROP COLUMN IF EXISTS "serviceFormat"`,
    );
  }
}
