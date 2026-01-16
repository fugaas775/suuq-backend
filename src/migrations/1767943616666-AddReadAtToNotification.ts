import { MigrationInterface, QueryRunner } from "typeorm";

export class AddReadAtToNotification1767943616666 implements MigrationInterface {
    name = 'AddReadAtToNotification1767943616666'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "notification" ADD "readAt" TIMESTAMP`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "notification" DROP COLUMN "readAt"`);
    }
}
