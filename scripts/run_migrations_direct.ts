import dataSource from '../src/data-source';

async function run() {
  console.log('Initializing DataSource...');
  await dataSource.initialize();
  console.log('Running migrations...');
  const migrations = await dataSource.runMigrations();
  console.log(`Executed ${migrations.length} migrations.`);
  if (migrations.length > 0) {
    migrations.forEach((m) => console.log(`- ${m.name}`));
  }
  await dataSource.destroy();
  process.exit(0);
}

run().catch((err) => {
  console.error('Migration failed', err);
  process.exit(1);
});
