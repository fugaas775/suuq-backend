import { Product } from '../../../entities/product.entity';

export interface IPaginationStrategy {
  execute(
    page: number,
    perPage: number,
  ): Promise<{ items: Product[]; total: number }>;
}
