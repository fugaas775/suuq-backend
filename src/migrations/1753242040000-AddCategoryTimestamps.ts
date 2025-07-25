import { MigrationInterface, QueryRunner, TableColumn } from "typeorm";

export class AddCategoryTimestamps1753242040000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.addColumns("category", [
            new TableColumn({
                name: "createdAt",
                type: "timestamp",
                isNullable: false,
                default: "now()"
            }),
            new TableColumn({
                name: "updatedAt",
                type: "timestamp",
                isNullable: false,
                default: "now()"
            })
        ]);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.dropColumn("category", "createdAt");
        await queryRunner.dropColumn("category", "updatedAt");
    }
}
