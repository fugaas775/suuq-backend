import { Injectable } from '@nestjs/common';
import { SelectQueryBuilder } from 'typeorm';
import { Product } from '../../../entities/product.entity';
import { ProductListingDto } from '../../dto/product-listing.dto';
import { IFilterStrategy } from './base-filter.strategy';

@Injectable()
export class VendorFilter implements IFilterStrategy {
  apply(
    query: SelectQueryBuilder<Product>,
    dto: ProductListingDto,
  ): SelectQueryBuilder<Product> {
    if (dto.vendorId) {
      query.andWhere('vendor.id = :vendorId', { vendorId: dto.vendorId });
    }
    return query;
  }
}
