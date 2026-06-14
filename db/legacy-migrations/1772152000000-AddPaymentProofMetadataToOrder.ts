import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPaymentProofMetadataToOrder1772152000000
  implements MigrationInterface
{
  name = 'AddPaymentProofMetadataToOrder1772152000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "order" ADD "paymentProofKey" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "order" ADD "paymentProofMimeType" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "order" ADD "paymentProofSizeBytes" integer`,
    );
    await queryRunner.query(
      `ALTER TABLE "order" ADD "paymentProofUploadedAt" TIMESTAMP`,
    );
    await queryRunner.query(
      `ALTER TABLE "order" ADD "paymentProofStatus" character varying(32)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "order" DROP COLUMN "paymentProofStatus"`,
    );
    await queryRunner.query(
      `ALTER TABLE "order" DROP COLUMN "paymentProofUploadedAt"`,
    );
    await queryRunner.query(
      `ALTER TABLE "order" DROP COLUMN "paymentProofSizeBytes"`,
    );
    await queryRunner.query(
      `ALTER TABLE "order" DROP COLUMN "paymentProofMimeType"`,
    );
    await queryRunner.query(
      `ALTER TABLE "order" DROP COLUMN "paymentProofKey"`,
    );
  }
}
