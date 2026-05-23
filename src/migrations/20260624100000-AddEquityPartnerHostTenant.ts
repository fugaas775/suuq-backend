import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddEquityPartnerHostTenant20260624100000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "equity_partners" ADD COLUMN IF NOT EXISTS "hostRetailTenantId" integer`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "equity_partners" DROP COLUMN IF EXISTS "hostRetailTenantId"`,
    );
  }
}
