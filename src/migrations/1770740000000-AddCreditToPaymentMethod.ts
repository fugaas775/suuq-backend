import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCreditToPaymentMethod1770740000000
  implements MigrationInterface
{
  name = 'AddCreditToPaymentMethod1770740000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."order_paymentmethod_enum" ADD VALUE IF NOT EXISTS 'CREDIT'`,
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public async down(_queryRunner: QueryRunner): Promise<void> {}
}
