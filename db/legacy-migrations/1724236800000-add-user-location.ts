import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserLocation1724236800000 implements MigrationInterface {
  name = 'AddUserLocation1724236800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user" ADD COLUMN "locationLat" double precision`,
    );
    await queryRunner.query(
      `ALTER TABLE "user" ADD COLUMN "locationLng" double precision`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "locationLng"`);
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "locationLat"`);
  }
}
