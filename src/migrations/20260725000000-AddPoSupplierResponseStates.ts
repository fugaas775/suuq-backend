import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Extends the buyer↔supplier purchase-order lifecycle so a supplier can respond
 * to an order beyond plain acknowledge/dispatch:
 *
 *  - DECLINED          supplier rejects the order outright (terminal).
 *  - CHANGES_PROPOSED  supplier counter-offers amended quantities/prices/date;
 *                      buyer accepts (→ ACKNOWLEDGED) or rejects (→ CANCELLED).
 *  - PARTIALLY_SHIPPED supplier shipped part of the order; the rest is still
 *                      outstanding. The per-line cumulative shipped quantity is
 *                      tracked by the new purchase_order_items.shippedQuantity.
 *
 * Decline reason + counter-offer proposed lines live in purchase_orders.statusMeta
 * (jsonb) — transient negotiation data, not new columns. Only the cumulative
 * shipped quantity needs a real column (queried/summed to decide partial-vs-full
 * and to drive the buyer's shipped progress).
 *
 * Postgres note: `ALTER TYPE ... ADD VALUE` is supported inside a transaction on
 * PG 12+ (this project's migrations run in TypeORM's default 'all' transaction
 * mode); the new values are NOT used by any migration in the same transaction —
 * only at runtime after deploy — so the "can't use a new enum value in the same
 * transaction" restriction does not apply here. `IF NOT EXISTS` keeps it
 * idempotent. (Requires PG ≥ 12; the production database is well past that.)
 *
 * Mirrored into db/baseline/schema.sql so fresh environments bootstrap with the
 * same enum values and column (the B2B tables have no incremental CREATE
 * migration — see BaselineSchema).
 */
export class AddPoSupplierResponseStates20260725000000
  implements MigrationInterface
{
  name = 'AddPoSupplierResponseStates20260725000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."purchase_orders_status_enum" ADD VALUE IF NOT EXISTS 'CHANGES_PROPOSED'`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."purchase_orders_status_enum" ADD VALUE IF NOT EXISTS 'PARTIALLY_SHIPPED'`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."purchase_orders_status_enum" ADD VALUE IF NOT EXISTS 'DECLINED'`,
    );
    await queryRunner.query(
      `ALTER TABLE "purchase_order_items" ADD COLUMN IF NOT EXISTS "shippedQuantity" integer NOT NULL DEFAULT 0`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Enum value removal is unsupported by Postgres without recreating the type;
    // leaving the (now-unused) values in place is the safe, reversible-enough
    // path. Only the additive column is dropped.
    await queryRunner.query(
      `ALTER TABLE "purchase_order_items" DROP COLUMN IF EXISTS "shippedQuantity"`,
    );
  }
}
