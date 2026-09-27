import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Parents' logins for the SCHOOL format: a guardian row per (school, login)
 * and the pupils that login may read. The login is an ordinary `user` row
 * (posUsername + password, authMode MANUAL) — nothing on `user` changes.
 * Additive; no backfill — the office creates each family's login.
 */
export class AddSchoolGuardians20260927120000 implements MigrationInterface {
  name = 'AddSchoolGuardians20260927120000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "pos_school_guardians" (
        "id" BIGSERIAL PRIMARY KEY,
        "branchId" integer NOT NULL,
        "userId" integer NOT NULL,
        "displayName" character varying(160),
        "phone" character varying(40),
        "relationship" character varying(24),
        "isActive" boolean NOT NULL DEFAULT true,
        "createdByUserId" integer,
        "createdByName" character varying(160),
        "passwordIssuedAt" TIMESTAMP WITH TIME ZONE,
        "lastLoginAt" TIMESTAMP WITH TIME ZONE,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "uq_pos_school_guardians_branch_user" UNIQUE ("branchId", "userId")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_pos_school_guardians_user"
        ON "pos_school_guardians" ("userId")
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "pos_school_guardian_pupils" (
        "id" BIGSERIAL PRIMARY KEY,
        "guardianId" bigint NOT NULL,
        "folioId" integer NOT NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "uq_pos_school_guardian_pupils_guardian_folio" UNIQUE ("guardianId", "folioId")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_pos_school_guardian_pupils_folio"
        ON "pos_school_guardian_pupils" ("folioId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "pos_school_guardian_pupils"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "pos_school_guardians"`);
  }
}
