import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import { User } from './users/user.entity';
import { Product } from './products/entities/product.entity';
import { Category } from './categories/category.entity';
import { MediaEntity } from './media/media.entity';
import { Tag } from './tags/tag.entity';
import { DeviceToken } from './notifications/device-token.entity';

dotenv.config();

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432', 10),
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  entities: [User, Product, Category, MediaEntity, Tag, DeviceToken],
  migrations: [process.env.NODE_ENV === 'production' ? 'dist/migrations/*.js' : 'src/migrations/*.ts'],
  synchronize: false,
});

