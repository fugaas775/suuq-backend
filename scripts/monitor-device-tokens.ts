import 'reflect-metadata';
import dataSource from '../src/data-source';

async function main() {
  await dataSource.initialize();
  const runner = dataSource.createQueryRunner();
  await runner.connect();

  const [{ tokens, distinct_tokens: distinctTokens }] = await runner.query(
    'SELECT COUNT(*)::int AS tokens, COUNT(DISTINCT token)::int AS distinct_tokens FROM device_tokens',
  );

  const duplicates = await runner.query(
    'SELECT token, COUNT(*)::int AS cnt, ARRAY_AGG(user_id) AS users FROM device_tokens GROUP BY token HAVING COUNT(*) > 1 ORDER BY cnt DESC LIMIT 20',
  );

  console.log('[device_tokens] totals:', {
    tokens,
    distinctTokens,
    duplicates: duplicates.length,
  });

  if (duplicates.length) {
    console.log('[device_tokens] sample duplicate tokens:', duplicates);
  }

  await runner.release();
  await dataSource.destroy();
}

main().catch((err) => {
  console.error('monitor-device-tokens failed', err);
  dataSource.destroy().catch(() => undefined);
  process.exit(1);
});
