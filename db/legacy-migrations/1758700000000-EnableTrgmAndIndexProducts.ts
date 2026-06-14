import { MigrationInterface, QueryRunner } from 'typeorm';

export class EnableTrgmAndIndexProducts1758700000000
  implements MigrationInterface
{
  name = 'EnableTrgmAndIndexProducts1758700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);
    // Product table may not be schema-qualified; using default public schema
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_product_name_trgm ON "product" USING gin ("name" gin_trgm_ops)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_product_name_trgm`);
    // Do not drop extension on down; it may be shared
  }
}
