import { MigrationInterface, QueryRunner, TableColumn } from "typeorm";

export class CorrectUserRolesDefaultAndData1748616503652 implements MigrationInterface {
    name = 'CorrectUserRolesDefaultAndData1748616503652';

    public async up(queryRunner: QueryRunner): Promise<void> {
        // 1. Add the 'storeName' column to the 'user' table if it doesn't exist
        const userTable = await queryRunner.getTable('user');
        const storeNameColumnExists = userTable?.columns.find(column => column.name === 'storeName');

        if (!storeNameColumnExists) {
            await queryRunner.addColumn("user", new TableColumn({
                name: "storeName",
                type: "character varying", // or varchar
                isNullable: true,
            }));
            console.log("Migration: Added 'storeName' column to 'user' table.");
        } else {
            console.log("Migration: 'storeName' column already exists in 'user' table. Skipping add.");
        }

        // 2. Correct the DEFAULT value for the 'roles' column
        // TypeORM's simple-array for a default like ['CUSTOMER'] should store 'CUSTOMER'
        await queryRunner.query(`ALTER TABLE "user" ALTER COLUMN "roles" SET DEFAULT 'CUSTOMER'`);
        console.log("Migration: Updated 'roles' column default in 'user' table to 'CUSTOMER'.");

        // 3. Update existing malformed 'roles' data
        // This specifically targets rows where roles is literally the string '["CUSTOMER"]'
        await queryRunner.query(`UPDATE "user" SET "roles" = 'CUSTOMER' WHERE "roles" = '["CUSTOMER"]'`);
        console.log("Migration: Updated existing rows where roles was '[\"CUSTOMER\"]' to 'CUSTOMER'.");
        
        // If you had other specific malformed stringified arrays like '["VENDOR"]', add similar UPDATE statements:
        // await queryRunner.query(`UPDATE "user" SET "roles" = 'VENDOR' WHERE "roles" = '["VENDOR"]'`);
        // await queryRunner.query(`UPDATE "user" SET "roles" = 'ADMIN' WHERE "roles" = '["ADMIN"]'`);
        // await queryRunner.query(`UPDATE "user" SET "roles" = 'DELIVERER' WHERE "roles" = '["DELIVERER"]'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Revert the 'roles' column default (to the previous incorrect one, or remove default)
        await queryRunner.query(`ALTER TABLE "user" ALTER COLUMN "roles" SET DEFAULT '["CUSTOMER"]'`);
        console.log("Migration Rollback: Reverted 'roles' column default in 'user' table to '[\"CUSTOMER\"]'.");
        
        // Reverting the data update is tricky as we don't know the exact previous state for all rows.
        // This example assumes you might want to revert 'CUSTOMER' back to '["CUSTOMER"]' if that was the only case.
        // await queryRunner.query(`UPDATE "user" SET "roles" = '["CUSTOMER"]' WHERE "roles" = 'CUSTOMER'`);
        // console.log("Migration Rollback: Attempted to revert 'CUSTOMER' roles data back to '[\"CUSTOMER\"]'. Review if necessary.");


        // Drop the 'storeName' column if it was added by this migration
        // Check if it exists before dropping to make the down migration safer
        const userTable = await queryRunner.getTable('user');
        const storeNameColumnExists = userTable?.columns.find(column => column.name === 'storeName');
        if (storeNameColumnExists) {
            await queryRunner.dropColumn("user", "storeName");
            console.log("Migration Rollback: Dropped 'storeName' column from 'user' table.");
        } else {
            console.log("Migration Rollback: 'storeName' column did not exist. Skipping drop.");
        }
    }
}

