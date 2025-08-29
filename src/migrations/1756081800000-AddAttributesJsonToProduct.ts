import { MigrationInterface, QueryRunner } from "typeorm";

export class AddAttributesJsonToProduct1756081800000 implements MigrationInterface {
    name = 'AddAttributesJsonToProduct1756081800000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "product" ADD COLUMN IF NOT EXISTS "attributes" jsonb DEFAULT '{}'::jsonb`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "product" DROP COLUMN IF EXISTS "attributes"`);
    }
}
