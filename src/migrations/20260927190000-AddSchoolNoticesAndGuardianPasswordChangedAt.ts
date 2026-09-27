import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Parents' portal, second pass: notices from the office to families, and a
 * stamp of when a parent last changed their own password (so the portal can
 * nudge a family still using the password printed on their card). Additive.
 */
export class AddSchoolNoticesAndGuardianPasswordChangedAt20260927190000 implements MigrationInterface {
  name = 'AddSchoolNoticesAndGuardianPasswordChangedAt20260927190000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "pos_school_notices" (
        "id" BIGSERIAL PRIMARY KEY,
        "branchId" integer NOT NULL,
        "title" character varying(200) NOT NULL,
        "body" text NOT NULL,
        "audience" character varying(16) NOT NULL DEFAULT 'ALL',
        "classCodes" text,
        "publishedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "expiresAt" date,
        "isActive" boolean NOT NULL DEFAULT true,
        "createdByUserId" integer,
        "createdByName" character varying(160),
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_pos_school_notices_branch_published"
        ON "pos_school_notices" ("branchId", "publishedAt")
    `);
    await queryRunner.query(`
      ALTER TABLE "pos_school_guardians"
        ADD COLUMN IF NOT EXISTS "passwordChangedAt" TIMESTAMP WITH TIME ZONE
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "pos_school_guardians" DROP COLUMN IF EXISTS "passwordChangedAt"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "pos_school_notices"`);
  }
}
