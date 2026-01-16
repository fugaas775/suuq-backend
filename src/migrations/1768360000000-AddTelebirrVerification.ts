import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddTelebirrVerification1768360000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user" ADD "telebirrVerified" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE "user" ADD "telebirrVerifiedAt" TIMESTAMP`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "telebirrVerifiedAt"`);
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "telebirrVerified"`);
  }
}
