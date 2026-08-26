import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Lets a manager strike ONE thing off a market run instead of sending the whole
 * run back.
 *
 * A filed run is fifteen lines a purchaser typed standing in a market. When one
 * of them is wrong — charcoal that was already bought on Monday, a price that
 * reads like a slip of the thumb — the only answers were to reject the lot, and
 * make them retype fourteen good lines to fix one, or to sign off something the
 * branch does not accept. Managers do the second.
 *
 * The line is MARKED, never deleted. A struck line is a thing that happened: it
 * was bought, or it was claimed, and the reason it came off is the part somebody
 * will want in a month. Deleting it would make the largest void of the day the
 * one that left no trace, which is the failure the QSR order void was built to
 * avoid.
 */
export class AddPurchaseRunLineVoid20260826090000
  implements MigrationInterface
{
  name = 'AddPurchaseRunLineVoid20260826090000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "pos_purchase_run_lines"
        ADD COLUMN IF NOT EXISTS "voidedAt" TIMESTAMP,
        ADD COLUMN IF NOT EXISTS "voidedByUserId" integer,
        ADD COLUMN IF NOT EXISTS "voidedByName" character varying(255),
        ADD COLUMN IF NOT EXISTS "voidReason" text
    `);
    // Every total, every price-history read and every stock application asks
    // "is this line still standing", so the index is on that question.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_pos_purchase_run_lines_live"
        ON "pos_purchase_run_lines" ("runId")
        WHERE "voidedAt" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_pos_purchase_run_lines_live"`,
    );
    await queryRunner.query(`
      ALTER TABLE "pos_purchase_run_lines"
        DROP COLUMN IF EXISTS "voidReason",
        DROP COLUMN IF EXISTS "voidedByName",
        DROP COLUMN IF EXISTS "voidedByUserId",
        DROP COLUMN IF EXISTS "voidedAt"
    `);
  }
}
