import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * A textbook belongs to a subject, and the subject teacher provides it.
 *
 * Both schools are subject-taught from Grade 1: the Maths teacher hands out
 * the Maths book to every class they take, the English teacher the English
 * book. The title now says which subject it is, so a teacher's register can
 * put their own books first and leave a colleague's alone. Nullable — a
 * title the home room lists for the whole class carries none.
 */
export class AddSchoolTextbookSubject20260920190000
  implements MigrationInterface
{
  name = 'AddSchoolTextbookSubject20260920190000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "pos_school_textbook_titles"
        ADD COLUMN IF NOT EXISTS "subject" character varying(120)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "pos_school_textbook_titles"
        DROP COLUMN IF EXISTS "subject"
    `);
  }
}
