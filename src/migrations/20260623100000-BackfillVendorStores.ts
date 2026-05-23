import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Backfills VendorStore rows for existing active branches that were created
 * before the auto-provisioning logic was added to createBranchWorkspace().
 *
 * Steps:
 *  1. Insert a VendorStore for every active branch that has no VendorStore yet.
 *  2. Backfill vendor_stores.serviceFormat from branches.serviceFormat.
 *  3. Write the new vendor_stores.id back into branches.vendorStoreId.
 *
 * Safe to re-run (all steps are conditional on IS NULL checks).
 */
export class BackfillVendorStores20260623100000 implements MigrationInterface {
  name = 'BackfillVendorStores20260623100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Insert missing VendorStore rows
    await queryRunner.query(`
      INSERT INTO "vendor_stores" ("ownerUserId", "branchId", "storeName", "isConsumerVisible", "serviceFormat")
      SELECT
        b."ownerId",
        b."id",
        b."name",
        true,
        b."serviceFormat"
      FROM "branches" b
      WHERE b."isActive" = true
        AND b."ownerId" IS NOT NULL
        AND b."vendorStoreId" IS NULL
      ON CONFLICT ("branchId") DO NOTHING
    `);

    // 2. Write vendorStoreId back into branches for rows we just inserted
    await queryRunner.query(`
      UPDATE "branches" b
      SET "vendorStoreId" = vs."id"
      FROM "vendor_stores" vs
      WHERE vs."branchId" = b."id"
        AND b."vendorStoreId" IS NULL
    `);

    // 3. Backfill serviceFormat on any VendorStore rows already existing but missing it
    await queryRunner.query(`
      UPDATE "vendor_stores" vs
      SET "serviceFormat" = b."serviceFormat"
      FROM "branches" b
      WHERE b."id" = vs."branchId"
        AND vs."serviceFormat" IS NULL
        AND b."serviceFormat" IS NOT NULL
    `);
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // Intentionally a no-op: backfilled data is non-destructive and safe to keep.
  }
}
