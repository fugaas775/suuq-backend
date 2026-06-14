import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateSearchLog1759400000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'search_log',
        columns: [
          {
            name: 'id',
            type: 'int',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'increment',
          },
          { name: 'query', type: 'varchar', length: '256', isNullable: false },
          { name: 'result_count', type: 'int', default: 0 },
          { name: 'source', type: 'varchar', length: '64', isNullable: true },
          { name: 'category_id', type: 'int', isNullable: true },
          { name: 'city', type: 'varchar', length: '128', isNullable: true },
          { name: 'user_id', type: 'int', isNullable: true },
          {
            name: 'ip_address',
            type: 'varchar',
            length: '64',
            isNullable: true,
          },
          {
            name: 'user_agent',
            type: 'varchar',
            length: '256',
            isNullable: true,
          },
          {
            name: 'created_at',
            type: 'timestamp with time zone',
            default: 'now()',
          },
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      'search_log',
      new TableIndex({
        name: 'idx_search_log_query',
        columnNames: ['query'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropIndex('search_log', 'idx_search_log_query');
    await queryRunner.dropTable('search_log');
  }
}
