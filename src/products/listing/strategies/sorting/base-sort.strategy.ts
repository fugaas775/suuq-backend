import { SelectQueryBuilder } from 'typeorm';
import { Product } from '../../../entities/product.entity';
import { ProductListingDto } from '../../dto/product-listing.dto';

export interface ISortStrategy {
  apply(
    query: SelectQueryBuilder<Product>,
    dto: ProductListingDto,
  ): SelectQueryBuilder<Product>;
}
