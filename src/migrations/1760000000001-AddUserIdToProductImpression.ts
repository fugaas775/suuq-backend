import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserIdToProductImpression1760000000001
  implements MigrationInterface
{
  name = 'AddUserIdToProductImpression1760000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "product_impression" ADD "userId" integer`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_impression" ADD CONSTRAINT "FK_product_impression_user" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE SET NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_product_impression_userId" ON "product_impression" ("userId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_product_impression_userId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_impression" DROP CONSTRAINT "FK_product_impression_user"`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_impression" DROP COLUMN "userId"`,
    );
  }
}
