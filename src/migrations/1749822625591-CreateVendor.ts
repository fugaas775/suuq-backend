import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateVendor1749822625591 implements MigrationInterface {
    name = 'CreateVendor1749822625591'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "category_closure" DROP CONSTRAINT "FK_288bb159d4353215019fb06c004"`);
        await queryRunner.query(`ALTER TABLE "category_closure" DROP CONSTRAINT "FK_7bf894c82bd74c9144a536ca561"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_288bb159d4353215019fb06c00"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_7bf894c82bd74c9144a536ca56"`);
        await queryRunner.query(`CREATE TABLE "vendor" ("id" SERIAL NOT NULL, "store_name" character varying NOT NULL, "legal_name" character varying(255), "business_license_number" character varying(128), "tax_id" character varying(128), "registration_country" character varying(2) NOT NULL, "registration_region" character varying(128), "registration_city" character varying(128), "business_type" character varying(64), "contact_name" character varying(128), "phone_number" character varying(32), "email" character varying(255), "website" character varying(255), "address" character varying(255), "postal_code" character varying(32), "avatar_url" character varying(255), "facebook_url" character varying(255), "instagram_url" character varying(255), "twitter_url" character varying(255), "telegram_url" character varying(255), "tiktok_url" character varying(255), "verified" boolean NOT NULL DEFAULT false, "about" text, "is_active" boolean DEFAULT true, "featured" boolean DEFAULT false, "years_on_platform" integer, "last_login_at" TIMESTAMP, "rating" double precision DEFAULT '0', "number_of_sales" integer DEFAULT '0', "preferred_language" character varying(8), "supported_currencies" text, "timezone" character varying(64), "bank_account_number" character varying(64), "bank_name" character varying(128), "mobile_money_number" character varying(32), "mobile_money_provider" character varying(32), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_931a23f6231a57604f5a0e32780" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_ec6727e5793313a73c6ee275db" ON "vendor" ("registration_country") `);
        await queryRunner.query(`CREATE INDEX "IDX_4aa1348fc4b7da9bef0fae8ff4" ON "category_closure" ("id_ancestor") `);
        await queryRunner.query(`CREATE INDEX "IDX_6a22002acac4976977b1efd114" ON "category_closure" ("id_descendant") `);
        await queryRunner.query(`ALTER TABLE "category_closure" ADD CONSTRAINT "FK_4aa1348fc4b7da9bef0fae8ff48" FOREIGN KEY ("id_ancestor") REFERENCES "category"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "category_closure" ADD CONSTRAINT "FK_6a22002acac4976977b1efd114a" FOREIGN KEY ("id_descendant") REFERENCES "category"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "category_closure" DROP CONSTRAINT "FK_6a22002acac4976977b1efd114a"`);
        await queryRunner.query(`ALTER TABLE "category_closure" DROP CONSTRAINT "FK_4aa1348fc4b7da9bef0fae8ff48"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_6a22002acac4976977b1efd114"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_4aa1348fc4b7da9bef0fae8ff4"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_ec6727e5793313a73c6ee275db"`);
        await queryRunner.query(`DROP TABLE "vendor"`);
        await queryRunner.query(`CREATE INDEX "IDX_7bf894c82bd74c9144a536ca56" ON "category_closure" ("id_descendant") `);
        await queryRunner.query(`CREATE INDEX "IDX_288bb159d4353215019fb06c00" ON "category_closure" ("id_ancestor") `);
        await queryRunner.query(`ALTER TABLE "category_closure" ADD CONSTRAINT "FK_7bf894c82bd74c9144a536ca561" FOREIGN KEY ("id_descendant") REFERENCES "category"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "category_closure" ADD CONSTRAINT "FK_288bb159d4353215019fb06c004" FOREIGN KEY ("id_ancestor") REFERENCES "category"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

}
