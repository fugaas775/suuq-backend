import { MigrationInterface, QueryRunner } from "typeorm";

export class AddAttachmentToTopUpRequest1767945800000 implements MigrationInterface {
    name = 'AddAttachmentToTopUpRequest1767945800000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Make reference nullable
        await queryRunner.query(`ALTER TABLE "top_up_request" ALTER COLUMN "reference" DROP NOT NULL`);
        // Add attachmentUrl column
        await queryRunner.query(`ALTER TABLE "top_up_request" ADD "attachmentUrl" character varying`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "top_up_request" DROP COLUMN "attachmentUrl"`);
        // Revert reference to not null (caution: this might fail if there are nulls)
        // await queryRunner.query(`ALTER TABLE "top_up_request" ALTER COLUMN "reference" SET NOT NULL`);
    }
}
