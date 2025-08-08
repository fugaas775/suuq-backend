import { MigrationInterface, QueryRunner } from "typeorm";

export class AddImageVariantsToProductImage1753624225702 implements MigrationInterface {
    name = 'AddImageVariantsToProductImage1753624225702'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "product_image" ADD "thumbnailSrc" character varying`);
        await queryRunner.query(`ALTER TABLE "product_image" ADD "lowResSrc" character varying`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "product_image" DROP COLUMN "lowResSrc"`);
        await queryRunner.query(`ALTER TABLE "product_image" DROP COLUMN "thumbnailSrc"`);
    }

}
