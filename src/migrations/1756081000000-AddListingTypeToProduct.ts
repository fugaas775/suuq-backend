import { MigrationInterface, QueryRunner } from "typeorm";

export class AddListingTypeToProduct1756081000000 implements MigrationInterface {
    name = 'AddListingTypeToProduct1756081000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "product" ADD COLUMN IF NOT EXISTS "listing_type" varchar(10)`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_product_listing_type" ON "product" ("listing_type")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_product_listing_type"`);
        await queryRunner.query(`ALTER TABLE "product" DROP COLUMN IF EXISTS "listing_type"`);
    }
}
