import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateEquityPartnerBnplActivations20260601000000
  implements MigrationInterface
{
  name = 'CreateEquityPartnerBnplActivations20260601000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add per-partner BNPL credit limit (default 5 simultaneous OUTSTANDING).
    await queryRunner.query(`
      ALTER TABLE "equity_partners"
      ADD COLUMN IF NOT EXISTS "bnplCreditLimit" integer NOT NULL DEFAULT 5
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_type WHERE typname = 'equity_partner_bnpl_status_enum'
        ) THEN
          CREATE TYPE "equity_partner_bnpl_status_enum" AS ENUM (
            'OUTSTANDING', 'SETTLED', 'FORGIVEN', 'CANCELLED'
          );
        END IF;
      END$$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "equity_partner_bnpl_activations" (
        "id" SERIAL PRIMARY KEY,
        "equityPartnerId" integer NOT NULL,
        "branchId" integer NOT NULL,
        "tenantSubscriptionId" integer,
        "targetOwnerUserId" integer NOT NULL,
        "period" varchar(16) NOT NULL,
        "amountDue" decimal(12,2) NOT NULL,
        "currency" varchar(8) NOT NULL DEFAULT 'ETB',
        "status" "equity_partner_bnpl_status_enum" NOT NULL DEFAULT 'OUTSTANDING',
        "dueAt" timestamp NOT NULL,
        "settledAt" timestamp,
        "settlementReferenceId" varchar(128),
        "metadata" jsonb,
        "createdAt" timestamp NOT NULL DEFAULT now(),
        "updatedAt" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "FK_equity_bnpl_partner"
          FOREIGN KEY ("equityPartnerId") REFERENCES "equity_partners"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_equity_bnpl_branch"
          FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_equity_bnpl_partner_status"
        ON "equity_partner_bnpl_activations" ("equityPartnerId", "status")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_equity_bnpl_partner_status"`,
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS "equity_partner_bnpl_activations"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "equity_partner_bnpl_status_enum"`,
    );
    await queryRunner.query(
      `ALTER TABLE "equity_partners" DROP COLUMN IF EXISTS "bnplCreditLimit"`,
    );
  }
}
