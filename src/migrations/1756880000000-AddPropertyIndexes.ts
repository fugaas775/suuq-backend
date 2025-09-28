import { MigrationInterface, QueryRunner } from "typeorm";

export class AddPropertyIndexes1756880000000 implements MigrationInterface {
    name = 'AddPropertyIndexes1756880000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_products_listing_type ON product (listing_type)`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_products_bedrooms ON product (bedrooms)`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_products_city ON product (listing_city)`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_products_listing_type_bedrooms ON product (listing_type, bedrooms)`);
    // Note: Product entity uses camelCase @CreateDateColumn createdAt (DB column name "createdAt").
    // Previous attempt used created_at which doesn't exist. Use quoted identifier to preserve case.
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_products_city_type_bedrooms_created ON product (listing_city, listing_type, bedrooms, "createdAt" DESC)`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS idx_products_city_type_bedrooms_created`);
        await queryRunner.query(`DROP INDEX IF EXISTS idx_products_listing_type_bedrooms`);
        await queryRunner.query(`DROP INDEX IF EXISTS idx_products_city`);
        await queryRunner.query(`DROP INDEX IF EXISTS idx_products_bedrooms`);
        await queryRunner.query(`DROP INDEX IF EXISTS idx_products_listing_type`);
    }
}
