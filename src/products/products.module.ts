import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Product } from './entities/product.entity';
import { ProductImage } from './entities/product-image.entity';
import { User } from '../users/entities/user.entity'; // <-- FIXED IMPORT
import { Order } from '../orders/entities/order.entity'; // <-- FIXED IMPORT
import { Tag } from '../tags/tag.entity';
import { ProductsService } from './products.service';
import { ProductsController } from './products.controller';
import { Review } from '../reviews/entities/review.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Product,
      ProductImage,   // Needed for ProductImageRepository injection
      User,           // Needed for UserRepository injection
      Order,          // Needed for OrderRepository injection
      Tag,
      Review,            // Needed for TagRepository injection
    ]),
  ],
  providers: [ProductsService],
  controllers: [ProductsController],
  exports: [ProductsService],
})
export class ProductsModule {}