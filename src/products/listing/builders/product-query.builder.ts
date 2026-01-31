import { SelectQueryBuilder } from 'typeorm';
import { Product } from '../../entities/product.entity';

export class ProductQueryBuilder {
  constructor(public query: SelectQueryBuilder<Product>) {
    this.query
      .leftJoinAndSelect('product.vendor', 'vendor')
      .leftJoinAndSelect('product.category', 'category')
      .where('product.status = :status', { status: 'publish' })
      .andWhere('product.isBlocked = false');
  }

  applyGridView() {
    this.query.select([
      'product.id',
      'product.name',
      'product.price',
      'product.currency',
      'product.imageUrl',
      'product.average_rating',
      'product.rating_count',
      'product.sales_count',
      'product.viewCount',
      'product.listingType',
      'product.bedrooms',
      'product.listingCity',
      'product.createdAt',
      'product.featured',
      'product.featuredExpiresAt',
      'vendor.id',
      'vendor.storeName',
      'vendor.displayName',
      'vendor.verified',
      'category.id',
      'category.slug',
    ]);
  }

  async execute(
    page: number,
    perPage: number,
  ): Promise<{ items: Product[]; total: number }> {
    const [items, total] = await this.query
      .skip((page - 1) * perPage)
      .take(perPage)
      .getManyAndCount();

    return { items, total };
  }
}
