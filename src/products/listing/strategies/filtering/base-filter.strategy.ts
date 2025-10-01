import { SelectQueryBuilder } from 'typeorm';
import { Product } from '../../../entities/product.entity';
import { ProductListingDto } from '../../dto/product-listing.dto';

export interface IFilterStrategy {
  apply(
    query: SelectQueryBuilder<Product>,
    dto: ProductListingDto,
  ): SelectQueryBuilder<Product> | Promise<SelectQueryBuilder<Product>>;
}
