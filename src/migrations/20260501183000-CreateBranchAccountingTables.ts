import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateBranchAccountingTables20260501183000
  implements MigrationInterface
{
  name = 'CreateBranchAccountingTables20260501183000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "public"."branch_fixed_assets_category_enum" AS ENUM(
        'EQUIPMENT',
        'FURNITURE',
        'VEHICLE',
        'LEASEHOLD_IMPROVEMENT',
        'TECHNOLOGY',
        'OTHER'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE "public"."branch_fixed_assets_status_enum" AS ENUM('ACTIVE', 'DISPOSED')
    `);
    await queryRunner.query(`
      CREATE TABLE "branch_fixed_assets" (
        "id" SERIAL NOT NULL,
        "branchId" integer NOT NULL,
        "name" character varying(255) NOT NULL,
        "category" "public"."branch_fixed_assets_category_enum" NOT NULL DEFAULT 'OTHER',
        "status" "public"."branch_fixed_assets_status_enum" NOT NULL DEFAULT 'ACTIVE',
        "acquiredAt" TIMESTAMP NOT NULL,
        "disposedAt" TIMESTAMP,
        "capitalizationAmount" numeric(12,2) NOT NULL,
        "salvageValue" numeric(12,2) NOT NULL DEFAULT '0',
        "usefulLifeMonths" integer,
        "currency" character varying(8) NOT NULL DEFAULT 'ETB',
        "note" text,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_branch_fixed_assets_id" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_branch_fixed_assets_branch_acquired" ON "branch_fixed_assets" ("branchId", "acquiredAt")`,
    );
    await queryRunner.query(
      `ALTER TABLE "branch_fixed_assets" ADD CONSTRAINT "FK_branch_fixed_assets_branch" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );

    await queryRunner.query(`
      CREATE TABLE "branch_depreciation_entries" (
        "id" SERIAL NOT NULL,
        "branchId" integer NOT NULL,
        "fixedAssetId" integer NOT NULL,
        "amount" numeric(12,2) NOT NULL,
        "occurredAt" TIMESTAMP NOT NULL,
        "note" text,
        "recordedByUserId" integer,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_branch_depreciation_entries_id" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_branch_depreciation_branch_occurred" ON "branch_depreciation_entries" ("branchId", "occurredAt")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_branch_depreciation_asset_occurred" ON "branch_depreciation_entries" ("fixedAssetId", "occurredAt")`,
    );
    await queryRunner.query(
      `ALTER TABLE "branch_depreciation_entries" ADD CONSTRAINT "FK_branch_depreciation_entries_branch" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "branch_depreciation_entries" ADD CONSTRAINT "FK_branch_depreciation_entries_asset" FOREIGN KEY ("fixedAssetId") REFERENCES "branch_fixed_assets"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );

    await queryRunner.query(`
      CREATE TYPE "public"."branch_accrued_liabilities_category_enum" AS ENUM(
        'PAYROLL',
        'RENT',
        'UTILITIES',
        'TAX',
        'INTEREST',
        'OTHER'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE "public"."branch_accrued_liabilities_status_enum" AS ENUM('OPEN', 'SETTLED')
    `);
    await queryRunner.query(`
      CREATE TABLE "branch_accrued_liabilities" (
        "id" SERIAL NOT NULL,
        "branchId" integer NOT NULL,
        "label" character varying(255) NOT NULL,
        "category" "public"."branch_accrued_liabilities_category_enum" NOT NULL DEFAULT 'OTHER',
        "status" "public"."branch_accrued_liabilities_status_enum" NOT NULL DEFAULT 'OPEN',
        "amount" numeric(12,2) NOT NULL,
        "accruedAt" TIMESTAMP NOT NULL,
        "dueAt" TIMESTAMP,
        "settledAt" TIMESTAMP,
        "currency" character varying(8) NOT NULL DEFAULT 'ETB',
        "note" text,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_branch_accrued_liabilities_id" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_branch_accrued_liabilities_branch_accrued" ON "branch_accrued_liabilities" ("branchId", "accruedAt")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_branch_accrued_liabilities_branch_due" ON "branch_accrued_liabilities" ("branchId", "dueAt")`,
    );
    await queryRunner.query(
      `ALTER TABLE "branch_accrued_liabilities" ADD CONSTRAINT "FK_branch_accrued_liabilities_branch" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );

    await queryRunner.query(`
      CREATE TYPE "public"."branch_long_term_debts_status_enum" AS ENUM('ACTIVE', 'SETTLED')
    `);
    await queryRunner.query(`
      CREATE TABLE "branch_long_term_debts" (
        "id" SERIAL NOT NULL,
        "branchId" integer NOT NULL,
        "lenderName" character varying(255) NOT NULL,
        "status" "public"."branch_long_term_debts_status_enum" NOT NULL DEFAULT 'ACTIVE',
        "principalAmount" numeric(12,2) NOT NULL,
        "outstandingPrincipal" numeric(12,2) NOT NULL,
        "currentPortionAmount" numeric(12,2) NOT NULL DEFAULT '0',
        "interestRate" numeric(6,4),
        "issuedAt" TIMESTAMP NOT NULL,
        "maturityAt" TIMESTAMP,
        "settledAt" TIMESTAMP,
        "currency" character varying(8) NOT NULL DEFAULT 'ETB',
        "note" text,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_branch_long_term_debts_id" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_branch_long_term_debts_branch_issued" ON "branch_long_term_debts" ("branchId", "issuedAt")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_branch_long_term_debts_branch_maturity" ON "branch_long_term_debts" ("branchId", "maturityAt")`,
    );
    await queryRunner.query(
      `ALTER TABLE "branch_long_term_debts" ADD CONSTRAINT "FK_branch_long_term_debts_branch" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "branch_long_term_debts" DROP CONSTRAINT "FK_branch_long_term_debts_branch"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_branch_long_term_debts_branch_maturity"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_branch_long_term_debts_branch_issued"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "branch_long_term_debts"`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."branch_long_term_debts_status_enum"`,
    );

    await queryRunner.query(
      `ALTER TABLE "branch_accrued_liabilities" DROP CONSTRAINT "FK_branch_accrued_liabilities_branch"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_branch_accrued_liabilities_branch_due"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_branch_accrued_liabilities_branch_accrued"`,
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS "branch_accrued_liabilities"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."branch_accrued_liabilities_status_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."branch_accrued_liabilities_category_enum"`,
    );

    await queryRunner.query(
      `ALTER TABLE "branch_depreciation_entries" DROP CONSTRAINT "FK_branch_depreciation_entries_asset"`,
    );
    await queryRunner.query(
      `ALTER TABLE "branch_depreciation_entries" DROP CONSTRAINT "FK_branch_depreciation_entries_branch"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_branch_depreciation_asset_occurred"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_branch_depreciation_branch_occurred"`,
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS "branch_depreciation_entries"`,
    );

    await queryRunner.query(
      `ALTER TABLE "branch_fixed_assets" DROP CONSTRAINT "FK_branch_fixed_assets_branch"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_branch_fixed_assets_branch_acquired"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "branch_fixed_assets"`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."branch_fixed_assets_status_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."branch_fixed_assets_category_enum"`,
    );
  }
}
