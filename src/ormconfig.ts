// src/ormconfig.ts

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
import { Review } from './reviews/entities/review.entity';
import { Order } from './orders/entities/order.entity';
import { Withdrawal } from './withdrawals/entities/withdrawal.entity';
import { Cart, CartItem } from './cart/entities/cart.entity';

dotenv.config();

export default new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432', 10),
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  entities: [
    // All entities are now restored
    User,
    Product,
    Category,
    MediaEntity,
    Tag,
    DeviceToken,
    ProductImage,
    UserSettings,
    Review,
    Order,
    Withdrawal,
    Cart,
    CartItem,
  ],
  migrations: ['src/migrations/*.ts'],
  synchronize: false,
});