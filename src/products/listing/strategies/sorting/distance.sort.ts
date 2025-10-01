import { Injectable } from '@nestjs/common';
import { SelectQueryBuilder } from 'typeorm';
import { Product } from '../../../entities/product.entity';
import { ProductListingDto } from '../../dto/product-listing.dto';
import { ISortStrategy } from './base-sort.strategy';

@Injectable()
export class DistanceSort implements ISortStrategy {
  constructor(private readonly dir: 'ASC' | 'DESC') {}
  apply(q: SelectQueryBuilder<Product>, dto: ProductListingDto) {
    if (dto.geoPriority) q.orderBy('geo_rank', 'DESC');
    q.addOrderBy('distance_km', this.dir, 'NULLS LAST');
    q.addOrderBy('product.createdAt', 'DESC');
    return q;
  }
}
