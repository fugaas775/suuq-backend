import { DataSource } from 'typeorm';
import { CreditLimit } from '../src/credit/entities/credit-limit.entity';
import { User } from '../src/users/entities/user.entity';
import { CreditTransaction } from '../src/credit/entities/credit-transaction.entity';
import { config } from 'dotenv';
import { join } from 'path';

config({ path: join(__dirname, '../.env') });

const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  username: process.env.DB_USERNAME || 'suuq',
  password: process.env.DB_PASSWORD || 'suuq',
  database: process.env.DB_DATABASE || 'suuq',
  entities: [join(__dirname, '../src/**/*.entity.ts')],
  synchronize: false,
});

async function run() {
  await AppDataSource.initialize();
  const repo = AppDataSource.getRepository(CreditLimit);
  const userId = 128;

  const limit = await repo.findOne({ where: { user: { id: userId } } });

  if (limit) {
    console.log('--- Raw DB Entity ---');
    console.log('maxLimit:', limit.maxLimit, 'typeof:', typeof limit.maxLimit);
    console.log(
      'currentUsage:',
      limit.currentUsage,
      'typeof:',
      typeof limit.currentUsage,
    );

    const available = Number(limit.maxLimit) - Number(limit.currentUsage);
    console.log('--- Constructed Response ---');
    console.log('available:', available, 'typeof:', typeof available);
  } else {
    console.log('No limit found for user');
    // Default case simulation
    const def = {
      maxLimit: 0,
      available: 0,
    };
    console.log('--- Default Response ---');
    console.log('maxLimit:', def.maxLimit, 'typeof:', typeof def.maxLimit);
  }

  await AppDataSource.destroy();
}

run().catch(console.error);
