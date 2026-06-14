import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddIsPhoneVerifiedToUser1757095000000
  implements MigrationInterface
{
  name = 'AddIsPhoneVerifiedToUser1757095000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "user"
      ADD COLUMN IF NOT EXISTS "isPhoneVerified" boolean NOT NULL DEFAULT false;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "user" DROP COLUMN IF EXISTS "isPhoneVerified";
    `);
  }
}
