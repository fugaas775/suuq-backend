import { DataSource, DataSourceOptions } from 'typeorm';
import { User } from '../src/users/entities/user.entity';
import { Order } from '../src/orders/entities/order.entity';
import { Dispute } from '../src/orders/entities/dispute.entity';
import * as dotenv from 'dotenv';
import { Wallet } from '../src/wallet/entities/wallet.entity';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const rawUrl = process.env.DATABASE_URL;
const isPostgresUrl = rawUrl && /^postgres(ql)?:\/\//i.test(rawUrl);
const url = isPostgresUrl ? rawUrl : undefined;

const options: DataSourceOptions = {
  type: 'postgres',
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  username: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  synchronize: false,
  ssl: {
    rejectUnauthorized: false, // DigitalOcean managed DBs often need this
  },
  entities: [User, Order, Dispute, Wallet],
};

if (url) {
  delete (options as any).host;
  delete (options as any).port;
  delete (options as any).username;
  delete (options as any).password;
  delete (options as any).database;
  (options as any).url = url;
}

const AppDataSource = new DataSource(options);

async function run() {
  try {
    await AppDataSource.initialize();
    console.log('Database connected.');

    const runner = AppDataSource.createQueryRunner();

    // Check User table for flaggedForReview
    const userCols = await runner.getTable('user');
    const flaggedForReview = userCols?.columns.find(
      (c) => c.name === 'flaggedForReview',
    );
    console.log('User.flaggedForReview exists:', !!flaggedForReview);

    // Check Order table for deliveryAttemptCount
    const orderCols = await runner.getTable('order');
    const deliveryAttemptCount = orderCols?.columns.find(
      (c) => c.name === 'deliveryAttemptCount',
    );
    console.log('Order.deliveryAttemptCount exists:', !!deliveryAttemptCount);

    // Check Order Status Enum for 'DISPUTED'
    const [{ exists }] = await runner.query(`
      SELECT EXISTS (
        SELECT 1 FROM pg_enum 
        WHERE enumlabel = 'DISPUTED' 
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'order_status_enum')
      ) as "exists";
    `);
    console.log('OrderStatus.DISPUTED exists:', exists);

    // Check Dispute table
    const disputeTable = await runner.getTable('dispute');
    console.log('Dispute table exists:', !!disputeTable);

    await AppDataSource.destroy();
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

run();
