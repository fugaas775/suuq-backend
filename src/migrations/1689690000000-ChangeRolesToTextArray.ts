import { MigrationInterface, QueryRunner } from 'typeorm';

export class ChangeRolesToTextArray1689690000000 implements MigrationInterface {
  name = 'ChangeRolesToTextArray1689690000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Remove default first
    await queryRunner.query(
      `ALTER TABLE "user" ALTER COLUMN "roles" DROP DEFAULT`,
    );
    // Convert roles column from simple-array (text) to text[]
    await queryRunner.query(
      `ALTER TABLE "user" ALTER COLUMN "roles" TYPE text[] USING string_to_array(roles, ',')`,
    );
    // Set new default as array
    await queryRunner.query(
      `ALTER TABLE "user" ALTER COLUMN "roles" SET DEFAULT ARRAY['CUSTOMER']`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Revert roles column from text[] back to simple-array (text)
    await queryRunner.query(
      `ALTER TABLE "user" ALTER COLUMN "roles" TYPE text USING array_to_string(roles, ',')`,
    );
  }
}
