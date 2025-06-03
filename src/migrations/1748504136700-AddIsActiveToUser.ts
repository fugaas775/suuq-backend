import { MigrationInterface, QueryRunner } from "typeorm";

export class AddIsActiveToUser1748504136700 implements MigrationInterface {
  name = 'AddIsActiveToUser1748504136700';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "user"
      ADD COLUMN "isActive" boolean NOT NULL DEFAULT true
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "user"
      DROP COLUMN "isActive"
    `);
  }
}
