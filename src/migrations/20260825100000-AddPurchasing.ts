import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The market run, as a record.
 *
 * A restaurant here restocks by handing somebody cash and sending them to the
 * market. None of that was representable: purchase orders need a supplier with
 * an account on this platform, and the woman selling tomatoes does not have one
 * and never will. So the money left the drawer with no document behind it, the
 * till came up short at close, and the P&L reported a 100% gross margin on food
 * the branch had certainly paid for.
 *
 * Three tables:
 *
 *   pos_purchase_runs       one trip, with what was advanced, spent and returned
 *   pos_purchase_run_lines  what was bought, from whom, at what price
 *   pos_cash_movements      cash through the drawer with no sale behind it
 *
 * The third is deliberately not called `purchase_advances`. Every till in this
 * system computes expected cash as `openingFloat + cash taken`, which is only
 * correct for a drawer nobody takes money out of; a cash drop to the safe, a
 * petty-cash payout and an owner's draw all break it the same way an advance
 * does. The next one of those adds a reason, not a table.
 */
export class AddPurchasing20260825100000 implements MigrationInterface {
  name = 'AddPurchasing20260825100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "public"."pos_purchase_runs_status_enum" AS ENUM
          ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'VOID');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "public"."pos_cash_movements_direction_enum" AS ENUM ('IN', 'OUT');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "public"."pos_cash_movements_reason_enum" AS ENUM
          ('PURCHASE_ADVANCE', 'PURCHASE_CHANGE_RETURN', 'PURCHASE_TOP_UP');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "pos_purchase_runs" (
        "id" SERIAL PRIMARY KEY,
        "branchId" integer NOT NULL REFERENCES "branches"("id") ON DELETE CASCADE,
        "status" "public"."pos_purchase_runs_status_enum" NOT NULL DEFAULT 'DRAFT',
        "label" character varying(160),
        "purchaserUserId" integer,
        "purchaserName" character varying(255),
        "registerSessionId" integer,
        "advanceAmount" numeric(12,2),
        "spentTotal" numeric(12,2) NOT NULL DEFAULT 0,
        "returnedAmount" numeric(12,2),
        "currency" character varying(8) NOT NULL DEFAULT 'ETB',
        "occurredAt" TIMESTAMP NOT NULL,
        "submittedAt" TIMESTAMP,
        "decidedAt" TIMESTAMP,
        "decidedByUserId" integer,
        "decidedByName" character varying(255),
        "decisionReason" text,
        "expenseId" integer,
        "note" text,
        "metadata" jsonb,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_pos_purchase_runs_branch_status"
        ON "pos_purchase_runs" ("branchId", "status")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_pos_purchase_runs_branch_occurred"
        ON "pos_purchase_runs" ("branchId", "occurredAt")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_pos_purchase_runs_purchaser"
        ON "pos_purchase_runs" ("purchaserUserId", "status")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "pos_purchase_run_lines" (
        "id" SERIAL PRIMARY KEY,
        "runId" integer NOT NULL REFERENCES "pos_purchase_runs"("id") ON DELETE CASCADE,
        "branchId" integer NOT NULL,
        "description" character varying(200) NOT NULL,
        "vendorName" character varying(160),
        "quantity" numeric(12,3) NOT NULL DEFAULT 1,
        "unitLabel" character varying(24),
        "unitPrice" numeric(12,2) NOT NULL DEFAULT 0,
        "lineTotal" numeric(12,2) NOT NULL DEFAULT 0,
        "productId" integer,
        "stockQuantity" numeric(12,3),
        "stockMovementId" integer,
        "note" text,
        "sortOrder" integer NOT NULL DEFAULT 0,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_pos_purchase_run_lines_run"
        ON "pos_purchase_run_lines" ("runId")
    `);
    // Price history: "what did we pay for tomatoes last month" is the question
    // this whole record exists to be able to answer, and it is asked per branch
    // by description.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_pos_purchase_run_lines_branch_desc"
        ON "pos_purchase_run_lines" ("branchId", "description")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "pos_cash_movements" (
        "id" SERIAL PRIMARY KEY,
        "branchId" integer NOT NULL REFERENCES "branches"("id") ON DELETE CASCADE,
        "registerSessionId" integer,
        "direction" "public"."pos_cash_movements_direction_enum" NOT NULL,
        "amount" numeric(12,2) NOT NULL,
        "currency" character varying(8) NOT NULL DEFAULT 'ETB',
        "reason" "public"."pos_cash_movements_reason_enum" NOT NULL,
        "sourceType" character varying(32),
        "sourceId" integer,
        "recordedByUserId" integer,
        "recordedByName" character varying(255),
        "occurredAt" TIMESTAMP NOT NULL,
        "note" text,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_pos_cash_movements_session"
        ON "pos_cash_movements" ("registerSessionId")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_pos_cash_movements_branch_occurred"
        ON "pos_cash_movements" ("branchId", "occurredAt")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_pos_cash_movements_source"
        ON "pos_cash_movements" ("sourceType", "sourceId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "pos_cash_movements"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "pos_purchase_run_lines"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "pos_purchase_runs"`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."pos_cash_movements_reason_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."pos_cash_movements_direction_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."pos_purchase_runs_status_enum"`,
    );
  }
}
