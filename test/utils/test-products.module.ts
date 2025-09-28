import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Product } from '../../src/products/entities/product.entity';
import { Category } from '../../src/categories/entities/category.entity';
import { User } from '../../src/users/entities/user.entity';
import { Tag } from '../../src/tags/tag.entity';
import { ProductImage } from '../../src/products/entities/product-image.entity';
import { ProductsService } from '../../src/products/products.service';
import { ProductsController } from '../../src/products/products.controller';
import { ProductImpression } from '../../src/products/entities/product-impression.entity';
import { SearchKeyword } from '../../src/products/entities/search-keyword.entity';
import { FavoritesModule } from '../../src/favorites/favorites.module';
import { CurrencyModule } from '../../src/common/services/currency.module';
import { HomeModule } from '../../src/home/home.module';
import { UsersModule } from '../../src/users/users.module';
import { Order } from '../../src/orders/entities/order.entity';
import { MediaModule } from '../../src/media/media.module';
import { AuditModule } from '../../src/audit/audit.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Product,
      Category,
      User,
      Tag,
      ProductImage,
      ProductImpression,
      SearchKeyword,
      Order,
    ]),
    FavoritesModule,
    CurrencyModule,
    HomeModule,
    UsersModule,
    MediaModule,
    AuditModule,
  ],
  controllers: [ProductsController],
  providers: [ProductsService],
})
export class TestProductsModule {}
