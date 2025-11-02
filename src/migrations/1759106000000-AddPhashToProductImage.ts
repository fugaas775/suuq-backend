import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPhashToProductImage1759106000000 implements MigrationInterface {
  name = 'AddPhashToProductImage1759106000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "product_image" ADD COLUMN IF NOT EXISTS "phash" varchar(64)`);
    await queryRunner.query(`ALTER TABLE "product_image" ADD COLUMN IF NOT EXISTS "phashAlgo" varchar(16)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_product_image_phash" ON "product_image" ("phash")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_product_image_phash"`);
    await queryRunner.query(`ALTER TABLE "product_image" DROP COLUMN IF EXISTS "phashAlgo"`);
    await queryRunner.query(`ALTER TABLE "product_image" DROP COLUMN IF EXISTS "phash"`);
  }
}
