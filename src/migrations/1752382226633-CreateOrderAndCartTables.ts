import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateOrderAndCartTables1752382226633 implements MigrationInterface {
    name = 'CreateOrderAndCartTables1752382226633'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "order" DROP CONSTRAINT "FK_88991860e839c6153a7ec878d39"`);
        await queryRunner.query(`ALTER TABLE "delivery" DROP CONSTRAINT "FK_b37d51328f9ca210b573b19372c"`);
        await queryRunner.query(`ALTER TABLE "cart_item" DROP CONSTRAINT "FK_75db0de134fe0f9fe9e4591b7bf"`);
        await queryRunner.query(`CREATE TABLE "order_item" ("id" SERIAL NOT NULL, "quantity" integer NOT NULL, "price" numeric(10,2) NOT NULL, "productId" integer, "orderId" integer, CONSTRAINT "PK_d01158fe15b1ead5c26fd7f4e90" PRIMARY KEY ("id"))`);
        // Data migration: copy productId and quantity from order to order_item
        await queryRunner.query(`INSERT INTO "order_item" ("quantity", "price", "productId", "orderId") SELECT "quantity", 0, "productId", "id" FROM "order" WHERE "productId" IS NOT NULL`);
        await queryRunner.query(`ALTER TABLE "order" DROP COLUMN "productId"`);
        await queryRunner.query(`ALTER TABLE "order" DROP COLUMN "quantity"`);
        await queryRunner.query(`ALTER TABLE "order" DROP COLUMN "customerEmail"`);
        await queryRunner.query(`ALTER TABLE "order" ADD "total" numeric(10,2) NOT NULL`);
        await queryRunner.query(`ALTER TABLE "order" ADD "shippingAddress" jsonb NOT NULL`);
        await queryRunner.query(`ALTER TABLE "order" ADD "userId" integer`);
        await queryRunner.query(`ALTER TYPE "public"."order_status_enum" RENAME TO "order_status_enum_old"`);
        await queryRunner.query(`CREATE TYPE "public"."order_status_enum" AS ENUM('PENDING', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED')`);
        await queryRunner.query(`ALTER TABLE "order" ALTER COLUMN "status" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "order" ALTER COLUMN "status" TYPE "public"."order_status_enum" USING "status"::"text"::"public"."order_status_enum"`);
        await queryRunner.query(`ALTER TABLE "order" ALTER COLUMN "status" SET DEFAULT 'PENDING'`);
        await queryRunner.query(`DROP TYPE "public"."order_status_enum_old"`);
        await queryRunner.query(`ALTER TABLE "delivery" DROP CONSTRAINT "FK_9cb46350176813bb0be824ffd8e"`);
        await queryRunner.query(`ALTER TABLE "delivery" DROP COLUMN "status"`);
        await queryRunner.query(`CREATE TYPE "public"."delivery_status_enum" AS ENUM('ASSIGNED', 'PICKED_UP', 'IN_TRANSIT', 'DELIVERED')`);
        await queryRunner.query(`ALTER TABLE "delivery" ADD "status" "public"."delivery_status_enum" NOT NULL DEFAULT 'ASSIGNED'`);
        await queryRunner.query(`ALTER TABLE "delivery" ALTER COLUMN "delivererId" SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE "order" ADD CONSTRAINT "FK_caabe91507b3379c7ba73637b84" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "order_item" ADD CONSTRAINT "FK_904370c093ceea4369659a3c810" FOREIGN KEY ("productId") REFERENCES "product"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "order_item" ADD CONSTRAINT "FK_646bf9ece6f45dbe41c203e06e0" FOREIGN KEY ("orderId") REFERENCES "order"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "delivery" ADD CONSTRAINT "FK_b37d51328f9ca210b573b19372c" FOREIGN KEY ("orderId") REFERENCES "order"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "delivery" ADD CONSTRAINT "FK_9cb46350176813bb0be824ffd8e" FOREIGN KEY ("delivererId") REFERENCES "user"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "cart_item" ADD CONSTRAINT "FK_75db0de134fe0f9fe9e4591b7bf" FOREIGN KEY ("productId") REFERENCES "product"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "cart_item" DROP CONSTRAINT "FK_75db0de134fe0f9fe9e4591b7bf"`);
        await queryRunner.query(`ALTER TABLE "delivery" DROP CONSTRAINT "FK_9cb46350176813bb0be824ffd8e"`);
        await queryRunner.query(`ALTER TABLE "delivery" DROP CONSTRAINT "FK_b37d51328f9ca210b573b19372c"`);
        await queryRunner.query(`ALTER TABLE "order_item" DROP CONSTRAINT "FK_646bf9ece6f45dbe41c203e06e0"`);
        await queryRunner.query(`ALTER TABLE "order_item" DROP CONSTRAINT "FK_904370c093ceea4369659a3c810"`);
        await queryRunner.query(`ALTER TABLE "order" DROP CONSTRAINT "FK_caabe91507b3379c7ba73637b84"`);
        await queryRunner.query(`ALTER TABLE "delivery" ALTER COLUMN "delivererId" DROP NOT NULL`);
        await queryRunner.query(`ALTER TABLE "delivery" DROP COLUMN "status"`);
        await queryRunner.query(`DROP TYPE "public"."delivery_status_enum"`);
        await queryRunner.query(`ALTER TABLE "delivery" ADD "status" character varying NOT NULL DEFAULT 'ASSIGNED'`);
        await queryRunner.query(`ALTER TABLE "delivery" ADD CONSTRAINT "FK_9cb46350176813bb0be824ffd8e" FOREIGN KEY ("delivererId") REFERENCES "user"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`CREATE TYPE "public"."order_status_enum_old" AS ENUM('PENDING', 'SHIPPED', 'DELIVERED')`);
        await queryRunner.query(`ALTER TABLE "order" ALTER COLUMN "status" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "order" ALTER COLUMN "status" TYPE "public"."order_status_enum_old" USING "status"::"text"::"public"."order_status_enum_old"`);
        await queryRunner.query(`ALTER TABLE "order" ALTER COLUMN "status" SET DEFAULT 'PENDING'`);
        await queryRunner.query(`DROP TYPE "public"."order_status_enum"`);
        await queryRunner.query(`ALTER TYPE "public"."order_status_enum_old" RENAME TO "order_status_enum"`);
        await queryRunner.query(`ALTER TABLE "order" DROP COLUMN "userId"`);
        await queryRunner.query(`ALTER TABLE "order" DROP COLUMN "shippingAddress"`);
        await queryRunner.query(`ALTER TABLE "order" DROP COLUMN "total"`);
        await queryRunner.query(`ALTER TABLE "order" ADD "customerEmail" character varying NOT NULL`);
        await queryRunner.query(`ALTER TABLE "order" ADD "quantity" integer`);
        await queryRunner.query(`ALTER TABLE "order" ADD "productId" integer`);
        // Data migration: restore productId and quantity from order_item
        await queryRunner.query(`UPDATE "order" SET "productId" = oi."productId", "quantity" = oi."quantity" FROM (SELECT "orderId", "productId", "quantity" FROM "order_item") oi WHERE "order"."id" = oi."orderId"`);
        await queryRunner.query(`ALTER TABLE "order" ALTER COLUMN "quantity" SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE "order" ALTER COLUMN "productId" SET NOT NULL`);
        await queryRunner.query(`DROP TABLE "order_item"`);
        await queryRunner.query(`ALTER TABLE "cart_item" ADD CONSTRAINT "FK_75db0de134fe0f9fe9e4591b7bf" FOREIGN KEY ("productId") REFERENCES "product"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "delivery" ADD CONSTRAINT "FK_b37d51328f9ca210b573b19372c" FOREIGN KEY ("orderId") REFERENCES "order"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "order" ADD CONSTRAINT "FK_88991860e839c6153a7ec878d39" FOREIGN KEY ("productId") REFERENCES "product"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

}
