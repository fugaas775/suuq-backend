import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
dotenv.config();

const dataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  username: process.env.DB_USERNAME || 'suuquser',
  password: process.env.DB_PASSWORD || 'wDaUYUrxNKtII8hh',
  database: process.env.DB_DATABASE || 'suuqdb',
  ssl: false, // Localhost usually isn't SSL
});

async function run() {
  try {
    await dataSource.initialize();
    const runner = dataSource.createQueryRunner();
    const result = await runner.query(`
      SELECT column_name, data_type, udt_name
      FROM information_schema.columns 
      WHERE table_name = 'user' AND column_name = 'roles';
    `);
    console.log('User roles column info:', result);
    await dataSource.destroy();
  } catch (error) {
    console.error(error);
  }
}

run();
