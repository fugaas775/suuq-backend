import { MigrationInterface, QueryRunner } from 'typeorm';

export class BindPartnerCredentialsToBranches1773207000000
  implements MigrationInterface
{
  name = 'BindPartnerCredentialsToBranches1773207000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "partner_credentials" ADD COLUMN IF NOT EXISTS "branchId" integer`,
    );
    await queryRunner
      .query(
        `ALTER TABLE "partner_credentials" ADD CONSTRAINT "FK_partner_credentials_branch" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
      )
      .catch(() => undefined);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_partner_credentials_branch_type" ON "partner_credentials" ("branchId", "partnerType")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_partner_credentials_branch_type"`,
    );
    await queryRunner.query(
      `ALTER TABLE "partner_credentials" DROP CONSTRAINT IF EXISTS "FK_partner_credentials_branch"`,
    );
    await queryRunner.query(
      `ALTER TABLE "partner_credentials" DROP COLUMN IF EXISTS "branchId"`,
    );
  }
}
