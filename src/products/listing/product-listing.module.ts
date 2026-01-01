import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Product } from '../entities/product.entity';
import { Category } from '../../categories/entities/category.entity';
import { ProductListingService } from './product-listing.service';
import { CurrencyModule } from '../../common/services/currency.module';

@Module({
  imports: [TypeOrmModule.forFeature([Product, Category]), CurrencyModule],
  providers: [ProductListingService],
  exports: [ProductListingService],
})
export class ProductListingModule {}
