import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateBranchCatalogProductLinks20260502110000
  implements MigrationInterface
{
  name = 'CreateBranchCatalogProductLinks20260502110000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "branch_catalog_product_links" (
        "id" SERIAL NOT NULL,
        "branchId" integer NOT NULL,
        "productId" integer NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_branch_catalog_product_links_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_branch_catalog_product_links_branch_product" UNIQUE ("branchId", "productId"),
        CONSTRAINT "FK_branch_catalog_product_links_branch" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_branch_catalog_product_links_product" FOREIGN KEY ("productId") REFERENCES "product"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_branch_catalog_product_links_branch" ON "branch_catalog_product_links" ("branchId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_branch_catalog_product_links_product" ON "branch_catalog_product_links" ("productId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_branch_catalog_product_links_product"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_branch_catalog_product_links_branch"`,
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS "branch_catalog_product_links"`,
    );
  }
}
