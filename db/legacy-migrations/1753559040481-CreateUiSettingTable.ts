import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateUiSettingTable1753559040481 implements MigrationInterface {
  name = 'CreateUiSettingTable1753559040481';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "ui_setting" ("id" SERIAL NOT NULL, "key" character varying NOT NULL, "value" jsonb NOT NULL, "description" character varying, CONSTRAINT "UQ_d47106337e84473e79627ca87ce" UNIQUE ("key"), CONSTRAINT "PK_46a8f04233be0284cd7808b17b8" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "user" ALTER COLUMN "roles" SET DEFAULT '{CUSTOMER}'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user" ALTER COLUMN "roles" SET DEFAULT ARRAY['CUSTOMER'`,
    );
    await queryRunner.query(`DROP TABLE "ui_setting"`);
  }
}
