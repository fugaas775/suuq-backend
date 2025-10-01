import { Injectable } from '@nestjs/common';
import { SelectQueryBuilder } from 'typeorm';
import { Product } from '../../../entities/product.entity';
import { ProductListingDto } from '../../dto/product-listing.dto';
import { ISortStrategy } from './base-sort.strategy';

@Injectable()
export class PriceSort implements ISortStrategy {
  apply(q: SelectQueryBuilder<Product>, dto: ProductListingDto) {
    if (dto.geoPriority) q.orderBy('geo_rank', 'DESC');
    if (dto.sort === 'price_asc') {
      q.addOrderBy('product.price', 'ASC', 'NULLS LAST');
    } else {
      q.addOrderBy('product.price', 'DESC', 'NULLS LAST');
    }
    return q;
  }
}
