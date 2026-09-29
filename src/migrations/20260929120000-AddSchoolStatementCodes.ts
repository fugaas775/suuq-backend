import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * A verification token per pupil for the printed fee statement — the QR the
 * family scans to see the record as the school's books hold it. Additive.
 */
export class AddSchoolStatementCodes20260929120000
  implements MigrationInterface
{
  name = 'AddSchoolStatementCodes20260929120000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "pos_school_statement_codes" (
        "id" BIGSERIAL PRIMARY KEY,
        "branchId" integer NOT NULL,
        "folioId" integer NOT NULL,
        "code" character varying(16) NOT NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "uq_pos_school_statement_codes_folio" UNIQUE ("folioId"),
        CONSTRAINT "uq_pos_school_statement_codes_code" UNIQUE ("code")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_pos_school_statement_codes_branch"
        ON "pos_school_statement_codes" ("branchId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TABLE IF EXISTS "pos_school_statement_codes"`,
    );
  }
}
