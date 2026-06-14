import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddFavoritesIndex1767950000000 implements MigrationInterface {
  name = 'AddFavoritesIndex1767950000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_favorites_ids" ON "favorites" USING GIN ("ids")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_favorites_ids"`);
  }
}
