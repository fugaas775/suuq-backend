import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProductTagsJoinTable1748254698600 implements MigrationInterface {
  name = 'AddProductTagsJoinTable1748254698600';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "tag" (
        "id" SERIAL NOT NULL,
        "name" character varying NOT NULL,
        CONSTRAINT "PK_tag_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_tag_name" UNIQUE ("name")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "product_tags_tag" (
        "productId" integer NOT NULL,
        "tagId" integer NOT NULL,
        CONSTRAINT "PK_product_tags_tag" PRIMARY KEY ("productId", "tagId")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_product_tags_tag_productId" ON "product_tags_tag" ("productId")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_product_tags_tag_tagId" ON "product_tags_tag" ("tagId")
    `);

    await queryRunner.query(`
      ALTER TABLE "product_tags_tag"
      ADD CONSTRAINT "FK_product_tags_tag_product"
      FOREIGN KEY ("productId") REFERENCES "product"("id") ON DELETE CASCADE
    `);

    await queryRunner.query(`
      ALTER TABLE "product_tags_tag"
      ADD CONSTRAINT "FK_product_tags_tag_tag"
      FOREIGN KEY ("tagId") REFERENCES "tag"("id") ON DELETE CASCADE
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "product_tags_tag" DROP CONSTRAINT "FK_product_tags_tag_tag"`);
    await queryRunner.query(`ALTER TABLE "product_tags_tag" DROP CONSTRAINT "FK_product_tags_tag_product"`);
    await queryRunner.query(`DROP INDEX "IDX_product_tags_tag_tagId"`);
    await queryRunner.query(`DROP INDEX "IDX_product_tags_tag_productId"`);
    await queryRunner.query(`DROP TABLE "product_tags_tag"`);
    await queryRunner.query(`DROP TABLE "tag"`);
  }
}
