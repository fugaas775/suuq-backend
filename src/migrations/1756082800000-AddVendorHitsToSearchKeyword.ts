import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddVendorHitsToSearchKeyword1756082800000
  implements MigrationInterface
{
  name = 'AddVendorHitsToSearchKeyword1756082800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "search_keyword" ADD COLUMN IF NOT EXISTS "vendor_hits" jsonb NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "search_keyword" DROP COLUMN IF EXISTS "vendor_hits"`,
    );
  }
}
