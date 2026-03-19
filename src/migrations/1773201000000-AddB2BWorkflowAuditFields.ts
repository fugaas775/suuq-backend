import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddB2BWorkflowAuditFields1773201000000
  implements MigrationInterface
{
  name = 'AddB2BWorkflowAuditFields1773201000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "purchase_orders" ADD COLUMN IF NOT EXISTS "submittedAt" TIMESTAMP`,
    );
    await queryRunner.query(
      `ALTER TABLE "purchase_orders" ADD COLUMN IF NOT EXISTS "acknowledgedAt" TIMESTAMP`,
    );
    await queryRunner.query(
      `ALTER TABLE "purchase_orders" ADD COLUMN IF NOT EXISTS "shippedAt" TIMESTAMP`,
    );
    await queryRunner.query(
      `ALTER TABLE "purchase_orders" ADD COLUMN IF NOT EXISTS "receivedAt" TIMESTAMP`,
    );
    await queryRunner.query(
      `ALTER TABLE "purchase_orders" ADD COLUMN IF NOT EXISTS "reconciledAt" TIMESTAMP`,
    );
    await queryRunner.query(
      `ALTER TABLE "purchase_orders" ADD COLUMN IF NOT EXISTS "cancelledAt" TIMESTAMP`,
    );
    await queryRunner.query(
      `ALTER TABLE "purchase_orders" ADD COLUMN IF NOT EXISTS "statusMeta" jsonb DEFAULT '{}'::jsonb`,
    );
    await queryRunner.query(
      `ALTER TABLE "partner_credentials" ADD COLUMN IF NOT EXISTS "revokedAt" TIMESTAMP`,
    );
    await queryRunner.query(
      `ALTER TABLE "partner_credentials" ADD COLUMN IF NOT EXISTS "revokedByUserId" integer`,
    );
    await queryRunner.query(
      `ALTER TABLE "partner_credentials" ADD COLUMN IF NOT EXISTS "revocationReason" character varying(500)`,
    );
    await queryRunner.query(
      `ALTER TABLE "partner_credentials" ADD CONSTRAINT "FK_partner_credentials_revoked_by_user" FOREIGN KEY ("revokedByUserId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "partner_credentials" DROP CONSTRAINT IF EXISTS "FK_partner_credentials_revoked_by_user"`,
    );
    await queryRunner.query(
      `ALTER TABLE "partner_credentials" DROP COLUMN IF EXISTS "revocationReason"`,
    );
    await queryRunner.query(
      `ALTER TABLE "partner_credentials" DROP COLUMN IF EXISTS "revokedByUserId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "partner_credentials" DROP COLUMN IF EXISTS "revokedAt"`,
    );
    await queryRunner.query(
      `ALTER TABLE "purchase_orders" DROP COLUMN IF EXISTS "statusMeta"`,
    );
    await queryRunner.query(
      `ALTER TABLE "purchase_orders" DROP COLUMN IF EXISTS "cancelledAt"`,
    );
    await queryRunner.query(
      `ALTER TABLE "purchase_orders" DROP COLUMN IF EXISTS "reconciledAt"`,
    );
    await queryRunner.query(
      `ALTER TABLE "purchase_orders" DROP COLUMN IF EXISTS "receivedAt"`,
    );
    await queryRunner.query(
      `ALTER TABLE "purchase_orders" DROP COLUMN IF EXISTS "shippedAt"`,
    );
    await queryRunner.query(
      `ALTER TABLE "purchase_orders" DROP COLUMN IF EXISTS "acknowledgedAt"`,
    );
    await queryRunner.query(
      `ALTER TABLE "purchase_orders" DROP COLUMN IF EXISTS "submittedAt"`,
    );
  }
}
