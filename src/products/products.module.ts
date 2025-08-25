import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Product } from './entities/product.entity';
import { ProductImage } from './entities/product-image.entity';
import { UsersModule } from '../users/users.module';
import { User } from '../users/entities/user.entity';
import { Order } from '../orders/entities/order.entity'; 
import { Tag } from '../tags/tag.entity';
import { Category } from '../categories/entities/category.entity'; // 1. Import the Category entity
import { ProductsService } from './products.service';
import { ProductsController } from './products.controller';
import { CurrencyModule } from '../common/services/currency.module';
import { HomeModule } from '../home/home.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Product,
      ProductImage,
      User,
      Order,
      Tag,
      Category, // ✅ 2. Add the Category entity here
    ]),
    CurrencyModule,
  forwardRef(() => UsersModule),
  forwardRef(() => HomeModule),
  ],
  providers: [ProductsService],
  controllers: [ProductsController],
  exports: [ProductsService],
})
export class ProductsModule {}