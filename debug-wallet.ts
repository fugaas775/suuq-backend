import { DataSource } from 'typeorm';
import { TopUpRequest } from './src/wallet/entities/top-up-request.entity';
import { User } from './src/users/entities/user.entity';
import { Wallet } from './src/wallet/entities/wallet.entity';
import { WalletTransaction } from './src/wallet/entities/wallet-transaction.entity';
import { Product } from './src/products/entities/product.entity';
import { Review } from './src/reviews/entities/review.entity';
import { config } from 'dotenv';

config();

const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  username: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_DATABASE || 'suuq',
  entities: [TopUpRequest, User, Wallet, WalletTransaction, Product, Review],
  synchronize: false,
});

async function run() {
  await AppDataSource.initialize();
  console.log('Database connected');

  const userId = 128;

  const wallet = await AppDataSource.getRepository(Wallet).findOne({
    where: { user: { id: userId } },
    relations: ['user'],
  });

  console.log('Wallet:', wallet);

  const transactions = await AppDataSource.getRepository(
    WalletTransaction,
  ).find({
    where: { wallet: { id: wallet?.id } },
    order: { createdAt: 'DESC' },
  });

  console.log('Transactions:', transactions);

  const topUps = await AppDataSource.getRepository(TopUpRequest).find({
    where: { user: { id: userId } },
    order: { createdAt: 'DESC' },
  });

  console.log('TopUps:', topUps);

  await AppDataSource.destroy();
}

run().catch((error) => console.log(error));
