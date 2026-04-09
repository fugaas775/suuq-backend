import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePosRegisterSessionsAndSuspendedCarts1774107000000
  implements MigrationInterface
{
  name = 'CreatePosRegisterSessionsAndSuspendedCarts1774107000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (
      (await queryRunner.hasTable('pos_register_sessions')) &&
      (await queryRunner.hasTable('pos_suspended_carts'))
    ) {
      return;
    }

    await queryRunner.query(
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'pos_register_sessions_status_enum') THEN CREATE TYPE "pos_register_sessions_status_enum" AS ENUM ('OPEN', 'CLOSED'); END IF; END $$`,
    );
    await queryRunner.query(
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'pos_suspended_carts_status_enum') THEN CREATE TYPE "pos_suspended_carts_status_enum" AS ENUM ('SUSPENDED', 'RESUMED', 'DISCARDED'); END IF; END $$`,
    );
    await queryRunner.query(
      `CREATE TABLE "pos_register_sessions" (
        "id" SERIAL NOT NULL,
        "branchId" integer NOT NULL,
        "registerId" character varying(128) NOT NULL,
        "status" "pos_register_sessions_status_enum" NOT NULL DEFAULT 'OPEN',
        "openedAt" TIMESTAMP NOT NULL,
        "closedAt" TIMESTAMP,
        "openedByUserId" integer,
        "openedByName" character varying(255),
        "closedByUserId" integer,
        "closedByName" character varying(255),
        "note" text,
        "metadata" jsonb,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_pos_register_sessions_id" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_pos_register_sessions_branch_register_status" ON "pos_register_sessions" ("branchId", "registerId", "status")`,
    );
    await queryRunner.query(
      `ALTER TABLE "pos_register_sessions" ADD CONSTRAINT "FK_pos_register_sessions_branch" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `CREATE TABLE "pos_suspended_carts" (
        "id" SERIAL NOT NULL,
        "branchId" integer NOT NULL,
        "registerSessionId" integer,
        "registerId" character varying(128),
        "label" character varying(255) NOT NULL,
        "status" "pos_suspended_carts_status_enum" NOT NULL DEFAULT 'SUSPENDED',
        "currency" character varying(3) NOT NULL,
        "promoCode" character varying(64),
        "itemCount" integer NOT NULL DEFAULT 0,
        "total" numeric(12,2) NOT NULL,
        "note" text,
        "cartSnapshot" jsonb NOT NULL,
        "metadata" jsonb,
        "suspendedByUserId" integer,
        "suspendedByName" character varying(255),
        "resumedAt" TIMESTAMP,
        "resumedByUserId" integer,
        "resumedByName" character varying(255),
        "discardedAt" TIMESTAMP,
        "discardedByUserId" integer,
        "discardedByName" character varying(255),
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_pos_suspended_carts_id" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_pos_suspended_carts_branch_status_register" ON "pos_suspended_carts" ("branchId", "status", "registerId")`,
    );
    await queryRunner.query(
      `ALTER TABLE "pos_suspended_carts" ADD CONSTRAINT "FK_pos_suspended_carts_branch" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "pos_suspended_carts" ADD CONSTRAINT "FK_pos_suspended_carts_register_session" FOREIGN KEY ("registerSessionId") REFERENCES "pos_register_sessions"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "pos_suspended_carts" DROP CONSTRAINT IF EXISTS "FK_pos_suspended_carts_register_session"`,
    );
    await queryRunner.query(
      `ALTER TABLE "pos_suspended_carts" DROP CONSTRAINT IF EXISTS "FK_pos_suspended_carts_branch"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_pos_suspended_carts_branch_status_register"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "pos_suspended_carts"`);
    await queryRunner.query(
      `ALTER TABLE "pos_register_sessions" DROP CONSTRAINT IF EXISTS "FK_pos_register_sessions_branch"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_pos_register_sessions_branch_register_status"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "pos_register_sessions"`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "pos_suspended_carts_status_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "pos_register_sessions_status_enum"`,
    );
  }
}
