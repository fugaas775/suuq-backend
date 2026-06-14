import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateBranchTransfers1773303000000 implements MigrationInterface {
  name = 'CreateBranchTransfers1773303000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "branch_transfers_status_enum" AS ENUM ('REQUESTED', 'DISPATCHED', 'RECEIVED', 'CANCELLED')`,
    );
    await queryRunner.query(`
      CREATE TABLE "branch_transfers" (
        "id" SERIAL NOT NULL,
        "transferNumber" character varying(64) NOT NULL,
        "fromBranchId" integer NOT NULL,
        "toBranchId" integer NOT NULL,
        "status" "branch_transfers_status_enum" NOT NULL DEFAULT 'REQUESTED',
        "note" text,
        "sourceType" character varying(64),
        "sourceReferenceId" integer,
        "sourceEntryIndex" integer,
        "requestedByUserId" integer,
        "requestedAt" TIMESTAMP,
        "dispatchedByUserId" integer,
        "dispatchedAt" TIMESTAMP,
        "receivedByUserId" integer,
        "receivedAt" TIMESTAMP,
        "cancelledByUserId" integer,
        "cancelledAt" TIMESTAMP,
        "statusMeta" jsonb DEFAULT '{}'::jsonb,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_branch_transfers_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_branch_transfers_transfer_number" UNIQUE ("transferNumber")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_branch_transfers_status_created_at" ON "branch_transfers" ("status", "createdAt")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_branch_transfers_source_reference" ON "branch_transfers" ("sourceType", "sourceReferenceId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_branch_transfers_from_branch" ON "branch_transfers" ("fromBranchId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_branch_transfers_to_branch" ON "branch_transfers" ("toBranchId")`,
    );
    await queryRunner.query(
      `ALTER TABLE "branch_transfers" ADD CONSTRAINT "FK_branch_transfers_from_branch" FOREIGN KEY ("fromBranchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "branch_transfers" ADD CONSTRAINT "FK_branch_transfers_to_branch" FOREIGN KEY ("toBranchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(`
      CREATE TABLE "branch_transfer_items" (
        "id" SERIAL NOT NULL,
        "transferId" integer NOT NULL,
        "productId" integer NOT NULL,
        "quantity" integer NOT NULL,
        "note" text,
        CONSTRAINT "PK_branch_transfer_items_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_branch_transfer_items_transfer_product" UNIQUE ("transferId", "productId")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_branch_transfer_items_transfer_product" ON "branch_transfer_items" ("transferId", "productId")`,
    );
    await queryRunner.query(
      `ALTER TABLE "branch_transfer_items" ADD CONSTRAINT "FK_branch_transfer_items_transfer" FOREIGN KEY ("transferId") REFERENCES "branch_transfers"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "branch_transfer_items" ADD CONSTRAINT "FK_branch_transfer_items_product" FOREIGN KEY ("productId") REFERENCES "product"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "branch_transfer_items" DROP CONSTRAINT IF EXISTS "FK_branch_transfer_items_product"`,
    );
    await queryRunner.query(
      `ALTER TABLE "branch_transfer_items" DROP CONSTRAINT IF EXISTS "FK_branch_transfer_items_transfer"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_branch_transfer_items_transfer_product"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "branch_transfer_items"`);
    await queryRunner.query(
      `ALTER TABLE "branch_transfers" DROP CONSTRAINT IF EXISTS "FK_branch_transfers_to_branch"`,
    );
    await queryRunner.query(
      `ALTER TABLE "branch_transfers" DROP CONSTRAINT IF EXISTS "FK_branch_transfers_from_branch"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_branch_transfers_source_reference"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_branch_transfers_to_branch"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_branch_transfers_from_branch"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_branch_transfers_status_created_at"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "branch_transfers"`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "branch_transfers_status_enum"`,
    );
  }
}
