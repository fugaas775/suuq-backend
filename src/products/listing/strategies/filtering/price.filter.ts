import { Injectable } from '@nestjs/common';
import { SelectQueryBuilder } from 'typeorm';
import { Product } from '../../../entities/product.entity';
import { ProductListingDto } from '../../dto/product-listing.dto';
import { IFilterStrategy } from './base-filter.strategy';

@Injectable()
export class PriceFilter implements IFilterStrategy {
  apply(
    query: SelectQueryBuilder<Product>,
    dto: ProductListingDto,
  ): SelectQueryBuilder<Product> {
    if (dto.priceMin !== undefined) {
      query.andWhere('product.price >= :priceMin', { priceMin: dto.priceMin });
    }
    if (dto.priceMax !== undefined) {
      query.andWhere('product.price <= :priceMax', { priceMax: dto.priceMax });
    }
    return query;
  }
}
