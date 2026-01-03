import { DataSource } from 'typeorm';
import { dataSourceOptions } from '../src/data-source';

async function checkState() {
  const dataSource = new DataSource(dataSourceOptions);
  await dataSource.initialize();

  console.log('Checking database state...');

  const runner = dataSource.createQueryRunner();

  const tableExists = await runner.hasTable('top_up_request');
  console.log(`Table 'top_up_request' exists: ${tableExists}`);

  const migrations = await runner.query(
    'SELECT * FROM migrations ORDER BY id DESC LIMIT 5',
  );
  console.log(
    'Last 5 migrations:',
    migrations.map((m: any) => m.name),
  );

  const typeExists = await runner.query(`
    SELECT EXISTS (
      SELECT 1 FROM pg_type WHERE typname = 'top_up_request_status_enum'
    );
  `);
  console.log(
    `Type 'top_up_request_status_enum' exists: ${typeExists[0].exists}`,
  );

  await dataSource.destroy();
}

checkState().catch(console.error);
