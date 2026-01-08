import {
  Controller,
  Get,
  Query,
  UseGuards,
  Req,
  ForbiddenException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../auth/roles.enum';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SearchKeyword } from '../products/entities/search-keyword.entity';
import { ProductImpression } from '../products/entities/product-impression.entity';
import { Product } from '../products/entities/product.entity';
import { User, SubscriptionTier } from '../users/entities/user.entity';
import { SkipThrottle } from '@nestjs/throttler';

type ZeroDemandQuery = {
  page?: string | number;
  limit?: string | number;
  perPage?: string | number;
  per_page?: string | number;
  q?: string;
  city?: string;
  country?: string;
  window?: 'day' | 'week' | 'month';
  windowDays?: string | number;
};

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
@SkipThrottle()
export class VendorAnalyticsController {
  constructor(
    @InjectRepository(SearchKeyword)
    private readonly keywordRepo: Repository<SearchKeyword>,
    @InjectRepository(ProductImpression)
    private readonly impressionRepo: Repository<ProductImpression>,
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
  ) {}

  @Get('v2/vendor/analytics/pro')
  @Roles(UserRole.VENDOR)
  async getProAnalytics(@Req() req: any) {
    // req.user comes from JwtStrategy and only contains { id, email, roles }
    // We need to fetch the full user to check subscriptionTier
    const userId = req.user.id;
    const user = await this.usersRepo.findOne({ where: { id: userId } });

    if (!user) {
      throw new ForbiddenException('User not found');
    }

    // Gatekeeper: Ensure user is PRO
    console.log(`[Analytics] User ${userId} tier: ${user.subscriptionTier}`);
    if (user.subscriptionTier !== SubscriptionTier.PRO) {
      throw new ForbiddenException(
        `This feature is available for Pro subscribers only. Current tier: ${user.subscriptionTier}`,
      );
    }

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // 1. Impressions: Total views per product (All Time)
    const impressionsRaw = await this.impressionRepo
      .createQueryBuilder('impression')
      .select('impression.productId', 'productId')
      .addSelect('COUNT(impression.id)', 'count')
      .innerJoin('product', 'p', 'p.id = impression.productId')
      .where('p.vendorId = :vendorId', { vendorId: user.id })
      .groupBy('impression.productId')
      .getRawMany();

    const productIds = impressionsRaw.map((i) => i.productId);
    const productsMap = new Map<number, string>();

    if (productIds.length > 0) {
      const products = await this.productRepo.findByIds(productIds);
      products.forEach((p) => productsMap.set(p.id, p.name));
    }

    const impressions = impressionsRaw.map((i) => ({
      name: productsMap.get(i.productId) || 'Unknown Product',
      views: Number(i.count),
    }));

    // 2. Visitor Locations (Real Data) - All Time
    const visitorLocationsRaw = await this.impressionRepo
      .createQueryBuilder('impression')
      .select('impression.country', 'country')
      .addSelect('COUNT(impression.id)', 'count')
      .innerJoin('product', 'p', 'p.id = impression.productId')
      .where('p.vendorId = :vendorId', { vendorId: user.id })
      .groupBy('impression.country')
      .getRawMany();

    const allowedCountries = [
      'Ethiopia',
      'Somalia',
      'Kenya',
      'Djibouti',
      'United States',
      'USA',
    ];
    const finalLocations = [];
    let othersCount = 0;

    for (const r of visitorLocationsRaw) {
      // If country is missing (null/empty), count as Others
      if (!r.country) {
        othersCount += Number(r.count);
        continue;
      }

      if (
        allowedCountries.some(
          (allowed) => allowed.toLowerCase() === r.country.toLowerCase(),
        )
      ) {
        finalLocations.push({ country: r.country, count: Number(r.count) });
      } else {
        othersCount += Number(r.count);
      }
    }

    if (othersCount > 0) {
      finalLocations.push({ country: 'Others', count: othersCount });
    }

    const visitorLocations = finalLocations.sort((a, b) => b.count - a.count);

    // 3. Visitor Cities (Real Data) - All Time
    const visitorCitiesRaw = await this.impressionRepo
      .createQueryBuilder('impression')
      .select('impression.city', 'city')
      .addSelect('impression.country', 'country')
      .addSelect('COUNT(impression.id)', 'count')
      .innerJoin('product', 'p', 'p.id = impression.productId')
      .where('p.vendorId = :vendorId', { vendorId: user.id })
      .groupBy('impression.city')
      .addGroupBy('impression.country')
      .getRawMany();

    // Explicitly allowed cities per country (normalized for comparison)
    const allowedCitiesMap: Record<string, string[]> = {
      ethiopia: [
        'Addis Ababa',
        'Dire Dawa',
        "Mek'ele",
        'Adama',
        'Gondar',
        'Bahir Dar',
        'Jigjiga',
        'Hawassa',
        'Harar',
        'Gode',
        'Kelafo',
        'Semara',
        'Assosa',
        'Gambela City',
      ],
      kenya: [
        'Nairobi',
        'Mombasa',
        'Kisumu',
        'Nakuru',
        'Eldoret',
        'Garissa',
        'Wajir',
      ],
      somalia: [
        'Mogadishu',
        'Kismayo',
        'Bosaso',
        'Baidoa',
        'Beledweyne',
        'Garowe',
      ],
      djibouti: ['Djibouti City', 'Ali Sabieh', 'Tadjoura', 'Dikhil'],
      'united states': [
        'Minneapolis',
        'Seattle',
        'Columbus',
        'New York',
        'Los Angeles',
        'Chicago',
        'Houston',
      ],
      usa: [
        'Minneapolis',
        'Seattle',
        'Columbus',
        'New York',
        'Los Angeles',
        'Chicago',
        'Houston',
      ], // alias
    };

    const cityMap = new Map<
      string,
      { city: string; country: string; count: number }
    >();

    visitorCitiesRaw.forEach((r) => {
      // If city is missing, group under Others for that country, or global Others?
      // Simplest is to treat null city as "Others" city.
      const cityName = (r.city || 'Others').trim();
      let countryName = (r.country || 'Others').trim(); // Handle null country

      if (cityName === '') {
        // Treat empty string city as Others
      }

      const count = Number(r.count);

      // 1. Normalize Country -> Others if not allowed
      const isCountryAllowed = allowedCountries.some(
        (c) => c.toLowerCase() === countryName.toLowerCase(),
      );
      if (!isCountryAllowed) {
        countryName = 'Others';
      }

      // 2. Normalize City -> Others if not allowed within that country
      // If country is 'Others', the city is effectively 'Others' too or just kept as is?
      // Usually if country is others, we might just want to group all as "Others" or keep city detail if relevant.
      // Requirement: "if the country is not those I mentioned... say Others."
      // And "In Top Cities by Country... there are other cities which are not in our cities selected which can be Others."

      let finalCityName = cityName;

      if (countryName !== 'Others') {
        const lowerCountry = countryName.toLowerCase();
        const allowedList = allowedCitiesMap[lowerCountry] || [];
        // Check if city is in allowed list (case-insensitive check)
        const match = allowedList.find(
          (c) => c.toLowerCase() === cityName.toLowerCase(),
        );
        if (match) {
          finalCityName = match; // Use canonical casing
        } else {
          finalCityName = 'Others';
        }
      } else {
        // For "Others" country, we can group all cities into "Others" as well to clean up the view
        finalCityName = 'Others';
      }

      // Aggregation key: Country + City
      const key = `${countryName}||${finalCityName}`;
      if (cityMap.has(key)) {
        const existing = cityMap.get(key);
        existing.count += count;
      } else {
        cityMap.set(key, { city: finalCityName, country: countryName, count });
      }
    });

    // Ensure "Others" row exists for every country present in the data (even if 0)
    const countriesInResponse = new Set<string>();
    for (const val of cityMap.values()) {
      if (val.country !== 'Others') {
        countriesInResponse.add(val.country);
      }
    }

    for (const c of countriesInResponse) {
      const key = `${c}||Others`;
      if (!cityMap.has(key)) {
        cityMap.set(key, { city: 'Others', country: c, count: 0 });
      }
    }

    const visitorCities = Array.from(cityMap.values()).sort(
      (a, b) => b.count - a.count,
    );

    // 4. Traffic Trends (Last 7 Days) - Real Data
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const trafficRaw = await this.impressionRepo
      .createQueryBuilder('impression')
      .select("TO_CHAR(impression.createdAt, 'YYYY-MM-DD')", 'date')
      .addSelect('COUNT(impression.id)', 'count')
      .innerJoin('product', 'p', 'p.id = impression.productId')
      .where('p.vendorId = :vendorId', { vendorId: user.id })
      .andWhere('impression.createdAt >= :date', { date: sevenDaysAgo })
      .groupBy("TO_CHAR(impression.createdAt, 'YYYY-MM-DD')")
      .orderBy('date', 'ASC')
      .getRawMany();

    // Fill in missing days with 0 to ensure a complete 7-day chart
    const trafficTrend = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const found = trafficRaw.find((r) => r.date === dateStr);

      const count = found ? Number(found.count) : 0;
      trafficTrend.push({
        date: dateStr,
        count,
      });
    }

    return {
      impressions,
      visitorLocations,
      visitorCities,
      trafficTrend,
    };
  }

  @Get('vendor/analytics/zero-searches')
  @Roles(UserRole.VENDOR, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async vendorZeroSearches(@Query() query: ZeroDemandQuery) {
    return this.buildZeroDemandResponse(query);
  }

  @Get('vendor/analytics/zero-result-searches')
  @Roles(UserRole.VENDOR, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async vendorZeroSearchesAlias(@Query() query: ZeroDemandQuery) {
    return this.buildZeroDemandResponse(query);
  }

  @Get('vendor/analytics/searches/zero')
  @Roles(UserRole.VENDOR, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async vendorZeroSearchesAlias2(@Query() query: ZeroDemandQuery) {
    return this.buildZeroDemandResponse(query);
  }

  @Get('analytics/zero-searches')
  @Roles(UserRole.VENDOR, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async adminZeroSearches(@Query() query: ZeroDemandQuery) {
    return this.buildZeroDemandResponse(query);
  }

  @Get('analytics/searches/zero')
  @Roles(UserRole.VENDOR, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async adminZeroSearchesAlias(@Query() query: ZeroDemandQuery) {
    return this.buildZeroDemandResponse(query);
  }

  @Get('analytics/zero-results')
  @Roles(UserRole.VENDOR, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async adminZeroResultsAlias(@Query() query: ZeroDemandQuery) {
    return this.buildZeroDemandResponse(query);
  }

  // Aliases to silence noisy clients calling legacy paths
  @Get('vendor/analytics/demand/zero-results')
  @Roles(UserRole.VENDOR, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async vendorZeroResultsDemand(@Query() query: ZeroDemandQuery) {
    return this.buildZeroDemandResponse(query);
  }

  @Get('vendor/analytics/demand/zero-result')
  @Roles(UserRole.VENDOR, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async vendorZeroResultDemand(@Query() query: ZeroDemandQuery) {
    return this.buildZeroDemandResponse(query);
  }

  @Get('vendor/analytics/demand/zero-result-searches')
  @Roles(UserRole.VENDOR, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async vendorZeroResultSearches(@Query() query: ZeroDemandQuery) {
    return this.buildZeroDemandResponse(query);
  }

  @Get('vendor/analytics/demand/zero-searches')
  @Roles(UserRole.VENDOR, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async vendorZeroDemandZeroSearches(@Query() query: ZeroDemandQuery) {
    return this.buildZeroDemandResponse(query);
  }

  @Get('vendor/analytics/zero-result-demand')
  @Roles(UserRole.VENDOR, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async vendorZeroResultDemandAlias(@Query() query: ZeroDemandQuery) {
    return this.buildZeroDemandResponse(query);
  }

  @Get('vendor/analytics/zero-search-demand')
  @Roles(UserRole.VENDOR, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async vendorZeroSearchDemandAlias(@Query() query: ZeroDemandQuery) {
    return this.buildZeroDemandResponse(query);
  }

  @Get('product-requests/analytics/zero-searches')
  @Roles(UserRole.VENDOR, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async adminProductRequestsZeroSearches(@Query() query: ZeroDemandQuery) {
    return this.buildZeroDemandResponse(query);
  }

  private async buildZeroDemandResponse(query: ZeroDemandQuery) {
    const page = Math.max(parseInt(String(query.page ?? '1'), 10) || 1, 1);
    const fallbackLimit = query.limit ?? query.perPage ?? query.per_page;
    const perPageRaw = fallbackLimit != null ? Number(fallbackLimit) : 20;
    const perPage = Math.min(Math.max(perPageRaw || 20, 1), 100);
    const skip = (page - 1) * perPage;
    const term = (query.q || '').trim();
    const city = (query.city || '').trim();
    const country = (query.country || '').trim().toUpperCase();
    const windowKey = (query.window || 'month').toLowerCase();
    const windowDaysExplicit = Number(query.windowDays);
    const windowDays =
      Number.isFinite(windowDaysExplicit) && windowDaysExplicit > 0
        ? windowDaysExplicit
        : windowKey === 'day'
          ? 1
          : windowKey === 'week'
            ? 7
            : 30;
    const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

    const qb = this.keywordRepo
      .createQueryBuilder('k')
      .where('k.zeroResultsCount > 0')
      .andWhere('k.lastZeroResultsAt IS NOT NULL')
      .andWhere('k.lastZeroResultsAt >= :since', { since });

    if (term) {
      qb.andWhere('(k.q ILIKE :term OR k.qNorm ILIKE :term)', {
        term: `%${term}%`,
      });
    }

    if (city) {
      qb.andWhere('(COALESCE(k.lastZeroResultsCity, k.lastCity)) ILIKE :city', {
        city: `%${city}%`,
      });
    }

    if (country) {
      qb.andWhere(
        'UPPER(COALESCE(k.lastZeroResultsCountry, k.lastCountry)) = :country',
        { country },
      );
    }

    qb.orderBy('k.lastZeroResultsAt', 'DESC')
      .addOrderBy('k.zeroResultsCount', 'DESC')
      .skip(skip)
      .take(perPage);

    const [rows, total] = await qb.getManyAndCount();
    const items = rows.map((row) => ({
      term: row.q,
      normalizedTerm: row.qNorm,
      zeroResultsCount: row.zeroResultsCount,
      lastZeroResultsAt: row.lastZeroResultsAt,
      city: row.lastZeroResultsCity || row.lastCity || null,
      country: row.lastZeroResultsCountry || row.lastCountry || null,
      vendorName: row.lastVendorName || null,
      submitCount: row.submitCount,
      totalCount: row.totalCount,
      vendorHints: row.vendorHits || [],
    }));

    return {
      items,
      total,
      page,
      perPage,
      hasMore: skip + items.length < total,
      windowDays,
      generatedAt: new Date().toISOString(),
    };
  }
}
