import * as dotenv from 'dotenv';
import { DataSource, DataSourceOptions } from 'typeorm';

dotenv.config({ quiet: true });

// Prefer single DATABASE_URL when provided (e.g., CI), otherwise use discrete vars.
// Some environments expose a non-Postgres DATABASE_URL (e.g., MySQL) which would break pg protocol.
const rawUrl = process.env.DATABASE_URL;
const isPostgresUrl = rawUrl && /^postgres(ql)?:\/\//i.test(rawUrl);
if (rawUrl && !isPostgresUrl) {
  // Warn early; continue with discrete variables instead of invalid URL
  // eslint-disable-next-line no-console
  console.warn(
    `Ignoring DATABASE_URL with non-postgres scheme: ${rawUrl.split('?')[0]}. Falling back to discrete DB_* env vars.`,
  );
}
const url = isPostgresUrl ? rawUrl : undefined;

const __cacheEnabled = String(
  process.env.TYPEORM_CACHE_ENABLED || process.env.TYPEORM_QUERY_CACHE_ENABLED || 'false',
)
  .toLowerCase()
  .trim() === 'true';
const __cacheDuration = parseInt(
  process.env.TYPEORM_CACHE_TTL_MS || process.env.TYPEORM_QUERY_CACHE_TTL_MS || '30000',
  10,
);
const __redisUrl = process.env.REDIS_URL || '';
const __cacheConfig: any = __cacheEnabled
  ? (__redisUrl
      ? { type: 'ioredis', options: { url: __redisUrl }, duration: __cacheDuration }
      : { duration: __cacheDuration })
  : undefined;

export const dataSourceOptions: DataSourceOptions = url
  ? {
      type: 'postgres',
      url,
      entities: [__dirname + '/**/*.entity.{ts,js}'],
      migrations: [__dirname + '/migrations/*.{ts,js}'],
      synchronize: process.env.NODE_ENV === 'test',
      logging: process.env.NODE_ENV === 'development',
      maxQueryExecutionTime: parseInt(process.env.DB_SLOW_MS || '300', 10),
      cache: __cacheConfig,
      extra: {
        max: parseInt(process.env.DB_POOL_MAX || '10', 10),
        idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT_MS || '10000', 10),
        connectionTimeoutMillis: parseInt(process.env.DB_CONNECT_TIMEOUT_MS || '5000', 10),
        statement_timeout: parseInt(process.env.DB_STATEMENT_TIMEOUT_MS || '15000', 10),
      },
    }
  : {
      type: 'postgres',
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT || '5432'),
      username: process.env.DB_USERNAME,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_DATABASE,
      entities: [__dirname + '/**/*.entity.{ts,js}'],
      migrations: [__dirname + '/migrations/*.{ts,js}'],
      synchronize: process.env.NODE_ENV === 'test',
      logging: process.env.NODE_ENV === 'development',
      maxQueryExecutionTime: parseInt(process.env.DB_SLOW_MS || '300', 10),
      cache: __cacheConfig,
      extra: {
        max: parseInt(process.env.DB_POOL_MAX || '10', 10),
        idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT_MS || '10000', 10),
        connectionTimeoutMillis: parseInt(process.env.DB_CONNECT_TIMEOUT_MS || '5000', 10),
        statement_timeout: parseInt(process.env.DB_STATEMENT_TIMEOUT_MS || '15000', 10),
      },
    };

const dataSource = new DataSource(dataSourceOptions);
export default dataSource;
