import { DataSource } from 'typeorm';
import { TopUpRequest } from './src/wallet/entities/top-up-request.entity';
import { User } from './src/users/entities/user.entity';
import { Wallet } from './src/wallet/entities/wallet.entity';
import { WalletTransaction } from './src/wallet/entities/wallet-transaction.entity';
import { Withdrawal } from './src/withdrawals/entities/withdrawal.entity';
import { config } from 'dotenv';

config();

const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT) || 5432,
  username: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_DATABASE || 'suuq',
  entities: [TopUpRequest, User, Wallet, WalletTransaction, Withdrawal],
  synchronize: false,
});

async function run() {
  await AppDataSource.initialize();
  console.log('Database connected');

  const topUps = await AppDataSource.getRepository(TopUpRequest).find({
    relations: ['user'],
    order: { createdAt: 'DESC' },
    take: 5,
  });

  console.log('Recent TopUp Requests:');
  topUps.forEach((t) => {
    console.log(
      `ID: ${t.id}, Amount: ${t.amount}, Status: ${t.status}, User ID: ${t.user?.id}, Email: ${t.user?.email}, Name: ${t.user?.displayName}`,
    );
  });

  await AppDataSource.destroy();
}

run().catch((error) => console.log(error));
