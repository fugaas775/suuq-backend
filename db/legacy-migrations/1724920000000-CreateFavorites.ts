import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateFavorites1724920000000 implements MigrationInterface {
  name = 'CreateFavorites1724920000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "favorites" ("userId" integer NOT NULL, "ids" integer array NOT NULL DEFAULT '{}', "version" integer NOT NULL DEFAULT 0, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_favorites_user" PRIMARY KEY ("userId"))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "favorites"`);
  }
}
