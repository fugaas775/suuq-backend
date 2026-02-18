import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddDeliveryCodeToOrder1770299411309 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'order',
      new TableColumn({
        name: 'deliveryCodeHash',
        type: 'varchar',
        isNullable: true,
      }),
    );
    await queryRunner.addColumn(
      'order',
      new TableColumn({
        name: 'deliveryAttemptCount',
        type: 'int',
        default: 0,
      }),
    );
    await queryRunner.addColumn(
      'order',
      new TableColumn({
        name: 'proofOfDeliveryUrl',
        type: 'varchar',
        isNullable: true,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('order', 'proofOfDeliveryUrl');
    await queryRunner.dropColumn('order', 'deliveryAttemptCount');
    await queryRunner.dropColumn('order', 'deliveryCodeHash');
  }
}
