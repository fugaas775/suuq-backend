import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCouponToOrder1771504680710 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "order" ADD "couponCode" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "order" ADD "discountAmount" numeric(10,2) NOT NULL DEFAULT '0'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "order" DROP COLUMN "discountAmount"`);
    await queryRunner.query(`ALTER TABLE "order" DROP COLUMN "couponCode"`);
  }
}
