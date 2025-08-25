import { MigrationInterface, QueryRunner } from "typeorm";

export class AddProductViewCount1756079020000 implements MigrationInterface {
  name = 'AddProductViewCount1756079020000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "product" ADD COLUMN IF NOT EXISTS "view_count" integer NOT NULL DEFAULT 0`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "product" DROP COLUMN IF EXISTS "view_count"`);
  }
}
