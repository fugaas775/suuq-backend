import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddSubscriptionFieldsToUser1767600000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('user');
    if (table) {
      if (!table.findColumnByName('subscriptionTier')) {
        await queryRunner.addColumn(
          'user',
          new TableColumn({
            name: 'subscriptionTier',
            type: 'enum',
            enum: ['free', 'pro'],
            default: "'free'",
          }),
        );
      }
      if (!table.findColumnByName('subscriptionExpiry')) {
        await queryRunner.addColumn(
          'user',
          new TableColumn({
            name: 'subscriptionExpiry',
            type: 'timestamp',
            isNullable: true,
          }),
        );
      }
      if (!table.findColumnByName('autoRenew')) {
        await queryRunner.addColumn(
          'user',
          new TableColumn({
            name: 'autoRenew',
            type: 'boolean',
            default: true,
          }),
        );
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('user');
    if (table) {
      if (table.findColumnByName('autoRenew')) {
        await queryRunner.dropColumn('user', 'autoRenew');
      }
      if (table.findColumnByName('subscriptionExpiry')) {
        await queryRunner.dropColumn('user', 'subscriptionExpiry');
      }
      if (table.findColumnByName('subscriptionTier')) {
        await queryRunner.dropColumn('user', 'subscriptionTier');
      }
    }
  }
}
