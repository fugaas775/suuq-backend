import { MigrationInterface, QueryRunner } from 'typeorm';

export class RenameDeliveryCodeHash1770299900000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.renameColumn('order', 'deliveryCodeHash', 'deliveryCode');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.renameColumn('order', 'deliveryCode', 'deliveryCodeHash');
  }
}
