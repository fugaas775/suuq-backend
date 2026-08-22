import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Gives a branch its own kitchen stations, so an order can print one ticket per
 * prep area instead of one piece of paper somebody has to carry around the shop.
 *
 * The station already existed as a hard-coded ten-member list in the frontend —
 * GRILL, HOT_LINE, GARDE_MANGER, SAUTE, EXPO, PASTRY… — which was tolerable
 * while it only filtered an on-screen kitchen display for CAFETERIA. It stops
 * being tolerable the moment that name is PRINTED ON PAPER a cook reads: a
 * fast-food shop here has a grill and a juice counter, not a garde manger.
 *
 * The category -> station routing rides on `metadata.categories` rather than a
 * table of its own. The till needs stations and routing in the same breath (it
 * needs both to split one order's slip), so one row answering both questions is
 * one fewer thing that can be stale relative to the other.
 *
 * No backfill. Every existing branch starts with zero stations, which is exactly
 * the state the frontend treats as "print the single slip you have always
 * printed" — so this migration changes nothing until a shop configures it.
 */
export class AddKitchenStationRegistry20260822120000
  implements MigrationInterface
{
  name = 'AddKitchenStationRegistry20260822120000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "pos_kitchen_stations" (
        "id" BIGSERIAL PRIMARY KEY,
        "branchId" integer NOT NULL,
        "code" character varying(64) NOT NULL,
        "name" character varying(128),
        "sortOrder" integer NOT NULL DEFAULT 0,
        "status" character varying(16) NOT NULL DEFAULT 'ACTIVE',
        "metadata" jsonb,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_pos_kitchen_stations_branch_status"
        ON "pos_kitchen_stations" ("branchId", "status")
    `);

    // Case-insensitive, because every reader keys on the uppercased code: the
    // routing map, the line resolver and the ticket header. "Grill" beside
    // "GRILL" would be two tickets for one pass.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_pos_kitchen_stations_branch_code"
        ON "pos_kitchen_stations" ("branchId", LOWER("code"))
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "pos_kitchen_stations"`);
  }
}
