import { MigrationInterface, QueryRunner } from 'typeorm';

export class IncreaseRegistrationCountryLength1772000000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user" ALTER COLUMN "registrationCountry" TYPE character varying(64)`,
    );
    await queryRunner.query(
      `ALTER TABLE "user" ALTER COLUMN "businessType" TYPE character varying(255)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user" ALTER COLUMN "registrationCountry" TYPE character varying(2)`,
    );
    await queryRunner.query(
      `ALTER TABLE "user" ALTER COLUMN "businessType" TYPE character varying(64)`,
    );
  }
}
