import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddIndexesToCategory1759090000000 implements MigrationInterface {
  name = 'AddIndexesToCategory1759090000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_category_name" ON "category" ("name")',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_category_sortOrder" ON "category" ("sortOrder")',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_category_sortOrder"',
    );
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_category_name"');
  }
}
