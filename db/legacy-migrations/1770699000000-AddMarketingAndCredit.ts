import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMarketingAndCredit1770699000000 implements MigrationInterface {
  name = 'AddMarketingAndCredit1770699000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // --- COUPONS ---
    await queryRunner.query(
      `CREATE TYPE "public"."coupon_discounttype_enum" AS ENUM('PERCENTAGE', 'FIXED_AMOUNT')`,
    );
    await queryRunner.query(`CREATE TABLE "coupon" (
            "id" SERIAL NOT NULL, 
            "code" character varying NOT NULL, 
            "discountType" "public"."coupon_discounttype_enum" NOT NULL, 
            "amount" numeric(10,2) NOT NULL, 
            "expiresAt" TIMESTAMP NOT NULL, 
            "usageLimit" integer NOT NULL DEFAULT 0, 
            "usedCount" integer NOT NULL DEFAULT 0, 
            "minOrderAmount" numeric(10,2) NOT NULL DEFAULT 0, 
            "isActive" boolean NOT NULL DEFAULT true, 
            "createdAt" TIMESTAMP NOT NULL DEFAULT now(), 
            "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), 
            "vendorId" integer, 
            CONSTRAINT "UQ_coupon_code" UNIQUE ("code"), 
            CONSTRAINT "PK_coupon_id" PRIMARY KEY ("id"))`);

    await queryRunner.query(
      `ALTER TABLE "coupon" ADD CONSTRAINT "FK_coupon_vendor" FOREIGN KEY ("vendorId") REFERENCES "user"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );

    // --- FLASH SALES ---
    await queryRunner.query(`CREATE TABLE "flash_sale" (
            "id" SERIAL NOT NULL, 
            "title" character varying NOT NULL, 
            "description" text, 
            "startTime" TIMESTAMP NOT NULL, 
            "endTime" TIMESTAMP NOT NULL, 
            "isActive" boolean NOT NULL DEFAULT true, 
            "discountPercentage" numeric(5,2) NOT NULL DEFAULT 0, 
            "createdAt" TIMESTAMP NOT NULL DEFAULT now(), 
            "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), 
            CONSTRAINT "PK_flash_sale_id" PRIMARY KEY ("id"))`);

    await queryRunner.query(`CREATE TABLE "flash_sale_products_product" (
            "flashSaleId" integer NOT NULL, 
            "productId" integer NOT NULL, 
            CONSTRAINT "PK_flash_sale_products" PRIMARY KEY ("flashSaleId", "productId"))`);

    await queryRunner.query(
      `CREATE INDEX "IDX_flash_sale_products_flashSaleId" ON "flash_sale_products_product" ("flashSaleId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_flash_sale_products_productId" ON "flash_sale_products_product" ("productId")`,
    );

    await queryRunner.query(
      `ALTER TABLE "flash_sale_products_product" ADD CONSTRAINT "FK_flash_sale_products_flashSaleId" FOREIGN KEY ("flashSaleId") REFERENCES "flash_sale"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "flash_sale_products_product" ADD CONSTRAINT "FK_flash_sale_products_productId" FOREIGN KEY ("productId") REFERENCES "product"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );

    // --- CREDIT LIMIT (BNPL) ---
    await queryRunner.query(`CREATE TABLE "credit_limit" (
            "id" SERIAL NOT NULL, 
            "userId" integer NOT NULL, 
            "maxLimit" numeric(12,2) NOT NULL DEFAULT 0, 
            "currentUsage" numeric(12,2) NOT NULL DEFAULT 0, 
            "currency" character varying NOT NULL DEFAULT 'ETB', 
            "isEligible" boolean NOT NULL DEFAULT false, 
            "isActive" boolean NOT NULL DEFAULT true, 
            "interestRate" numeric(5,2) NOT NULL DEFAULT 0, 
            "dueDate" TIMESTAMP, 
            "createdAt" TIMESTAMP NOT NULL DEFAULT now(), 
            "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), 
            CONSTRAINT "UQ_credit_limit_userId" UNIQUE ("userId"), 
            CONSTRAINT "PK_credit_limit_id" PRIMARY KEY ("id"))`);

    await queryRunner.query(
      `ALTER TABLE "credit_limit" ADD CONSTRAINT "FK_credit_limit_user" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );

    // --- CREDIT TRANSACTION ---
    await queryRunner.query(
      `CREATE TYPE "public"."credit_transaction_type_enum" AS ENUM('USAGE', 'REPAYMENT', 'INTEREST', 'ADJUSTMENT')`,
    );
    await queryRunner.query(`CREATE TABLE "credit_transaction" (
            "id" SERIAL NOT NULL, 
            "userId" integer NOT NULL, 
            "type" "public"."credit_transaction_type_enum" NOT NULL, 
            "amount" numeric(12,2) NOT NULL, 
            "referenceId" character varying, 
            "description" character varying, 
            "createdAt" TIMESTAMP NOT NULL DEFAULT now(), 
            CONSTRAINT "PK_credit_transaction_id" PRIMARY KEY ("id"))`);

    await queryRunner.query(
      `ALTER TABLE "credit_transaction" ADD CONSTRAINT "FK_credit_transaction_user" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "credit_transaction"`);
    await queryRunner.query(
      `DROP TYPE "public"."credit_transaction_type_enum"`,
    );
    await queryRunner.query(`DROP TABLE "credit_limit"`);
    await queryRunner.query(`DROP TABLE "flash_sale_products_product"`);
    await queryRunner.query(`DROP TABLE "flash_sale"`);
    await queryRunner.query(`DROP TABLE "coupon"`);
    await queryRunner.query(`DROP TYPE "public"."coupon_discounttype_enum"`);
  }
}
