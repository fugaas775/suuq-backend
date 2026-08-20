import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Lets a SCHOOL grade hold sections — '3aad A', '3aad B' under '3aad'.
 *
 * A section is a class ROW here, not a second field on the pupil. See
 * {@link SchoolClass.gradeCode} for why; the short version is that a pupil's
 * folio carries one class string and every per-class reader in the system (the
 * attendance register, the mark sheet, rank in class, the tuition line's tag,
 * the roster importer's dedupe) is already per teaching group, which is exactly
 * what a section is.
 *
 * **There is deliberately no backfill.** Both columns null IS an unsectioned
 * class, so every row that exists — SMAK's eleven, SMAG's, and every school
 * that never splits a grade — keeps meaning precisely what it meant before,
 * without being touched. A school splits a grade when it wants to, from the
 * Classes panel, and that operation re-tags its pupils' folios in the same
 * gesture the way a rename already does.
 *
 * The partial unique index is what stops the one mistake this shape allows: two
 * sections called 'A' in one grade. It is partial because unsectioned rows have
 * both columns null, and in Postgres nulls do not collide — without the WHERE
 * the index would be satisfied by anything and enforce nothing worth having.
 */
export class AddSchoolClassSections20260820000000
  implements MigrationInterface
{
  name = 'AddSchoolClassSections20260820000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "pos_school_classes"
        ADD COLUMN IF NOT EXISTS "gradeCode" character varying(64)
    `);
    await queryRunner.query(`
      ALTER TABLE "pos_school_classes"
        ADD COLUMN IF NOT EXISTS "section" character varying(32)
    `);

    // Lowercased, because the grade groups the way the code matches: a school
    // that types 'Grade 3' once and 'grade 3' the next time means one grade.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_pos_school_classes_branch_grade"
        ON "pos_school_classes" ("branchId", LOWER("gradeCode"))
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_pos_school_classes_branch_grade_section"
        ON "pos_school_classes" ("branchId", LOWER("gradeCode"), LOWER("section"))
        WHERE "gradeCode" IS NOT NULL AND "section" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "uq_pos_school_classes_branch_grade_section"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_pos_school_classes_branch_grade"`,
    );
    await queryRunner.query(
      `ALTER TABLE "pos_school_classes" DROP COLUMN IF EXISTS "section"`,
    );
    await queryRunner.query(
      `ALTER TABLE "pos_school_classes" DROP COLUMN IF EXISTS "gradeCode"`,
    );
  }
}
