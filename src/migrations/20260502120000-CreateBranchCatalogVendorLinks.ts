import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateBranchCatalogVendorLinks20260502120000
  implements MigrationInterface
{
  name = 'CreateBranchCatalogVendorLinks20260502120000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "branch_catalog_vendor_links" (
        "id" SERIAL NOT NULL,
        "branchId" integer NOT NULL,
        "vendorId" integer NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_branch_catalog_vendor_links_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_branch_catalog_vendor_links_branch_vendor" UNIQUE ("branchId", "vendorId"),
        CONSTRAINT "FK_branch_catalog_vendor_links_branch" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_branch_catalog_vendor_links_vendor" FOREIGN KEY ("vendorId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_branch_catalog_vendor_links_branch" ON "branch_catalog_vendor_links" ("branchId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_branch_catalog_vendor_links_vendor" ON "branch_catalog_vendor_links" ("vendorId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_branch_catalog_vendor_links_vendor"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_branch_catalog_vendor_links_branch"`,
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS "branch_catalog_vendor_links"`,
    );
  }
}
