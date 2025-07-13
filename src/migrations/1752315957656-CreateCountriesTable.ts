import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateCountriesTable1752315957656 implements MigrationInterface {
    name = 'CreateCountriesTable1752315957656'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "country" ("id" SERIAL NOT NULL, "name" character varying NOT NULL, "flagUrl" character varying NOT NULL, "imageUrl" character varying NOT NULL, "description" text NOT NULL, "supplies" jsonb NOT NULL DEFAULT '[]', CONSTRAINT "UQ_2c5aa339240c0c3ae97fcc9dc4c" UNIQUE ("name"), CONSTRAINT "PK_bf6e37c231c4f4ea56dcd887269" PRIMARY KEY ("id"))`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "country"`);
    }

}
