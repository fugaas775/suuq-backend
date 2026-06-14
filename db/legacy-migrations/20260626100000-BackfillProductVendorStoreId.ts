import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Backfills product.vendor_store_id for existing branch-scoped products so they
 * appear in the consumer branch catalog (GET /consumer/v1/branches/:id/products).
 *
 * Before this change, products imported under a branch context never had their
 * vendor_store_id populated, so branch catalogs returned empty. We derive the
 * branch from stock_movements (the inventory linkage created when a product is
 * seeded to a branch) and copy the branch's vendorStoreId onto the product.
 *
 * Safety:
 *  - Only products currently lacking a vendor_store_id are touched.
 *  - Only products seeded to EXACTLY ONE branch are mapped (a single vendor_store_id
 *    cannot represent multiple branches; ambiguous multi-branch products are skipped).
 *  - The global/home product feeds do NOT filter by vendor_store_id, so this does
 *    not remove any product from the general marketplace — it only ADDS the product
 *    to the matching branch's consumer catalog/storefront.
 *
 * Safe to re-run.
 */
export class BackfillProductVendorStoreId20260626100000
  implements MigrationInterface
{
  name = 'BackfillProductVendorStoreId20260626100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "product" p
      SET "vendor_store_id" = sub.vendor_store_id
      FROM (
        SELECT sm."productId" AS product_id,
               MIN(b."vendorStoreId") AS vendor_store_id
        FROM "stock_movements" sm
        JOIN "branches" b ON b."id" = sm."branchId"
        WHERE b."vendorStoreId" IS NOT NULL
        GROUP BY sm."productId"
        HAVING COUNT(DISTINCT sm."branchId") = 1
      ) sub
      WHERE p."id" = sub.product_id
        AND p."vendor_store_id" IS NULL
    `);
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // Intentionally a no-op: we cannot reliably distinguish backfilled rows from
    // rows that legitimately set vendor_store_id, and the data is non-destructive.
  }
}
