import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableForeignKey,
} from 'typeorm';

export class CreatePayoutLog1769880000000 implements MigrationInterface {
  name = 'CreatePayoutLog1769880000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'payout_log',
        columns: [
          {
            name: 'id',
            type: 'int',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'increment',
          },
          {
            name: 'vendorId', // Maps to @ManyToOne vendor -> vendorId in DB
            type: 'int',
            isNullable: false,
          },
          {
            name: 'provider',
            type: 'enum',
            enum: ['EBIRR', 'MPESA', 'TELEBIRR'],
            default: "'EBIRR'",
          },
          {
            name: 'amount',
            type: 'decimal',
            precision: 10,
            scale: 2,
            isNullable: false,
          },
          {
            name: 'currency',
            type: 'varchar',
            length: '3',
            isNullable: false,
          },
          {
            name: 'phoneNumber',
            type: 'varchar',
            isNullable: false,
          },
          {
            name: 'transactionReference',
            type: 'varchar',
            isNullable: false,
          },
          {
            name: 'status',
            type: 'enum',
            enum: ['PENDING', 'SUCCESS', 'FAILED'],
            default: "'SUCCESS'",
          },
          {
            name: 'orderId',
            type: 'int',
            isNullable: true,
          },
          {
            name: 'orderItemId',
            type: 'int',
            isNullable: true,
          },
          {
            name: 'failureReason',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'createdAt',
            type: 'timestamp',
            default: 'now()',
          },
        ],
      }),
      true,
    );

    await queryRunner.createForeignKey(
      'payout_log',
      new TableForeignKey({
        columnNames: ['vendorId'],
        referencedColumnNames: ['id'],
        referencedTableName: 'user',
        onDelete: 'CASCADE',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('payout_log');
    if (table) {
      const foreignKey = table.foreignKeys.find(
        (fk) => fk.columnNames.indexOf('vendorId') !== -1,
      );
      if (foreignKey) {
        await queryRunner.dropForeignKey('payout_log', foreignKey);
      }
    }
    await queryRunner.dropTable('payout_log');
  }
}
