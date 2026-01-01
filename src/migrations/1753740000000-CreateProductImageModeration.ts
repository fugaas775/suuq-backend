import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateProductImageModeration1753740000000
  implements MigrationInterface
{
  name = 'CreateProductImageModeration1753740000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "product_image_moderation" (
        "id" SERIAL PRIMARY KEY,
        "productId" integer NOT NULL,
        "productImageId" integer NOT NULL,
        "imageUrl" text NOT NULL,
        "status" varchar(16) NOT NULL DEFAULT 'pending',
        "labels" jsonb,
        "matchedLabels" text[],
        "topConfidence" real,
        "reason" text,
        "appealMessage" text,
        "appealedAt" timestamptz,
        "reviewedById" integer,
        "reviewedAt" timestamptz,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now()
      );
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_pim_status" ON "product_image_moderation" ("status")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_pim_productId" ON "product_image_moderation" ("productId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_pim_productImageId" ON "product_image_moderation" ("productImageId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_pim_productImageId"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_pim_productId"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_pim_status"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "product_image_moderation"`);
  }
}
