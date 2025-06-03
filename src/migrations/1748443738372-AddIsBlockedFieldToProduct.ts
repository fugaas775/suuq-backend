import { MigrationInterface, QueryRunner } from 'typeorm';

export class OnlyAddIsBlockedToProduct1748449999999 implements MigrationInterface {
  name = 'OnlyAddIsBlockedToProduct1748449999999'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "product" ADD "isBlocked" boolean NOT NULL DEFAULT false`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "product" DROP COLUMN "isBlocked"`
    );
  }
}

