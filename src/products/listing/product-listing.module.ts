import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Product } from '../entities/product.entity';
import { Category } from '../../categories/entities/category.entity';
import { ProductListingService } from './product-listing.service';

@Module({
  imports: [TypeOrmModule.forFeature([Product, Category])],
  providers: [ProductListingService],
  exports: [ProductListingService],
})
export class ProductListingModule {}
