import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Rooms and their desks, and the room a class sits in. Seats are derived
 * from desks; a class on a mat carries its own count. Additive; no
 * backfill — a school lists its rooms once.
 */
export class AddSchoolRooms20260921000000 implements MigrationInterface {
  name = 'AddSchoolRooms20260921000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "pos_school_rooms" (
        "id" BIGSERIAL PRIMARY KEY,
        "branchId" integer NOT NULL,
        "name" character varying(80) NOT NULL,
        "seating" character varying(8) NOT NULL DEFAULT 'DESK',
        "desks" integer NOT NULL DEFAULT 0,
        "brokenDesks" integer NOT NULL DEFAULT 0,
        "seatsPerDesk" integer NOT NULL DEFAULT 3,
        "matCapacity" integer,
        "note" character varying(300),
        "sortOrder" integer NOT NULL DEFAULT 0,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_pos_school_rooms_branch_name"
        ON "pos_school_rooms" ("branchId", LOWER("name"))
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_pos_school_rooms_branch"
        ON "pos_school_rooms" ("branchId")
    `);
    await queryRunner.query(`
      ALTER TABLE "pos_school_classes"
        ADD COLUMN IF NOT EXISTS "roomId" integer
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "pos_school_classes" DROP COLUMN IF EXISTS "roomId"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "pos_school_rooms"`);
  }
}
