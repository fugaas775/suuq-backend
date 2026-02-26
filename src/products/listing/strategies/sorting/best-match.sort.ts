import { Injectable } from '@nestjs/common';
import { SelectQueryBuilder } from 'typeorm';
import { Product } from '../../../entities/product.entity';
import { ProductListingDto } from '../../dto/product-listing.dto';
import { ISortStrategy } from './base-sort.strategy';

@Injectable()
export class BestMatchSort implements ISortStrategy {
  apply(q: SelectQueryBuilder<Product>, dto: ProductListingDto) {
    if (dto.geoPriority) q.orderBy('geo_rank', 'DESC');
    q.addOrderBy('product.salesCount', 'DESC', 'NULLS LAST')
      .addOrderBy('product.averageRating', 'DESC', 'NULLS LAST')
      .addOrderBy('product.ratingCount', 'DESC', 'NULLS LAST')
      .addOrderBy('product.createdAt', 'DESC');
    return q;
  }
}
