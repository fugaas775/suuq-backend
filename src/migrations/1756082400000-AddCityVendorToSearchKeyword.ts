import { MigrationInterface, QueryRunner } from "typeorm";

export class AddCityVendorToSearchKeyword1756082400000 implements MigrationInterface {
    name = 'AddCityVendorToSearchKeyword1756082400000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "search_keyword" ADD COLUMN IF NOT EXISTS "last_city" varchar(128) NULL`);
        await queryRunner.query(`ALTER TABLE "search_keyword" ADD COLUMN IF NOT EXISTS "last_vendor_name" varchar(256) NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "search_keyword" DROP COLUMN IF EXISTS "last_vendor_name"`);
        await queryRunner.query(`ALTER TABLE "search_keyword" DROP COLUMN IF EXISTS "last_city"`);
    }
}
