import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Gives a SCHOOL branch its weekly period schedule — one document per branch.
 *
 * The first two to use it are SMAQ (#115, KG–Grade 10 in two shifts) and SMAG
 * (#128, Grades 1–9, one shift), whose timetables were drawn up outside the
 * app and had nowhere to live: teachers were an employment row with a job
 * title, and nothing said which room they stood in at 8:00 on Monday.
 *
 * One row holds the bell schedule, the shifts and every lesson as JSON. The
 * week is only ever read whole and written whole (see the entity), and the
 * service refuses a double-booked class or teacher before the row is saved.
 * No backfill: a school without a timetable reads as an empty document.
 */
export class AddSchoolTimetable20260916090000 implements MigrationInterface {
  name = 'AddSchoolTimetable20260916090000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "pos_school_timetables" (
        "id" BIGSERIAL PRIMARY KEY,
        "branchId" integer NOT NULL,
        "title" character varying(255),
        "periods" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "shifts" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "slots" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "notes" text,
        "metadata" jsonb,
        "updatedByUserId" integer,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_pos_school_timetables_branch"
        ON "pos_school_timetables" ("branchId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "pos_school_timetables"`);
  }
}
