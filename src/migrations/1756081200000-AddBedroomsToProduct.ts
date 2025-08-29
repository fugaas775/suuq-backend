import { MigrationInterface, QueryRunner } from "typeorm";

export class AddBedroomsToProduct1756081200000 implements MigrationInterface {
    name = 'AddBedroomsToProduct1756081200000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "product" ADD COLUMN IF NOT EXISTS "bedrooms" integer`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_product_bedrooms" ON "product" ("bedrooms")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_product_bedrooms"`);
        await queryRunner.query(`ALTER TABLE "product" DROP COLUMN IF EXISTS "bedrooms"`);
    }
}
