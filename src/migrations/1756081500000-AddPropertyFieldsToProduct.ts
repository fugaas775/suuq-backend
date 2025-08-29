import { MigrationInterface, QueryRunner } from "typeorm";

export class AddPropertyFieldsToProduct1756081500000 implements MigrationInterface {
    name = 'AddPropertyFieldsToProduct1756081500000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "product" ADD COLUMN IF NOT EXISTS "listing_city" varchar(120)`);
        await queryRunner.query(`ALTER TABLE "product" ADD COLUMN IF NOT EXISTS "bathrooms" integer`);
        await queryRunner.query(`ALTER TABLE "product" ADD COLUMN IF NOT EXISTS "size_sqm" integer`);
        await queryRunner.query(`ALTER TABLE "product" ADD COLUMN IF NOT EXISTS "furnished" boolean`);
        await queryRunner.query(`ALTER TABLE "product" ADD COLUMN IF NOT EXISTS "rent_period" varchar(16)`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_product_listing_city" ON "product" ("listing_city")`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_product_bathrooms" ON "product" ("bathrooms")`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_product_size_sqm" ON "product" ("size_sqm")`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_product_furnished" ON "product" ("furnished")`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_product_rent_period" ON "product" ("rent_period")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_product_rent_period"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_product_furnished"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_product_size_sqm"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_product_bathrooms"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_product_listing_city"`);
        await queryRunner.query(`ALTER TABLE "product" DROP COLUMN IF EXISTS "rent_period"`);
        await queryRunner.query(`ALTER TABLE "product" DROP COLUMN IF EXISTS "furnished"`);
        await queryRunner.query(`ALTER TABLE "product" DROP COLUMN IF EXISTS "size_sqm"`);
        await queryRunner.query(`ALTER TABLE "product" DROP COLUMN IF EXISTS "bathrooms"`);
        await queryRunner.query(`ALTER TABLE "product" DROP COLUMN IF EXISTS "listing_city"`);
    }
}
