import { Injectable } from '@nestjs/common';
import { SelectQueryBuilder } from 'typeorm';
import { Product } from '../../../entities/product.entity';
import { ProductListingDto } from '../../dto/product-listing.dto';
import { IFilterStrategy } from './base-filter.strategy';

@Injectable()
export class PropertyFilter implements IFilterStrategy {
  apply(
    query: SelectQueryBuilder<Product>,
    dto: ProductListingDto,
  ): SelectQueryBuilder<Product> {
    const {
      listingType,
      listingTypeMode,
      bedrooms,
      bedroomsMin,
      bedroomsMax,
      city,
      userCity,
    } = dto;

    if (listingType) {
      if (listingTypeMode === 'priority') {
        query.addSelect(
          `CASE WHEN product.listing_type = :lt THEN 1 ELSE 0 END`,
          'lt_priority_rank',
        );
        query.addOrderBy('lt_priority_rank', 'DESC');
        query.setParameter('lt', listingType);
      } else {
        query.andWhere('product.listing_type = :lt', { lt: listingType });
      }
    }

    if (bedrooms !== undefined) {
      query.andWhere('product.bedrooms = :br', { br: bedrooms });
    }
    if (bedroomsMin !== undefined) {
      query.andWhere('product.bedrooms >= :brMin', { brMin: bedroomsMin });
    }
    if (bedroomsMax !== undefined) {
      query.andWhere('product.bedrooms <= :brMax', { brMax: bedroomsMax });
    }

    const listingCity = city || (listingType ? userCity : undefined);
    if (listingCity) {
      query.andWhere('LOWER(product.listing_city) = LOWER(:listingCity)', {
        listingCity,
      });
    }

    return query;
  }
}
