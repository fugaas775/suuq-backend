import { MigrationInterface, QueryRunner } from "typeorm";

export class AddOrderItemFulfillmentFields1755162086336 implements MigrationInterface {
    name = 'AddOrderItemFulfillmentFields1755162086336'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."order_item_status_enum" AS ENUM('PENDING', 'PROCESSING', 'SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'DELIVERY_FAILED', 'CANCELLED')`);
        await queryRunner.query(`ALTER TABLE "order_item" ADD "status" "public"."order_item_status_enum" NOT NULL DEFAULT 'PENDING'`);
        await queryRunner.query(`ALTER TABLE "order_item" ADD "shippedAt" TIMESTAMP`);
        await queryRunner.query(`ALTER TABLE "order_item" ADD "deliveredAt" TIMESTAMP`);
        await queryRunner.query(`ALTER TABLE "order_item" ADD "trackingCarrier" character varying(255)`);
        await queryRunner.query(`ALTER TABLE "order_item" ADD "trackingNumber" character varying(255)`);
        await queryRunner.query(`ALTER TABLE "order_item" ADD "trackingUrl" character varying(1024)`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "order_item" DROP COLUMN "trackingUrl"`);
        await queryRunner.query(`ALTER TABLE "order_item" DROP COLUMN "trackingNumber"`);
        await queryRunner.query(`ALTER TABLE "order_item" DROP COLUMN "trackingCarrier"`);
        await queryRunner.query(`ALTER TABLE "order_item" DROP COLUMN "deliveredAt"`);
        await queryRunner.query(`ALTER TABLE "order_item" DROP COLUMN "shippedAt"`);
        await queryRunner.query(`ALTER TABLE "order_item" DROP COLUMN "status"`);
        await queryRunner.query(`DROP TYPE "public"."order_item_status_enum"`);
    }

}
