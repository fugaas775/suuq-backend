import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateProductImpression1756079800000 implements MigrationInterface {
  name = 'CreateProductImpression1756079800000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS "product_impression" ("id" SERIAL PRIMARY KEY, "productId" integer NOT NULL, "sessionKey" varchar(128) NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now())`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_product_impression_session" ON "product_impression" ("productId", "sessionKey")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_product_impression_session"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "product_impression"`);
  }
}
