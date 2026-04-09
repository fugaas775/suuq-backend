import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRetailTenantOnboardingProfile1775215000000
  implements MigrationInterface
{
  name = 'AddRetailTenantOnboardingProfile1775215000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "retail_tenants" ADD COLUMN IF NOT EXISTS "onboardingProfile" jsonb`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "retail_tenants" DROP COLUMN IF EXISTS "onboardingProfile"`,
    );
  }
}
