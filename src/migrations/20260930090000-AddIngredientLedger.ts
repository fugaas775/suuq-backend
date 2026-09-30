import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The ingredient ledger — what a kitchen USES, as distinct from what it buys.
 *
 * A QSR's market run posts its money straight to cost of goods the day it is
 * signed off, so the owner could see what was BOUGHT and never what was USED.
 * "We bought 25 kg of sugar — how much is left, and what did the tea cost us?"
 * had no answer anywhere on the platform.
 *
 * Three tables, deliberately NOT the product inventory:
 *   - `pos_ingredients`           — one row per thing the kitchen keeps: name,
 *                                   unit, on-hand, weighted-average cost.
 *   - `pos_ingredient_movements`  — every change to that on-hand, signed, with
 *                                   the cost it carried and what caused it.
 *   - `pos_product_recipes`       — how much of each ingredient one sold unit
 *                                   of a menu item consumes.
 *
 * Not products because `branch_inventory` counts in whole units (a kilo of
 * sugar drawn down twenty grams at a time cannot be stored), carries no unit
 * and no per-branch cost, and a product row surfaces on the till catalog and
 * the marketplace where "Sugar 25 kg" has no business being.
 *
 * Quantities are numeric(14,4) in the ingredient's OWN unit. Money is 2dp.
 *
 * The partial unique index on the movements is the idempotency guard: a sale
 * that is synced twice, or a run approval that is retried, finds its movement
 * already written and leaves it be.
 */
export class AddIngredientLedger20260930090000 implements MigrationInterface {
  name = 'AddIngredientLedger20260930090000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "pos_ingredients" (
        "id" SERIAL PRIMARY KEY,
        "branchId" integer NOT NULL,
        "name" character varying(120) NOT NULL,
        "unit" character varying(8) NOT NULL,
        "onHand" numeric(14,4) NOT NULL DEFAULT 0,
        "avgUnitCost" numeric(14,4) NOT NULL DEFAULT 0,
        "lowStockThreshold" numeric(14,4),
        "isActive" boolean NOT NULL DEFAULT true,
        "note" text,
        "createdByUserId" integer,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now()
      )
    `);
    // Two "Sugar" rows on one branch is a data-entry slip, never a fact.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_pos_ingredients_branch_name"
        ON "pos_ingredients" ("branchId", lower("name"))
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_pos_ingredients_branch_active"
        ON "pos_ingredients" ("branchId")
        WHERE "isActive"
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "pos_ingredient_movements" (
        "id" SERIAL PRIMARY KEY,
        "branchId" integer NOT NULL,
        "ingredientId" integer NOT NULL
          REFERENCES "pos_ingredients"("id") ON DELETE CASCADE,
        "movementType" character varying(16) NOT NULL,
        "quantityDelta" numeric(14,4) NOT NULL,
        "unitCost" numeric(14,4) NOT NULL DEFAULT 0,
        "costDelta" numeric(14,2) NOT NULL DEFAULT 0,
        "onHandAfter" numeric(14,4) NOT NULL,
        "avgUnitCostAfter" numeric(14,4) NOT NULL,
        "sourceType" character varying(32) NOT NULL,
        "sourceReferenceId" integer,
        "sourceLineRef" character varying(160),
        "productId" integer,
        "reversesMovementId" integer,
        "reversedByMovementId" integer,
        "reason" character varying(32),
        "actorUserId" integer,
        "note" text,
        "occurredAt" TIMESTAMP NOT NULL DEFAULT now(),
        "createdAt" TIMESTAMP NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_pos_ingredient_movements_ingredient_time"
        ON "pos_ingredient_movements" ("ingredientId", "occurredAt")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_pos_ingredient_movements_branch_time"
        ON "pos_ingredient_movements" ("branchId", "occurredAt")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_pos_ingredient_movements_source"
        ON "pos_ingredient_movements" ("sourceType", "sourceReferenceId")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_pos_ingredient_movements_product"
        ON "pos_ingredient_movements" ("productId")
        WHERE "productId" IS NOT NULL
    `);
    // The idempotency guard. A synced-twice sale or a retried approval names
    // the same (ingredient, source, document, line) and is refused by the
    // index rather than counted twice. Manual entries carry no source
    // reference and sit outside it.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_pos_ingredient_movements_source_line"
        ON "pos_ingredient_movements"
          ("ingredientId", "sourceType", "sourceReferenceId", "sourceLineRef")
        WHERE "sourceReferenceId" IS NOT NULL AND "sourceLineRef" IS NOT NULL
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "pos_product_recipes" (
        "id" SERIAL PRIMARY KEY,
        "branchId" integer NOT NULL,
        "productId" integer NOT NULL,
        "ingredientId" integer NOT NULL
          REFERENCES "pos_ingredients"("id") ON DELETE CASCADE,
        "quantity" numeric(14,4) NOT NULL,
        "sortOrder" integer NOT NULL DEFAULT 0,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "uq_pos_product_recipes_line"
          UNIQUE ("branchId", "productId", "ingredientId")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_pos_product_recipes_branch_product"
        ON "pos_product_recipes" ("branchId", "productId")
    `);

    // A market-run line may now feed an ingredient instead of a store product.
    // `stockQuantity` is reused and read in the ingredient's unit.
    await queryRunner.query(`
      ALTER TABLE "pos_purchase_run_lines"
        ADD COLUMN IF NOT EXISTS "ingredientId" integer,
        ADD COLUMN IF NOT EXISTS "ingredientMovementId" integer
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_pos_purchase_run_lines_ingredient"
        ON "pos_purchase_run_lines" ("ingredientId")
        WHERE "ingredientId" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_pos_purchase_run_lines_ingredient"`,
    );
    await queryRunner.query(`
      ALTER TABLE "pos_purchase_run_lines"
        DROP COLUMN IF EXISTS "ingredientMovementId",
        DROP COLUMN IF EXISTS "ingredientId"
    `);
    await queryRunner.query(`DROP TABLE IF EXISTS "pos_product_recipes"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "pos_ingredient_movements"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "pos_ingredients"`);
  }
}
