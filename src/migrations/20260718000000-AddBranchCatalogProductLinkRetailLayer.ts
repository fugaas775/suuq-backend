import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Turns branch_catalog_product_links into the per-branch retail/listing layer so a
 * supplier's received goods can become a sellable, priced, consumer-listable branch
 * product without mutating the shared, supplier-owned Product row.
 *
 *  - retail_price / retail_sale_price: per-branch price overrides
 *    (effective price = COALESCE(retail_price, product.price)).
 *  - consumer_visible: whether the linked product is listed to consumers on suuq_s
 *    for this branch. Decouples "on my shelf" (link exists → sellable at counter)
 *    from "listed online".
 *  - source / source_supplier_profile_id / source_purchase_order_id: provenance for
 *    links auto-staged from a received purchase order.
 *
 * Backward compatibility: existing links keep their current consumer visibility by
 * backfilling consumer_visible = (product.status = 'publish'); retail_price stays NULL
 * so the COALESCE falls back to product.price (unchanged behaviour).
 */
export class AddBranchCatalogProductLinkRetailLayer20260718000000
  implements MigrationInterface
{
  name = 'AddBranchCatalogProductLinkRetailLayer20260718000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "branch_catalog_product_links" ADD COLUMN IF NOT EXISTS "retail_price" numeric(12,2)`,
    );
    await queryRunner.query(
      `ALTER TABLE "branch_catalog_product_links" ADD COLUMN IF NOT EXISTS "retail_sale_price" numeric(12,2)`,
    );
    await queryRunner.query(
      `ALTER TABLE "branch_catalog_product_links" ADD COLUMN IF NOT EXISTS "consumer_visible" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE "branch_catalog_product_links" ADD COLUMN IF NOT EXISTS "source" character varying(32) NOT NULL DEFAULT 'MANUAL'`,
    );
    await queryRunner.query(
      `ALTER TABLE "branch_catalog_product_links" ADD COLUMN IF NOT EXISTS "source_supplier_profile_id" integer`,
    );
    await queryRunner.query(
      `ALTER TABLE "branch_catalog_product_links" ADD COLUMN IF NOT EXISTS "source_purchase_order_id" integer`,
    );

    // Preserve current behaviour: products that are presently consumer-visible
    // (published + linked) stay visible after the gate moves to consumer_visible.
    await queryRunner.query(
      `UPDATE "branch_catalog_product_links" AS bcl
         SET "consumer_visible" = true
        FROM "product" AS p
       WHERE p.id = bcl."productId"
         AND p.status = 'publish'
         AND p.deleted_at IS NULL`,
    );

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_bcpl_source_supplier"
         ON "branch_catalog_product_links" ("source_supplier_profile_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_bcpl_source_supplier"`);
    await queryRunner.query(
      `ALTER TABLE "branch_catalog_product_links" DROP COLUMN IF EXISTS "source_purchase_order_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "branch_catalog_product_links" DROP COLUMN IF EXISTS "source_supplier_profile_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "branch_catalog_product_links" DROP COLUMN IF EXISTS "source"`,
    );
    await queryRunner.query(
      `ALTER TABLE "branch_catalog_product_links" DROP COLUMN IF EXISTS "consumer_visible"`,
    );
    await queryRunner.query(
      `ALTER TABLE "branch_catalog_product_links" DROP COLUMN IF EXISTS "retail_sale_price"`,
    );
    await queryRunner.query(
      `ALTER TABLE "branch_catalog_product_links" DROP COLUMN IF EXISTS "retail_price"`,
    );
  }
}
