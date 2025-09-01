import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateNotifications1752759528005 implements MigrationInterface {
  name = 'CreateNotifications1752759528005';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "device_tokens" ("id" SERIAL NOT NULL, "userId" integer NOT NULL, "token" character varying NOT NULL, "platform" character varying NOT NULL DEFAULT 'unknown', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_84700be257607cfb1f9dc2e52c3" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_511957e3e8443429dc3fb00120" ON "device_tokens" ("userId") `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_511957e3e8443429dc3fb00120"`,
    );
    await queryRunner.query(`DROP TABLE "device_tokens"`);
  }
}
