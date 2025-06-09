import { MigrationInterface, QueryRunner } from "typeorm";

export class AddSkuStockStatusToProduct1749393645489 implements MigrationInterface {
    name = 'AddSkuStockStatusToProduct1749393645489'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "product" ADD "sku" character varying`);
        await queryRunner.query(`ALTER TABLE "product" ADD "stock_quantity" integer`);
        await queryRunner.query(`ALTER TABLE "product" ADD "manage_stock" boolean NOT NULL DEFAULT false`);
        await queryRunner.query(`ALTER TABLE "product" ADD "status" character varying NOT NULL DEFAULT 'publish'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "product" DROP COLUMN "status"`);
        await queryRunner.query(`ALTER TABLE "product" DROP COLUMN "manage_stock"`);
        await queryRunner.query(`ALTER TABLE "product" DROP COLUMN "stock_quantity"`);
        await queryRunner.query(`ALTER TABLE "product" DROP COLUMN "sku"`);
    }

}
