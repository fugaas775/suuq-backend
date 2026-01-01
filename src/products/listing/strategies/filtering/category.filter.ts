import { Injectable } from '@nestjs/common';
import { SelectQueryBuilder, TreeRepository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Product } from '../../../entities/product.entity';
import { Category } from '../../../../categories/entities/category.entity';
import { ProductListingDto } from '../../dto/product-listing.dto';
import { IFilterStrategy } from './base-filter.strategy';

@Injectable()
export class CategoryFilter implements IFilterStrategy {
  constructor(
    @InjectRepository(Category)
    private readonly categoryRepository: TreeRepository<Category>,
  ) {}

  async apply(
    query: SelectQueryBuilder<Product>,
    dto: ProductListingDto,
  ): Promise<SelectQueryBuilder<Product>> {
    const { categoryId, categorySlug, includeDescendants, categoryFirst } = dto;

    if (!categoryId?.length && !categorySlug) {
      return query;
    }

    // If categoryFirst is enabled, the pagination strategy handles the filtering.
    if (categoryFirst) {
      return query;
    }

    let idsToFilter = categoryId || [];

    if (includeDescendants) {
      const baseIds = [...(categoryId || [])];
      if (categorySlug) {
        const cat = await this.categoryRepository.findOne({
          where: { slug: categorySlug },
        });
        if (cat) {
          baseIds.push(cat.id);
        }
      }

      if (baseIds.length) {
        const idSet = new Set<number>();
        for (const id of baseIds) {
          const root = await this.categoryRepository.findOne({ where: { id } });
          if (root) {
            const descendants =
              await this.categoryRepository.findDescendants(root);
            descendants.forEach((d) => idSet.add(d.id));
          }
        }
        idsToFilter = Array.from(idSet);
      }
    } else if (categorySlug && !idsToFilter.length) {
      const cat = await this.categoryRepository.findOne({
        where: { slug: categorySlug },
      });
      if (cat) {
        idsToFilter.push(cat.id);
      }
    }

    if (idsToFilter.length > 0) {
      query.andWhere('category.id IN (:...categoryIds)', {
        categoryIds: idsToFilter,
      });
    }

    return query;
  }
}
