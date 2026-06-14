import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddFeeBreakdownColumns1770299411308 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'order_item',
      new TableColumn({
        name: 'platformFee',
        type: 'decimal',
        precision: 10,
        scale: 2,
        default: 0,
      }),
    );
    await queryRunner.addColumn(
      'order_item',
      new TableColumn({
        name: 'gatewayFee',
        type: 'decimal',
        precision: 10,
        scale: 2,
        default: 0,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('order_item', 'gatewayFee');
    await queryRunner.dropColumn('order_item', 'platformFee');
  }
}
