import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateEquityPartnerTables20260428000000
  implements MigrationInterface
{
  name = 'CreateEquityPartnerTables20260428000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // equity_partners
    await queryRunner.query(`
      CREATE TYPE "equity_partner_status_enum" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED')
    `);

    await queryRunner.query(`
      CREATE TABLE "equity_partners" (
        "id"               SERIAL PRIMARY KEY,
        "userId"           integer,
        "displayName"      character varying(255) NOT NULL,
        "phone"            character varying(64)  NOT NULL,
        "bankAccountInfo"  jsonb,
        "referralCode"     character varying(16) UNIQUE,
        "status"           "equity_partner_status_enum" NOT NULL DEFAULT 'PENDING',
        "notes"            text,
        "createdAt"        TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt"        TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "fk_equity_partners_user"
          FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE SET NULL
      )
    `);

    // Partial unique index: at most one partner record per user account.
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_equity_partners_userId"
        ON "equity_partners" ("userId")
        WHERE "userId" IS NOT NULL
    `);

    // equity_split_assignments
    await queryRunner.query(`
      CREATE TABLE "equity_split_assignments" (
        "id"               SERIAL PRIMARY KEY,
        "equityPartnerId"  integer NOT NULL,
        "branchId"         integer NOT NULL,
        "retailTenantId"   integer,
        "splitNumerator"   integer NOT NULL DEFAULT 1,
        "splitDenominator" integer NOT NULL DEFAULT 3,
        "assignedAt"       TIMESTAMP NOT NULL DEFAULT now(),
        "activeUntil"      TIMESTAMP,
        CONSTRAINT "fk_equity_assignment_partner"
          FOREIGN KEY ("equityPartnerId") REFERENCES "equity_partners"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_equity_assignment_branch"
          FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_equity_assignment_tenant"
          FOREIGN KEY ("retailTenantId") REFERENCES "retail_tenants"("id") ON DELETE SET NULL
      )
    `);

    // equity_payouts
    await queryRunner.query(`
      CREATE TYPE "equity_payout_status_enum" AS ENUM ('PENDING', 'PAID', 'CANCELLED')
    `);

    await queryRunner.query(`
      CREATE TABLE "equity_payouts" (
        "id"                  SERIAL PRIMARY KEY,
        "equityPartnerId"     integer NOT NULL,
        "branchId"            integer NOT NULL,
        "billingPeriodStart"  TIMESTAMP NOT NULL,
        "billingPeriodEnd"    TIMESTAMP NOT NULL,
        "grossAmount"         numeric(12,2) NOT NULL DEFAULT 1900,
        "splitAmount"         numeric(12,2) NOT NULL DEFAULT 633,
        "currency"            character varying(8) NOT NULL DEFAULT 'ETB',
        "status"              "equity_payout_status_enum" NOT NULL DEFAULT 'PENDING',
        "paidAt"              TIMESTAMP,
        "notes"               text,
        "createdAt"           TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "fk_equity_payout_partner"
          FOREIGN KEY ("equityPartnerId") REFERENCES "equity_partners"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_equity_payout_branch"
          FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "equity_payouts"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "equity_payout_status_enum"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "equity_split_assignments"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "equity_partners"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "equity_partner_status_enum"`);
  }
}
