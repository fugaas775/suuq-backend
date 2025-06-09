import { MigrationInterface, QueryRunner } from "typeorm";

export class AddIconNameToCategory1749402429374 implements MigrationInterface {
    name = 'AddIconNameToCategory1749402429374'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "category" ADD "iconName" character varying`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "category" DROP COLUMN "iconName"`);
    }

}
