import { MigrationInterface, QueryRunner, TableColumn } from "typeorm";

export class AddCategorySortOrder1753242200000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.addColumn("category", new TableColumn({
            name: "sortOrder",
            type: "int",
            isNullable: false,
            default: 0
        }));
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.dropColumn("category", "sortOrder");
    }
}
