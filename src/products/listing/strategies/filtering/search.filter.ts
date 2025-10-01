import { Injectable } from '@nestjs/common';
import { SelectQueryBuilder } from 'typeorm';
import { Product } from '../../../entities/product.entity';
import { ProductListingDto } from '../../dto/product-listing.dto';
import { IFilterStrategy } from './base-filter.strategy';

@Injectable()
export class SearchFilter implements IFilterStrategy {
  apply(
    query: SelectQueryBuilder<Product>,
    dto: ProductListingDto,
  ): SelectQueryBuilder<Product> {
    if (dto.search) {
      query.andWhere('product.name ILIKE :search', {
        search: `%${dto.search}%`,
      });
    }
    return query;
  }
}
