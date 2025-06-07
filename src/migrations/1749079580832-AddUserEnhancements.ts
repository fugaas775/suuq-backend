import { MigrationInterface, QueryRunner, TableColumn, TableIndex } from "typeorm";

export class AddUserEnhancements1749079580832 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.addColumn("user", new TableColumn({
            name: "googleId",
            type: "varchar",
            isNullable: true,
        }));
        await queryRunner.createIndex("user", new TableIndex({
            name: "IDX_user_googleId",
            columnNames: ["googleId"]
        }));

        await queryRunner.addColumn("user", new TableColumn({
            name: "deletedAt",
            type: "timestamp",
            isNullable: true,
        }));

        await queryRunner.addColumn("user", new TableColumn({
            name: "createdBy",
            type: "varchar",
            isNullable: true,
        }));
        await queryRunner.addColumn("user", new TableColumn({
            name: "updatedBy",
            type: "varchar",
            isNullable: true,
        }));
        await queryRunner.addColumn("user", new TableColumn({
            name: "deletedBy",
            type: "varchar",
            isNullable: true,
        }));

        await queryRunner.addColumn("user", new TableColumn({
            name: "phoneNumber",
            type: "varchar",
            length: "20",
            isNullable: true,
        }));
        await queryRunner.addColumn("user", new TableColumn({
            name: "isPhoneVerified",
            type: "boolean",
            isNullable: false,
            default: false,
        }));

        await queryRunner.createIndex("user", new TableIndex({
            name: "IDX_user_email",
            columnNames: ["email"]
        }));
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.dropIndex("user", "IDX_user_email");
        await queryRunner.dropIndex("user", "IDX_user_googleId");
        await queryRunner.dropColumn("user", "isPhoneVerified");
        await queryRunner.dropColumn("user", "phoneNumber");
        await queryRunner.dropColumn("user", "deletedBy");
        await queryRunner.dropColumn("user", "updatedBy");
        await queryRunner.dropColumn("user", "createdBy");
        await queryRunner.dropColumn("user", "deletedAt");
        await queryRunner.dropColumn("user", "googleId");
    }
}
