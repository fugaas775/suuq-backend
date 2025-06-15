import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateCategoryClosure1749655168771 implements MigrationInterface {
    name = 'CreateCategoryClosure1749655168771'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "category_closure" ("id_ancestor" integer NOT NULL, "id_descendant" integer NOT NULL, CONSTRAINT "PK_68e0a7615cb8d4c480bd7c084ff" PRIMARY KEY ("id_ancestor", "id_descendant"))`);
        await queryRunner.query(`CREATE INDEX "IDX_288bb159d4353215019fb06c00" ON "category_closure" ("id_ancestor") `);
        await queryRunner.query(`CREATE INDEX "IDX_7bf894c82bd74c9144a536ca56" ON "category_closure" ("id_descendant") `);
        await queryRunner.query(`ALTER TABLE "order" DROP COLUMN "status"`);
        await queryRunner.query(`CREATE TYPE "public"."order_status_enum" AS ENUM('PENDING', 'SHIPPED', 'DELIVERED')`);
        await queryRunner.query(`ALTER TABLE "order" ADD "status" "public"."order_status_enum" NOT NULL DEFAULT 'PENDING'`);
        await queryRunner.query(`ALTER TABLE "category_closure" ADD CONSTRAINT "FK_288bb159d4353215019fb06c004" FOREIGN KEY ("id_ancestor") REFERENCES "category"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "category_closure" ADD CONSTRAINT "FK_7bf894c82bd74c9144a536ca561" FOREIGN KEY ("id_descendant") REFERENCES "category"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "category_closure" DROP CONSTRAINT "FK_7bf894c82bd74c9144a536ca561"`);
        await queryRunner.query(`ALTER TABLE "category_closure" DROP CONSTRAINT "FK_288bb159d4353215019fb06c004"`);
        await queryRunner.query(`ALTER TABLE "order" DROP COLUMN "status"`);
        await queryRunner.query(`DROP TYPE "public"."order_status_enum"`);
        await queryRunner.query(`ALTER TABLE "order" ADD "status" character varying NOT NULL DEFAULT 'PENDING'`);
        await queryRunner.query(`DROP INDEX "public"."IDX_7bf894c82bd74c9144a536ca56"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_288bb159d4353215019fb06c00"`);
        await queryRunner.query(`DROP TABLE "category_closure"`);
    }

}