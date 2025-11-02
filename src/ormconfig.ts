import * as dotenv from 'dotenv';
import { DataSource, DataSourceOptions } from 'typeorm';

dotenv.config();

const cacheEnabled = String(
  process.env.TYPEORM_CACHE_ENABLED || process.env.TYPEORM_QUERY_CACHE_ENABLED || 'false',
)
  .toLowerCase()
  .trim() === 'true';
const cacheDuration = parseInt(
  process.env.TYPEORM_CACHE_TTL_MS || process.env.TYPEORM_QUERY_CACHE_TTL_MS || '30000',
  10,
);
const redisUrl = process.env.REDIS_URL || '';
const cacheConfig: any = cacheEnabled
  ? (redisUrl
      ? { type: 'ioredis', options: { url: redisUrl }, duration: cacheDuration }
      : { duration: cacheDuration })
  : undefined;

export const dataSourceOptions: DataSourceOptions = {
  type: 'postgres',
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432'),
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  entities: [__dirname + '/**/*.entity.{ts,js}'],
  migrations: [__dirname + '/migrations/*.{ts,js}'],
  synchronize: process.env.NODE_ENV === 'test' ? true : false, // true in tests, false otherwise
  logging: process.env.NODE_ENV === 'development', // Only log queries in development
  maxQueryExecutionTime: parseInt(process.env.DB_SLOW_MS || '300', 10),
  cache: cacheConfig,
  extra: {
    // pg pool options
    max: parseInt(process.env.DB_POOL_MAX || '10', 10),
    idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT_MS || '10000', 10),
    connectionTimeoutMillis: parseInt(process.env.DB_CONNECT_TIMEOUT_MS || '5000', 10),
    statement_timeout: parseInt(process.env.DB_STATEMENT_TIMEOUT_MS || '15000', 10),
  },
};

const dataSource = new DataSource(dataSourceOptions);
export default dataSource;
