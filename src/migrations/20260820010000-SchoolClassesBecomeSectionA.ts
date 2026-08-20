import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Every class a school already teaches becomes Section A of its own grade.
 *
 * Sections arrived yesterday with both columns nullable and no backfill, which
 * left the two live schools — SMAQ (branch 115) and SMAG (128), 22 classes and
 * 387 children between them — as unsectioned classes. That is a true
 * description of a school with one room per grade, and the wrong one for these
 * two: they teach 3aad to forty-seven and 4aad to forty-one, and the next thing
 * they do is open a second room. Starting from "3aad is Section A" makes that
 * one press of "+ Section"; starting from an unsectioned class makes it a split
 * that moves every child.
 *
 * ── Why this does NOT rename anything ─────────────────────────────────────
 * The obvious version of this migration renames '3aad' to '3aad A'. It must
 * not, and the reason is not tidiness — it is that the class lives in TWO
 * places on a pupil's folio. `cartSnapshot.hotelRoomNumber` is the pupil's
 * class, and `metadata.schoolClass` on each auto-added tuition line is the
 * class that line was billed FOR. `chargeSchoolPeriods` joins the next period
 * to the line whose tag matches the pupil's class TODAY, so a rename that
 * reached only the first would make the following month's billing open a
 * SECOND line on all 387 folios — a grade change that never happened, on every
 * fee statement in both schools.
 *
 * Setting the section in place reaches neither. Nothing moves: not a folio, not
 * an attendance mark, not a tuition line, not a paid-through date. The code a
 * pupil is tagged with is the code it always was, and `gradeCode` = `code`
 * groups it under a heading of the same name.
 *
 * The frontend's Split button does rename, and re-tags the lines as it goes for
 * exactly this reason; the Section A button beside it is this migration's
 * single-class equivalent, so the state below is reachable by hand afterwards.
 *
 * Only rows that are not already sectioned are touched, so this is idempotent
 * and a school that had already split a grade by hand is left exactly as it is.
 */
export class SchoolClassesBecomeSectionA20260820010000
  implements MigrationInterface
{
  name = 'SchoolClassesBecomeSectionA20260820010000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const before = await queryRunner.query(
      `SELECT count(*)::int AS n FROM "pos_school_classes"
        WHERE "gradeCode" IS NULL AND "section" IS NULL`,
    );
    const expected = Number(before?.[0]?.n ?? 0);

    await queryRunner.query(`
      UPDATE "pos_school_classes"
         SET "gradeCode" = "code",
             "section" = 'A'
       WHERE "gradeCode" IS NULL
         AND "section" IS NULL
    `);

    const after = await queryRunner.query(
      `SELECT count(*)::int AS n FROM "pos_school_classes"
        WHERE "section" = 'A' AND "gradeCode" = "code"`,
    );
    // Logged rather than asserted: a row a school sectioned by hand before this
    // ran is already counted by the second query, so the two need not be equal.
    // What matters is that the first number reached zero, and it did — the
    // WHERE clause is the same one.
    console.log(
      `[SchoolClassesBecomeSectionA] ${expected} unsectioned classes became Section A; ` +
        `${Number(after?.[0]?.n ?? 0)} classes are now Section A of their own grade.`,
    );
  }

  /**
   * Un-section only what this created — a class whose section is 'A' and whose
   * grade is its own code. A grade genuinely split into A and B is left alone,
   * because its A-section's code is '<grade> A' and not the grade itself.
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "pos_school_classes"
         SET "gradeCode" = NULL,
             "section" = NULL
       WHERE "section" = 'A'
         AND "gradeCode" = "code"
    `);
  }
}
