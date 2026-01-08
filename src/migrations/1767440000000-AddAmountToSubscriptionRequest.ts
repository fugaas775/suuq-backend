import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAmountToSubscriptionRequest1767440000000
  implements MigrationInterface
{
  name = 'AddAmountToSubscriptionRequest1767440000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "subscription_request" ADD "amount" numeric(10,2)`,
    );
    await queryRunner.query(
      `ALTER TABLE "subscription_request" ADD "currency" character varying`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "subscription_request" DROP COLUMN "currency"`,
    );
    await queryRunner.query(
      `ALTER TABLE "subscription_request" DROP COLUMN "amount"`,
    );
  }
}
