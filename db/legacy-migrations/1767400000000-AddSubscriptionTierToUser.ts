import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSubscriptionTierToUser1767400000000
  implements MigrationInterface
{
  name = 'AddSubscriptionTierToUser1767400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create the enum type first
    await queryRunner.query(
      `CREATE TYPE "public"."user_subscriptiontier_enum" AS ENUM('free', 'pro')`,
    );

    // Add the column with the enum type and default value
    await queryRunner.query(
      `ALTER TABLE "user" ADD "subscriptionTier" "public"."user_subscriptiontier_enum" NOT NULL DEFAULT 'free'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user" DROP COLUMN "subscriptionTier"`,
    );
    await queryRunner.query(`DROP TYPE "public"."user_subscriptiontier_enum"`);
  }
}
