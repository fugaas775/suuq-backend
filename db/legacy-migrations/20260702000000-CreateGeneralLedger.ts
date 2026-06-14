import { MigrationInterface, QueryRunner } from 'typeorm';
import { GL_ACCOUNT_SEED } from '../accounting/gl-accounts.constant';
import { GlJournalSourceType } from '../accounting/entities/gl-journal-entry.entity';

export class CreateGeneralLedger20260702000000 implements MigrationInterface {
  name = 'CreateGeneralLedger20260702000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── Chart of accounts ────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TYPE "public"."gl_account_type" AS ENUM('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE')
    `);
    await queryRunner.query(`
      CREATE TYPE "public"."gl_normal_balance" AS ENUM('DEBIT', 'CREDIT')
    `);
    await queryRunner.query(`
      CREATE TABLE "gl_accounts" (
        "code" character varying(8) NOT NULL,
        "name" character varying(128) NOT NULL,
        "type" "public"."gl_account_type" NOT NULL,
        "normalBalance" "public"."gl_normal_balance" NOT NULL,
        "isCurrent" boolean,
        "contra" boolean NOT NULL DEFAULT false,
        CONSTRAINT "PK_gl_accounts_code" PRIMARY KEY ("code")
      )
    `);

    // Seed the chart of accounts from the shared constant (single source of truth).
    const values = GL_ACCOUNT_SEED.map((a) => {
      const name = a.name.replace(/'/g, "''");
      const isCurrent =
        a.isCurrent == null ? 'NULL' : a.isCurrent ? 'true' : 'false';
      return `('${a.code}', '${name}', '${a.type}', '${a.normalBalance}', ${isCurrent}, ${a.contra ? 'true' : 'false'})`;
    }).join(',\n        ');
    await queryRunner.query(`
      INSERT INTO "gl_accounts" ("code", "name", "type", "normalBalance", "isCurrent", "contra")
      VALUES
        ${values}
    `);

    // ── Journal entries ──────────────────────────────────────────────────
    const sourceTypes = Object.values(GlJournalSourceType)
      .map((v) => `'${v}'`)
      .join(', ');
    await queryRunner.query(`
      CREATE TYPE "public"."gl_journal_source_type" AS ENUM(${sourceTypes})
    `);
    await queryRunner.query(`
      CREATE TABLE "gl_journal_entries" (
        "id" SERIAL NOT NULL,
        "branchId" integer NOT NULL,
        "occurredAt" TIMESTAMP NOT NULL,
        "postedAt" TIMESTAMP,
        "sourceType" "public"."gl_journal_source_type" NOT NULL,
        "sourceId" character varying(128),
        "idempotencyKey" character varying(255) NOT NULL,
        "currency" character varying(8) NOT NULL DEFAULT 'ETB',
        "memo" character varying(500),
        "reversesEntryId" integer,
        "reversedByEntryId" integer,
        "createdByUserId" integer,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_gl_journal_entries_id" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_gl_journal_entries_branch_idem" ON "gl_journal_entries" ("branchId", "idempotencyKey")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_gl_journal_entries_branch_occurred" ON "gl_journal_entries" ("branchId", "occurredAt")`,
    );

    // ── Journal lines ────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "gl_journal_lines" (
        "id" SERIAL NOT NULL,
        "entryId" integer NOT NULL,
        "branchId" integer NOT NULL,
        "accountCode" character varying(8) NOT NULL,
        "debit" numeric(14,2) NOT NULL DEFAULT '0',
        "credit" numeric(14,2) NOT NULL DEFAULT '0',
        "occurredAt" TIMESTAMP NOT NULL,
        "currency" character varying(8) NOT NULL DEFAULT 'ETB',
        "metadata" jsonb,
        CONSTRAINT "PK_gl_journal_lines_id" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_gl_journal_lines_branch_account_occurred" ON "gl_journal_lines" ("branchId", "accountCode", "occurredAt")`,
    );
    await queryRunner.query(
      `ALTER TABLE "gl_journal_lines" ADD CONSTRAINT "FK_gl_journal_lines_entry" FOREIGN KEY ("entryId") REFERENCES "gl_journal_entries"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "gl_journal_lines" ADD CONSTRAINT "FK_gl_journal_lines_account" FOREIGN KEY ("accountCode") REFERENCES "gl_accounts"("code") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "gl_journal_lines" DROP CONSTRAINT "FK_gl_journal_lines_account"`,
    );
    await queryRunner.query(
      `ALTER TABLE "gl_journal_lines" DROP CONSTRAINT "FK_gl_journal_lines_entry"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_gl_journal_lines_branch_account_occurred"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "gl_journal_lines"`);

    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_gl_journal_entries_branch_occurred"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "UQ_gl_journal_entries_branch_idem"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "gl_journal_entries"`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."gl_journal_source_type"`,
    );

    await queryRunner.query(`DROP TABLE IF EXISTS "gl_accounts"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."gl_normal_balance"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."gl_account_type"`);
  }
}
