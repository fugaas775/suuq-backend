import { MigrationInterface, QueryRunner } from "typeorm";

export class AddCountryToSearchKeyword1756082600000 implements MigrationInterface {
    name = 'AddCountryToSearchKeyword1756082600000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "search_keyword" ADD COLUMN IF NOT EXISTS "last_country" varchar(2) NULL`);
        // Optional backfill could go here if you have a way to infer country from IP/user; skipping for now
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "search_keyword" DROP COLUMN IF EXISTS "last_country"`);
    }
}
