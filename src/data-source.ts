import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import { User } from './users/entities/user.entity';
import { Product } from './products/entities/product.entity';
import { Category } from './categories/entities/category.entity';
import { MediaEntity } from './media/entities/media.entity'; 
import { Tag } from './tags/tag.entity';
import { DeviceToken } from './notifications/entities/device-token.entity';
import { ProductImage } from './products/entities/product-image.entity';
import { UserSettings } from './settings/entities/user-settings.entity';

dotenv.config();

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432', 10),
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  entities: [
  User,
  Product,
  Category,
  MediaEntity,
  Tag,
  DeviceToken,
  ProductImage,
  UserSettings
],
  migrations: [process.env.NODE_ENV === 'production' ? 'dist/migrations/*.js' : 'src/migrations/*.ts'],
  synchronize: false,
});