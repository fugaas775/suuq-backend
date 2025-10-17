import { Controller, Get, Header, Query } from '@nestjs/common';
import { HomeService } from './home.service';
import { toProductCard } from '../products/utils/product-card.util';

@Controller('v1/home')
export class HomeV1Controller {
  constructor(private readonly home: HomeService) {}

  // Return ProductCard rails mirroring /products/home but in v1 lean shape
  @Get('feed')
  @Header('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=120')
  @Header('Deprecation', 'true')
  @Header('Sunset', 'Wed, 31 Dec 2025 23:59:59 GMT')
  async feed(@Query() q: any) {
    const perSection = Math.min(Number(q.limit || q.per_page) || 10, 20);
    const view: 'grid' | 'full' = 'grid';
  const city = q.user_city || q.userCity || q.city;
  const region = q.user_region || q.userRegion || q.region;
  const country = q.user_country || q.userCountry || q.country;
    const data = await this.home.getHomeFeed({
      perSection,
      userCity: city,
      userRegion: region,
      userCountry: country,
      view,
    });
    const toCards = (arr: any[]) => (arr || []).map(toProductCard);
    return {
      bestSellers: toCards((data as any).bestSellers),
      topRated: toCards((data as any).topRated),
      geoAll: toCards((data as any).geoAll),
      newArrivals: toCards((data as any).newArrivals),
      curatedNew: toCards((data as any).curatedNew),
      curatedBest: toCards((data as any).curatedBest),
      meta: {
        perSection,
        geo: { city: city || null, region: region || null, country: country || null },
      },
    };
  }
}
