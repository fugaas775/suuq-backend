import { MigrationInterface, QueryRunner } from 'typeorm';

export class SwitchToCommissionModel1768360000001 implements MigrationInterface {
    name = 'SwitchToCommissionModel1768360000001';

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Create ENUM type safely
        await queryRunner.query(`
            DO $$ BEGIN
                CREATE TYPE "public"."user_businessmodel_enum" AS ENUM('SUBSCRIPTION', 'COMMISSION');
            EXCEPTION
                WHEN duplicate_object THEN null;
            END $$;
        `);

        // Add columns if they don't exist
        await queryRunner.query(`ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "businessModel" "public"."user_businessmodel_enum" NOT NULL DEFAULT 'COMMISSION'`);
        await queryRunner.query(`ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "commissionRate" numeric(5,2) NOT NULL DEFAULT '0.05'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "user" DROP COLUMN IF EXISTS "commissionRate"`);
        await queryRunner.query(`ALTER TABLE "user" DROP COLUMN IF EXISTS "businessModel"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "public"."user_businessmodel_enum"`);
    }
}
