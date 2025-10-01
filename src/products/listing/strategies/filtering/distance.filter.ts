import { Injectable } from '@nestjs/common';
import { SelectQueryBuilder } from 'typeorm';
import { Product } from '../../../entities/product.entity';
import { ProductListingDto } from '../../dto/product-listing.dto';
import { IFilterStrategy } from './base-filter.strategy';

@Injectable()
export class DistanceFilter implements IFilterStrategy {
  apply(q: SelectQueryBuilder<Product>, dto: ProductListingDto) {
    const lat = Number(dto.lat);
    const lng = Number(dto.lng);
    const radius = Number.isFinite(Number(dto.radiusKm)) ? Math.max(0, Number(dto.radiusKm)) : undefined;
    const has = Number.isFinite(lat) && Number.isFinite(lng);
    if (!has) return q;
    const dExpr = `CASE WHEN vendor."locationLat" IS NULL OR vendor."locationLng" IS NULL THEN NULL ELSE (
        2 * 6371 * ASIN(
          SQRT(
            POWER(SIN(RADIANS((vendor."locationLat" - :lat) / 2)), 2) +
            COS(RADIANS(:lat)) * COS(RADIANS(vendor."locationLat")) *
            POWER(SIN(RADIANS((vendor."locationLng" - :lng) / 2)), 2)
          )
        )
      ) END`;
    q.addSelect(dExpr, 'distance_km').setParameters({ lat, lng });
    if (typeof radius === 'number' && isFinite(radius) && radius > 0) {
      q.andWhere(`(${dExpr}) <= :radiusKm`, { lat, lng, radiusKm: radius });
    }
    return q;
  }
}
