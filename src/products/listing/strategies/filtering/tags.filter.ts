import { Injectable } from '@nestjs/common';
import { SelectQueryBuilder } from 'typeorm';
import { Product } from '../../../entities/product.entity';
import { ProductListingDto } from '../../dto/product-listing.dto';
import { IFilterStrategy } from './base-filter.strategy';

@Injectable()
export class TagsFilter implements IFilterStrategy {
  apply(
    query: SelectQueryBuilder<Product>,
    dto: ProductListingDto,
  ): SelectQueryBuilder<Product> {
    if (dto.tags?.length) {
      query.innerJoin(
        'product.tags',
        'tagFilter',
        'tagFilter.name IN (:...tagList)',
        { tagList: dto.tags },
      );
    }
    return query;
  }
}
