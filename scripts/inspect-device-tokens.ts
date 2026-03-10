import 'reflect-metadata';
import dataSource from '../src/data-source';

async function main() {
  await dataSource.initialize();
  const runner = dataSource.createQueryRunner();
  await runner.connect();

  const rows = await runner.query(
    'SELECT "userId", platform, LEFT(token, 20) AS token_prefix, LENGTH(token) AS token_len, "createdAt" FROM device_tokens WHERE "userId" IN (128, 1232) ORDER BY "createdAt" DESC LIMIT 50',
  );

  console.log(rows);

  await runner.release();
  await dataSource.destroy();
}

main().catch(async (err) => {
  console.error('inspect-device-tokens failed', err);
  await dataSource.destroy().catch(() => undefined);
  process.exit(1);
});
