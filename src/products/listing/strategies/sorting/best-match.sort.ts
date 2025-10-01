import { Injectable } from '@nestjs/common';
import { SelectQueryBuilder } from 'typeorm';
import { Product } from '../../../entities/product.entity';
import { ProductListingDto } from '../../dto/product-listing.dto';
import { ISortStrategy } from './base-sort.strategy';

@Injectable()
export class BestMatchSort implements ISortStrategy {
  apply(q: SelectQueryBuilder<Product>, dto: ProductListingDto) {
    if (dto.geoPriority) q.orderBy('geo_rank', 'DESC');
    q.addOrderBy('product.sales_count', 'DESC', 'NULLS LAST')
      .addOrderBy('product.average_rating', 'DESC', 'NULLS LAST')
      .addOrderBy('product.rating_count', 'DESC', 'NULLS LAST')
      .addOrderBy('product.createdAt', 'DESC');
    return q;
  }
}
