import * as dotenv from 'dotenv';
import { DataSource, DataSourceOptions } from 'typeorm';

dotenv.config();

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

export const dataSourceOptions: DataSourceOptions = url
  ? {
      type: 'postgres',
      url,
      entities: [__dirname + '/**/*.entity.{ts,js}'],
      migrations: [__dirname + '/migrations/*.{ts,js}'],
      synchronize: process.env.NODE_ENV === 'test',
      logging: process.env.NODE_ENV === 'development',
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
    };

const dataSource = new DataSource(dataSourceOptions);
export default dataSource;
