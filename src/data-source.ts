import * as dotenv from 'dotenv';
import { DataSource, DataSourceOptions } from 'typeorm';

dotenv.config();

// Prefer single DATABASE_URL when provided (e.g., CI), otherwise use discrete vars
const url = process.env.DATABASE_URL;
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
