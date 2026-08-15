import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Gives SCHOOL the class registry it never had.
 *
 * Until now a school's classes were a comma-separated string in
 * `product.attributes.hotelRooms` — the quick-setup field HOTEL uses for rooms.
 * HOTEL has `pos_hotel_rooms` and PROPERTY_RENTAL has `pos_property_units`;
 * SCHOOL was the one board format that never graduated from the attribute, and
 * it produced faults no UI could fix: any product could declare a class, two
 * products claiming the same code let catalog order decide its fee, a class
 * could not exist before it had been priced, and a rename was a substring edit
 * that silently orphaned every folio pointing at the old code.
 *
 * The fee deliberately stays on a product, referenced by `feeProductId`.
 * `PosCheckoutService` re-prices every line from the product it names, so a fee
 * held anywhere else would show one figure on the board and charge another on
 * the receipt.
 *
 * The backfill reads every SCHOOL branch's existing declarations and turns each
 * distinct code into a row pointing at the product that declared it, so a school
 * already running keeps exactly the classes and fees it had. Where two products
 * claimed one code, the LOWEST product id wins — arbitrary, but deterministic,
 * which is strictly better than the last-wins catalog-order lookup it replaces,
 * and the Seller HQ editor now shows the link so it can be corrected once rather
 * than being re-decided on every page load.
 */
export class AddSchoolClassRegistry20260815000000
  implements MigrationInterface
{
  name = 'AddSchoolClassRegistry20260815000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "pos_school_classes" (
        "id" BIGSERIAL PRIMARY KEY,
        "branchId" integer NOT NULL,
        "code" character varying(64) NOT NULL,
        "name" character varying(255),
        "sortOrder" integer NOT NULL DEFAULT 0,
        "feeProductId" integer,
        "capacity" integer,
        "status" character varying(16) NOT NULL DEFAULT 'ACTIVE',
        "metadata" jsonb,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_pos_school_classes_branch_status"
        ON "pos_school_classes" ("branchId", "status")
    `);

    // Case-insensitive, because every reader keys on the lowercased code: the
    // folio's class, the tuition line's tag and the roster importer's dedupe.
    // "3A" beside "3a" would be two classes on the board and one set of pupils.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_pos_school_classes_branch_code"
        ON "pos_school_classes" ("branchId", LOWER("code"))
    `);

    await queryRunner.query(`
      INSERT INTO "pos_school_classes" ("branchId", "code", "feeProductId", "sortOrder")
      SELECT branch_id, code, product_id, sort_order
      FROM (
        SELECT DISTINCT ON (link.branch_id, LOWER(declared.code))
               link.branch_id,
               btrim(declared.code) AS code,
               p."id"               AS product_id,
               (row_number() OVER (
                  PARTITION BY link.branch_id
                  ORDER BY LOWER(btrim(declared.code))
               )) * 10 AS sort_order
        FROM "branches" b
        JOIN (
          SELECT bi."branchId" AS branch_id, bi."productId" AS product_id
            FROM "branch_inventory" bi
          UNION
          SELECT l."branchId", l."productId"
            FROM "branch_catalog_product_links" l
        ) link ON link.branch_id = b."id"
        JOIN "product" p ON p."id" = link.product_id
        CROSS JOIN LATERAL unnest(
          string_to_array(COALESCE(p."attributes"->>'hotelRooms', ''), ',')
        ) AS declared(code)
        WHERE b."serviceFormat" = 'SCHOOL'
          AND btrim(COALESCE(declared.code, '')) <> ''
        ORDER BY link.branch_id, LOWER(declared.code), p."id"
      ) seeded
      ON CONFLICT DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "pos_school_classes"`);
  }
}
