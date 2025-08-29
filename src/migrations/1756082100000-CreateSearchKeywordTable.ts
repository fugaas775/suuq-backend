import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateSearchKeywordTable1756082100000 implements MigrationInterface {
    name = 'CreateSearchKeywordTable1756082100000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
          CREATE TABLE IF NOT EXISTS "search_keyword" (
            "id" SERIAL PRIMARY KEY,
            "q" varchar(256) NOT NULL,
            "q_norm" varchar(256) NOT NULL UNIQUE,
            "total_count" integer NOT NULL DEFAULT 0,
            "suggest_count" integer NOT NULL DEFAULT 0,
            "submit_count" integer NOT NULL DEFAULT 0,
            "last_results" integer NULL,
            "last_ip" varchar(64) NULL,
            "last_ua" varchar(256) NULL,
            "first_seen_at" TIMESTAMP NOT NULL DEFAULT now(),
            "last_seen_at" TIMESTAMP NOT NULL DEFAULT now()
          );
        `);
        await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_search_keyword_qnorm" ON "search_keyword" ("q_norm");`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_search_keyword_qnorm";`);
        await queryRunner.query(`DROP TABLE IF EXISTS "search_keyword";`);
    }
}
