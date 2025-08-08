import { MigrationInterface, QueryRunner } from "typeorm";

export class AddImageUrlToProduct1753649207937 implements MigrationInterface {
    name = 'AddImageUrlToProduct1753649207937'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "product" ADD "imageUrl" text`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "product" DROP COLUMN "imageUrl"`);
    }

}
