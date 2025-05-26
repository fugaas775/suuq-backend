// src/data-source.ts
import { DataSource } from 'typeorm';
import { Product } from './products/entities/product.entity';
import { User } from './users/user.entity';
import { Category } from './categories/category.entity';
import { MediaEntity } from './media/media.entity';
import { Tag } from './tags/tag.entity';
import * as dotenv from 'dotenv';

dotenv.config();

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432', 10),
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  entities: [Product, User, Category, MediaEntity, Tag],
  migrations: ['src/migrations/*.ts'],
  synchronize: false,
});
