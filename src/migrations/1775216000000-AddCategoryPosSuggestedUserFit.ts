import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCategoryPosSuggestedUserFit1775216000000
  implements MigrationInterface
{
  name = 'AddCategoryPosSuggestedUserFit1775216000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "category" ADD COLUMN "posSuggestedUserFit" character varying',
    );

    await queryRunner.query(`
      UPDATE "category"
      SET "posSuggestedUserFit" = CASE
        WHEN lower(coalesce("slug", '')) LIKE '%cafeteria%'
          OR lower(coalesce("slug", '')) LIKE '%cafe%'
          OR lower(coalesce("slug", '')) LIKE '%bakery%'
          OR lower(coalesce("slug", '')) LIKE '%juice%'
          OR lower(coalesce("slug", '')) LIKE '%takeaway%'
          OR lower(coalesce("slug", '')) LIKE '%snack%'
          OR lower(coalesce("name", '')) LIKE '%cafeteria%'
          OR lower(coalesce("name", '')) LIKE '%cafe%'
          OR lower(coalesce("name", '')) LIKE '%bakery%'
          OR lower(coalesce("name", '')) LIKE '%juice%'
          OR lower(coalesce("name", '')) LIKE '%takeaway%'
          OR lower(coalesce("name", '')) LIKE '%snack%'
          THEN 'FOOD_SERVICE_PRESET_FIT'
        WHEN lower(coalesce("slug", '')) LIKE '%quick-service%'
          OR lower(coalesce("slug", '')) LIKE '%fast-food%'
          OR lower(coalesce("slug", '')) LIKE '%qsr%'
          OR lower(coalesce("name", '')) LIKE '%quick service%'
          OR lower(coalesce("name", '')) LIKE '%fast food%'
          THEN 'HOSPITALITY_EXTENSION_FIT'
        WHEN lower(coalesce("slug", '')) LIKE '%restaurant%'
          OR lower(coalesce("slug", '')) LIKE '%catering%'
          OR lower(coalesce("slug", '')) LIKE '%dining%'
          OR lower(coalesce("name", '')) LIKE '%restaurant%'
          OR lower(coalesce("name", '')) LIKE '%catering%'
          OR lower(coalesce("name", '')) LIKE '%dining%'
          THEN 'HOSPITALITY_LAYER_REQUIRED'
        WHEN lower(coalesce("slug", '')) LIKE '%grocery%'
          OR lower(coalesce("slug", '')) LIKE '%supermarket%'
          OR lower(coalesce("slug", '')) LIKE '%pharmacy%'
          OR lower(coalesce("slug", '')) LIKE '%fashion%'
          OR lower(coalesce("slug", '')) LIKE '%apparel%'
          OR lower(coalesce("slug", '')) LIKE '%electronics%'
          OR lower(coalesce("name", '')) LIKE '%grocery%'
          OR lower(coalesce("name", '')) LIKE '%supermarket%'
          OR lower(coalesce("name", '')) LIKE '%pharmacy%'
          OR lower(coalesce("name", '')) LIKE '%fashion%'
          OR lower(coalesce("name", '')) LIKE '%apparel%'
          OR lower(coalesce("name", '')) LIKE '%electronics%'
          THEN 'DIRECT_RETAIL_FIT'
        ELSE NULL
      END
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "category" DROP COLUMN "posSuggestedUserFit"',
    );
  }
}
