import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Product } from './entities/product.entity';
import { ProductImage } from './entities/product-image.entity';
import { UsersModule } from '../users/users.module';
import { User } from '../users/entities/user.entity';
import { Order } from '../orders/entities/order.entity'; 
import { Tag } from '../tags/tag.entity';
import { ProductsService } from './products.service';
import { ProductsController } from './products.controller';
import { CurrencyModule } from '../common/services/currency.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Product,
      ProductImage,   // Needed for ProductImageRepository injection
      User,           // Needed for UserRepository injection
      Order,          // Needed for OrderRepository injection
      Tag,
      // Review,            // Needed for TagRepository injection
    ]),
    CurrencyModule,
    forwardRef(() => UsersModule),
  ],
  providers: [ProductsService],
  controllers: [ProductsController],
  exports: [ProductsService],
})
export class ProductsModule {}