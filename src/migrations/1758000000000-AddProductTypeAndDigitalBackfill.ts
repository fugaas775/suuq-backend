import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProductTypeAndDigitalBackfill1758000000000
  implements MigrationInterface
{
  name = 'AddProductTypeAndDigitalBackfill1758000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "product" ADD COLUMN IF NOT EXISTS "product_type" varchar(16) DEFAULT 'physical'`,
    );
    // Backfill probable digital products: those with attributes->>'downloadKey'
    await queryRunner.query(
      `UPDATE "product" SET product_type='digital' WHERE (attributes->>'downloadKey') IS NOT NULL AND product_type IS DISTINCT FROM 'digital'`,
    );
    // Backfill new canonical digital structure where missing but legacy keys exist
    await queryRunner.query(
      `UPDATE "product" SET attributes = jsonb_set(attributes - 'downloadKey' - 'download_key' - 'is_free', '{digital}', jsonb_build_object('type','digital','isFree', (CASE WHEN (attributes->>'isFree')::boolean IS TRUE OR (attributes->>'is_free')::boolean IS TRUE THEN true ELSE null END), 'download', jsonb_build_object('key', attributes->>'downloadKey', 'publicUrl', NULL, 'filename', split_part(attributes->>'downloadKey','/',array_length(string_to_array(attributes->>'downloadKey','/'),1)), 'contentType', CASE WHEN right(lower(attributes->>'downloadKey'),4) = '.pdf' THEN 'application/pdf' WHEN right(lower(attributes->>'downloadKey'),5) = '.epub' THEN 'application/epub+zip' WHEN right(lower(attributes->>'downloadKey'),4) = '.zip' THEN 'application/zip' ELSE null END ))) WHERE (attributes->>'downloadKey') IS NOT NULL AND (attributes->'digital') IS NULL;`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Non destructive: keep column but allow rollback
    await queryRunner.query(
      `ALTER TABLE "product" DROP COLUMN IF EXISTS "product_type"`,
    );
    // Do not attempt to reverse json transformation
  }
}
