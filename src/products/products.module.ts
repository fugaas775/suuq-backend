import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Product } from './entities/product.entity';
import { ProductImage } from './entities/product-image.entity';
import { UsersModule } from '../users/users.module';
import { User } from '../users/entities/user.entity';
import { Order } from '../orders/entities/order.entity';
import { Tag } from '../tags/tag.entity';
import { Category } from '../categories/entities/category.entity'; // 1. Import the Category entity
import { ProductImpression } from './entities/product-impression.entity';
import { SearchKeyword } from './entities/search-keyword.entity';
import { ProductsService } from './products.service';
import { ProductsController } from './products.controller';
import { CurrencyModule } from '../common/services/currency.module';
import { MediaModule } from '../media/media.module';
import { AuditModule } from '../audit/audit.module';
import { HomeModule } from '../home/home.module';
import { FavoritesModule } from '../favorites/favorites.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Product,
      ProductImage,
      User,
      Order,
      Tag,
      Category, // ✅ 2. Add the Category entity here
      ProductImpression,
      SearchKeyword,
    ]),
    CurrencyModule,
    forwardRef(() => UsersModule),
  forwardRef(() => HomeModule),
  MediaModule,
  AuditModule,
  FavoritesModule,
  ],
  providers: [ProductsService],
  controllers: [ProductsController],
  exports: [ProductsService],
})
export class ProductsModule {}
