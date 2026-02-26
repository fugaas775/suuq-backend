import { SelectQueryBuilder } from 'typeorm';
import { Product } from '../../entities/product.entity';

export class ProductQueryBuilder {
  constructor(public query: SelectQueryBuilder<Product>) {
    this.query
      .leftJoinAndSelect('product.vendor', 'vendor')
      .leftJoinAndSelect('product.category', 'category')
      .where('product.status = :status', { status: 'publish' })
      .andWhere('product.isBlocked = false')
      .andWhere('product.deleted_at IS NULL');
  }

  applyGridView() {
    this.query.select([
      'product.id',
      'product.name',
      'product.price',
      'product.currency',
      'product.imageUrl',
      'product.averageRating',
      'product.ratingCount',
      'product.salesCount',
      'product.viewCount',
      'product.salePrice',
      'product.stockQuantity',
      'product.manageStock',
      'product.productType',
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
