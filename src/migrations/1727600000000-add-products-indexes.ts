import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProductsIndexes1727600000000 implements MigrationInterface {
  name = 'AddProductsIndexes1727600000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Composite index for status + is_blocked for hot filters
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_products_status_blocked ON "product" ("status", "isBlocked")`,
    );
    // Listing city for property listings
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_products_listing_city ON "product" ("listing_city")`,
    );
    // Sort helpers
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_products_created_at ON "product" ("createdAt")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_products_sales_count ON "product" ("sales_count")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_products_average_rating ON "product" ("average_rating")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_products_average_rating`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_products_sales_count`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_products_created_at`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_products_listing_city`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_products_status_blocked`);
  }
}
