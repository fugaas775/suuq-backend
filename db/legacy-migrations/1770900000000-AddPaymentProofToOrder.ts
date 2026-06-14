import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPaymentProofToOrder1770900000000 implements MigrationInterface {
  name = 'AddPaymentProofToOrder1770900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "order" ADD "paymentProofUrl" character varying`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "order" DROP COLUMN "paymentProofUrl"`,
    );
  }
}
