import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateBranchExpenses20260504000000 implements MigrationInterface {
  name = 'CreateBranchExpenses20260504000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'branch_expense_category_enum') THEN
          CREATE TYPE "branch_expense_category_enum" AS ENUM (
            'RENT', 'UTILITIES', 'PAYROLL', 'SUPPLIES', 'MARKETING',
            'MAINTENANCE', 'TAXES', 'OTHER'
          );
        END IF;
      END$$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "branch_expenses" (
        "id" SERIAL PRIMARY KEY,
        "branchId" integer NOT NULL,
        "category" "branch_expense_category_enum" NOT NULL,
        "amount" decimal(12,2) NOT NULL,
        "currency" varchar(8) NOT NULL DEFAULT 'ETB',
        "occurredAt" timestamp NOT NULL,
        "note" text,
        "recordedByUserId" integer,
        "createdAt" timestamp NOT NULL DEFAULT now(),
        "updatedAt" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "FK_branch_expenses_branch"
          FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_branch_expenses_branch_occurredAt"
        ON "branch_expenses" ("branchId", "occurredAt")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_branch_expenses_branch_occurredAt"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "branch_expenses"`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "branch_expense_category_enum"`,
    );
  }
}
