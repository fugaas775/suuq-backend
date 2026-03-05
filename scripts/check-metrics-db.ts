import 'reflect-metadata';
import dataSource from '../src/data-source';

async function run() {
  await dataSource.initialize();

  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

  const legacyCount = await dataSource.query(
    `SELECT COUNT(*) FROM product_impression WHERE "createdAt" > $1`,
    [oneHourAgo],
  );

  const newCount = await dataSource.query(
    `SELECT COUNT(*) FROM feed_interactions WHERE "createdAt" > $1`,
    [oneHourAgo],
  );

  console.log('--- Metrics (Last 1 Hour) ---');
  console.log(
    `Legacy Impressions (/api/products/impressions): ${legacyCount[0].count}`,
  );
  console.log(
    `New Feed Interactions (/api/v2/metrics/feed-interaction): ${newCount[0].count}`,
  );

  await dataSource.destroy();
}

run().catch(console.error);
