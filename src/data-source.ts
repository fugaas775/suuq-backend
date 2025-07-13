import { DataSource, DataSourceOptions } from 'typeorm';
import { config } from 'dotenv';

config(); // Load .env file

export const AppDataSource = new DataSource({
  type: 'postgres',
  ssl: { rejectUnauthorized: false },
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432', 10),
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  synchronize: false,
  entities: ['dist/**/*.entity.js'], // Important: Point to compiled JS files
  migrations: ['dist/migrations/*.js'],
  migrationsTableName: 'migrations',
} as DataSourceOptions);