import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateProductRequestForward1733330000000
  implements MigrationInterface
{
  name = 'CreateProductRequestForward1733330000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "product_request_forward" (
        "id" SERIAL PRIMARY KEY,
        "request_id" integer NOT NULL,
        "vendor_id" integer NOT NULL,
        "forwarded_by_admin_id" integer NOT NULL,
        "note" text NULL,
        "channel" character varying(32) NULL,
        "forwarded_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "FK_product_request_forward_request" FOREIGN KEY ("request_id") REFERENCES "product_request"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_product_request_forward_vendor" FOREIGN KEY ("vendor_id") REFERENCES "user"("id"),
        CONSTRAINT "FK_product_request_forward_forwarded_by_admin" FOREIGN KEY ("forwarded_by_admin_id") REFERENCES "user"("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_product_request_forward_request"
        ON "product_request_forward" ("request_id");
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_product_request_forward_vendor"
        ON "product_request_forward" ("vendor_id");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX IF EXISTS "idx_product_request_forward_vendor"',
    );
    await queryRunner.query(
      'DROP INDEX IF EXISTS "idx_product_request_forward_request"',
    );
    await queryRunner.query('DROP TABLE IF EXISTS "product_request_forward"');
  }
}
