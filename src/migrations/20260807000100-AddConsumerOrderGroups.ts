import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The envelope around a multi-shop checkout on suuq-s.com.
 *
 * A register cart belongs to exactly one branch, so a basket holding items from
 * three shops has to become three `pos_suspended_carts` rows — three orders that
 * three counters accept and settle independently. That is right for the
 * merchants and useless for the shopper, who did one checkout and has one thing
 * to follow.
 *
 * These two tables are that one thing, and deliberately hold no fulfilment state:
 * `consumer_order_group_items` points at the cart each seller's order became, and
 * status is always read back from there. A status column here would be a second
 * truth that goes stale the moment staff settle on a till that was offline.
 */
export class AddConsumerOrderGroups20260807000100
  implements MigrationInterface
{
  name = 'AddConsumerOrderGroups20260807000100';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "consumer_order_groups" (
        "id" BIGSERIAL PRIMARY KEY,
        "public_ref" character varying(24) NOT NULL,
        "consumer_name" character varying(128),
        "consumer_phone" character varying(32),
        "customer_user_id" integer,
        "fulfillment_mode" character varying(24) NOT NULL,
        "delivery_address" jsonb,
        "currency" character varying(3) NOT NULL,
        "total" numeric(12,2) NOT NULL DEFAULT 0,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
      )
    `);

    // The code is the only credential on an order placed without an account, so
    // the lookup by it must be a unique index probe, not a scan.
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_consumer_order_groups_public_ref" ` +
        `ON "consumer_order_groups" ("public_ref")`,
    );
    // Partial: most checkouts are by guests, and indexing their NULLs would be
    // most of the table for no reader.
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_consumer_order_groups_customer" ` +
        `ON "consumer_order_groups" ("customer_user_id") ` +
        `WHERE "customer_user_id" IS NOT NULL`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "consumer_order_group_items" (
        "id" BIGSERIAL PRIMARY KEY,
        "group_id" bigint NOT NULL
          REFERENCES "consumer_order_groups"("id") ON DELETE CASCADE,
        "branch_id" integer NOT NULL,
        "suspended_cart_id" bigint NOT NULL,
        "order_ref" character varying(32) NOT NULL,
        "subtotal" numeric(12,2) NOT NULL DEFAULT 0,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
      )
    `);

    // One shop cannot appear twice in one checkout — those items belong in a
    // single order on that shop's till, not two competing ones.
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_consumer_order_group_items_group_branch" ` +
        `ON "consumer_order_group_items" ("group_id", "branch_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_consumer_order_group_items_cart" ` +
        `ON "consumer_order_group_items" ("suspended_cart_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TABLE IF EXISTS "consumer_order_group_items"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "consumer_order_groups"`);
  }
}
