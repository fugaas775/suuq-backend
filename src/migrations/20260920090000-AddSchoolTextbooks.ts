import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Textbooks — the home-room teacher's other register.
 *
 * Two tables: the titles a class is issued, and one loan row per book per
 * pupil (issued → returned, or lost). Keyed to the pupil's folio id like
 * attendance, and for the same reason: a fee payment rebuilds the folio
 * snapshot, so nothing the cart does not own survives on it. No backfill —
 * a book is in the register because somebody issued it.
 */
export class AddSchoolTextbooks20260920090000 implements MigrationInterface {
  name = 'AddSchoolTextbooks20260920090000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "pos_school_textbook_titles" (
        "id" BIGSERIAL PRIMARY KEY,
        "branchId" integer NOT NULL,
        "classCode" character varying(64) NOT NULL,
        "title" character varying(160) NOT NULL,
        "sortOrder" integer NOT NULL DEFAULT 0,
        "isActive" boolean NOT NULL DEFAULT true,
        "createdByUserId" integer,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_pos_school_textbook_titles_class_title"
        ON "pos_school_textbook_titles" ("branchId", "classCode", LOWER("title"))
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_pos_school_textbook_titles_branch_class"
        ON "pos_school_textbook_titles" ("branchId", "classCode")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "pos_school_textbook_loans" (
        "id" BIGSERIAL PRIMARY KEY,
        "branchId" integer NOT NULL,
        "folioId" integer NOT NULL,
        "classCode" character varying(64) NOT NULL,
        "title" character varying(160) NOT NULL,
        "status" character varying(16) NOT NULL,
        "issuedAt" date NOT NULL,
        "returnedAt" date,
        "note" character varying(200),
        "issuedByUserId" integer,
        "updatedByUserId" integer,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
      )
    `);
    // One row per (pupil, title): a re-issue after a return updates the row.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_pos_school_textbook_loans_folio_title"
        ON "pos_school_textbook_loans" ("branchId", "folioId", LOWER("title"))
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_pos_school_textbook_loans_branch_class"
        ON "pos_school_textbook_loans" ("branchId", "classCode")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_pos_school_textbook_loans_branch_folio"
        ON "pos_school_textbook_loans" ("branchId", "folioId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "pos_school_textbook_loans"`);
    await queryRunner.query(
      `DROP TABLE IF EXISTS "pos_school_textbook_titles"`,
    );
  }
}
