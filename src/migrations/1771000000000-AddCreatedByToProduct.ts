import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCreatedByToProduct1771000000000 implements MigrationInterface {
  name = 'AddCreatedByToProduct1771000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add created_by_id column (nullable integer)
    await queryRunner.query(
      `ALTER TABLE "product" ADD "created_by_id" integer`,
    );

    // Add created_by_name column (nullable varchar)
    await queryRunner.query(
      `ALTER TABLE "product" ADD "created_by_name" character varying`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "product" DROP COLUMN "created_by_name"`,
    );
    await queryRunner.query(
      `ALTER TABLE "product" DROP COLUMN "created_by_id"`,
    );
  }
}
