import { MigrationInterface, QueryRunner } from 'typeorm';

export class ChangeUserRoleToRolesArray1748605460173 implements MigrationInterface {
  name = 'ChangeUserRoleToRolesArray1748605460173';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Rename column "role" to "roles"
    await queryRunner.query(`ALTER TABLE "user" RENAME COLUMN "role" TO "roles"`);

    // Drop old roles column to change type
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "roles"`);

    // Add new "roles" column as a JSON array string
    await queryRunner.query(`ALTER TABLE "user" ADD "roles" text NOT NULL DEFAULT '["CUSTOMER"]'`);

    // Drop and recreate displayName
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "displayName"`);
    await queryRunner.query(`ALTER TABLE "user" ADD "displayName" character varying`);

    // Drop and recreate avatarUrl
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "avatarUrl"`);
    await queryRunner.query(`ALTER TABLE "user" ADD "avatarUrl" character varying`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Roll back avatarUrl change
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "avatarUrl"`);
    await queryRunner.query(`ALTER TABLE "user" ADD "avatarUrl" character varying(255)`);

    // Roll back displayName change
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "displayName"`);
    await queryRunner.query(`ALTER TABLE "user" ADD "displayName" character varying(255)`);

    // Roll back roles column change
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "roles"`);
    await queryRunner.query(`ALTER TABLE "user" ADD "roles" character varying NOT NULL`);

    // Rename back to "role"
    await queryRunner.query(`ALTER TABLE "user" RENAME COLUMN "roles" TO "role"`);
  }
}
