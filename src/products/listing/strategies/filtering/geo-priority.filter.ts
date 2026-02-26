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

  private expandCountryVariants(value: string): string[] {
    const token = (value || '').trim().toUpperCase();
    if (!token) return [];
    const map: Record<string, string[]> = {
      ET: ['ET', 'ETHIOPIA'],
      ETHIOPIA: ['ET', 'ETHIOPIA'],
      SO: ['SO', 'SOMALIA'],
      SOMALIA: ['SO', 'SOMALIA'],
      KE: ['KE', 'KENYA'],
      KENYA: ['KE', 'KENYA'],
      DJ: ['DJ', 'DJIBOUTI'],
      DJIBOUTI: ['DJ', 'DJIBOUTI'],
      US: ['US', 'USA', 'UNITED STATES', 'UNITED STATES OF AMERICA'],
      USA: ['US', 'USA', 'UNITED STATES', 'UNITED STATES OF AMERICA'],
      'UNITED STATES': ['US', 'USA', 'UNITED STATES', 'UNITED STATES OF AMERICA'],
      'UNITED STATES OF AMERICA': [
        'US',
        'USA',
        'UNITED STATES',
        'UNITED STATES OF AMERICA',
      ],
    };
    const expanded = map[token] || [token];
    return Array.from(new Set(expanded));
  }

  private async getPropertySubtreeIds(): Promise<number[]> {
    const now = Date.now();
    if (
      GeoPriorityAugment.cache &&
      now - GeoPriorityAugment.cache.at < 5 * 60 * 1000
    ) {
      return GeoPriorityAugment.cache.ids;
    }
    // Find roots by slug pattern and collect descendants
    const roots = await this.categoryRepo
      .createQueryBuilder('c')
      .where('c.slug ILIKE :p1 OR c.slug ~* :p2', {
        p1: '%property%',
        p2: 'real[-_ ]?estate',
      })
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
    const {
      geoPriority,
      userCountry,
      userRegion,
      userCity,
      geoCountryStrict,
      geoRotationSeed,
      country,
      region,
      city,
    } = dto;

    // Distance is handled in DistanceFilter; here we only add geo_rank or strict geo filters
    if (geoPriority) {
      const propIds = await this.getPropertySubtreeIds().catch(
        () => [] as number[],
      );
      const hasProp = propIds.length > 0 ? 1 : 0;
      const uci = (userCity || city || '').trim();
      const ur = (userRegion || region || '').trim();
      const uc = (userCountry || country || '').trim();
      const ucVariants = this.expandCountryVariants(uc);
      if (geoCountryStrict && ucVariants.length) {
        q.andWhere(
          'UPPER(COALESCE(vendor."registrationCountry", \'\')) IN (:...geoCountryVariants)',
          {
            geoCountryVariants: ucVariants,
          },
        );
      }
      const expr = `CASE 
        WHEN (:uci <> '' AND LOWER(product."listing_city") = LOWER(:uci) AND :hasProp = 1 AND category.id IN (:...propIds)) THEN 30
        WHEN (:uci <> '' AND LOWER(vendor."registrationCity") = LOWER(:uci)) THEN 30
        WHEN (:ur <> '' AND LOWER(vendor."registrationRegion") = LOWER(:ur)) THEN 20
        WHEN (:ucLen > 0 AND UPPER(COALESCE(vendor."registrationCountry", '')) IN (:...ucVariants)) THEN 10
        ELSE 0 END`;
      const tierExpr = `CASE 
        WHEN (:uci <> '' AND (LOWER(product."listing_city") = LOWER(:uci) OR LOWER(vendor."registrationCity") = LOWER(:uci))) THEN 3
        WHEN (:ur <> '' AND LOWER(vendor."registrationRegion") = LOWER(:ur)) THEN 2
        WHEN (:ucLen > 0 AND UPPER(COALESCE(vendor."registrationCountry", '')) IN (:...ucVariants)) THEN 1
        ELSE 0 END`;
      const rotationExpr = `CASE
        WHEN :rotationSeed <> '' THEN ABS((('x' || SUBSTRING(md5(COALESCE(product.id::text, '') || :rotationSeed), 1, 8))::bit(32)::int))
        ELSE 0
      END`;
      q.addSelect(expr, 'geo_rank').setParameters({
        uci,
        ur,
        uc,
        ucLen: ucVariants.length,
        ucVariants: ucVariants.length ? ucVariants : ['__NONE__'],
        hasProp,
        propIds: hasProp ? propIds : [0],
      });
      q.addSelect(tierExpr, 'geo_tier').setParameters({
        uci,
        ur,
        ucLen: ucVariants.length,
        ucVariants: ucVariants.length ? ucVariants : ['__NONE__'],
      });
      q.addSelect(rotationExpr, 'geo_rotation_rank').setParameters({
        rotationSeed: (geoRotationSeed || '').trim(),
      });
      return q;
    }

    // If geoPriority is off, apply strict filters when provided
    if (country)
      q.andWhere('LOWER(vendor.registrationCountry) = LOWER(:country)', {
        country,
      });
    if (region)
      q.andWhere('LOWER(vendor.registrationRegion) = LOWER(:region)', {
        region,
      });
    if (city)
      q.andWhere('LOWER(vendor.registrationCity) = LOWER(:city)', { city });
    return q;
  }
}
