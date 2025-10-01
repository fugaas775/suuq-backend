import { Injectable } from '@nestjs/common';
import { SelectQueryBuilder, TreeRepository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Product } from '../../../entities/product.entity';
import { ProductListingDto } from '../../dto/product-listing.dto';
import { IFilterStrategy } from './base-filter.strategy';
import { Category } from '../../../../categories/entities/category.entity';

@Injectable()
export class GeoPriorityAugment implements IFilterStrategy {
  constructor(
    @InjectRepository(Category)
    private readonly categoryRepo: TreeRepository<Category>,
  ) {}

  private static cache: { ids: number[]; at: number } | null = null;

  private async getPropertySubtreeIds(): Promise<number[]> {
    const now = Date.now();
    if (GeoPriorityAugment.cache && now - GeoPriorityAugment.cache.at < 5 * 60 * 1000) {
      return GeoPriorityAugment.cache.ids;
    }
    // Find roots by slug pattern and collect descendants
    const roots = await this.categoryRepo
      .createQueryBuilder('c')
      .where('c.slug ILIKE :p1 OR c.slug ~* :p2', { p1: '%property%', p2: 'real[-_ ]?estate' })
      .getMany()
      .catch(() => [] as Category[]);
    const idSet = new Set<number>();
    for (const root of roots) {
      try {
        const descs = await this.categoryRepo.findDescendants(root);
        for (const d of descs) idSet.add(d.id);
      } catch {
        if (root?.id) idSet.add(root.id);
      }
    }
    const ids = Array.from(idSet);
    GeoPriorityAugment.cache = { ids, at: now };
    return ids;
  }

  async apply(q: SelectQueryBuilder<Product>, dto: ProductListingDto) {
    const { geoPriority, userCountry, userRegion, userCity, country, region, city } = dto;

    // Distance is handled in DistanceFilter; here we only add geo_rank or strict geo filters
    if (geoPriority) {
      const propIds = await this.getPropertySubtreeIds().catch(() => [] as number[]);
      const hasProp = propIds.length > 0 ? 1 : 0;
      const uci = (userCity || city || '').trim();
      const ur = (userRegion || region || '').trim();
      const uc = (userCountry || country || '').trim();
      const eaList = ['ET', 'SO', 'KE', 'DJ'];
      const eaSql = eaList.map((_, i) => `:ea${i}`).join(',');
      const expr = `CASE 
        WHEN (:uci <> '' AND LOWER(product."listing_city") = LOWER(:uci) AND :hasProp = 1 AND category.id IN (:...propIds)) THEN 5
        WHEN (:uci <> '' AND LOWER(vendor."registrationCity") = LOWER(:uci)) THEN 4
        WHEN (:ur <> '' AND LOWER(vendor."registrationRegion") = LOWER(:ur)) THEN 3
        WHEN (:uc <> '' AND LOWER(vendor."registrationCountry") = LOWER(:uc)) THEN 2
        WHEN UPPER(COALESCE(vendor."registrationCountry", '')) IN (${eaSql}) THEN 1
        ELSE 0 END`;
      q.addSelect(expr, 'geo_rank').setParameters({
        uci,
        ur,
        uc,
        hasProp,
        propIds: hasProp ? propIds : [0],
        ...Object.fromEntries(eaList.map((v, i) => [`ea${i}`, v])),
      });
      return q;
    }

    // If geoPriority is off, apply strict filters when provided
    if (country)
      q.andWhere('LOWER(vendor.registrationCountry) = LOWER(:country)', { country });
    if (region)
      q.andWhere('LOWER(vendor.registrationRegion) = LOWER(:region)', { region });
    if (city)
      q.andWhere('LOWER(vendor.registrationCity) = LOWER(:city)', { city });
    return q;
  }
}
