import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../auth/roles.enum';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SearchKeyword } from '../products/entities/search-keyword.entity';
import { ProductImpression } from '../products/entities/product-impression.entity';
import { Product } from '../products/entities/product.entity';
import { GeoResolverService } from '../common/services/geo-resolver.service';
import { SkipThrottle } from '@nestjs/throttler';

type SortKey =
  | 'submit_desc'
  | 'submit_asc'
  | 'total_desc'
  | 'total_asc'
  | 'last_desc'
  | 'last_asc'
  | 'noresult_desc'
  | 'noresult_asc';

@UseGuards(AuthGuard('jwt'), RolesGuard)
@SkipThrottle()
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
@Controller()
export class AdminAnalyticsController {
  constructor(
    @InjectRepository(SearchKeyword)
    private readonly keywordRepo: Repository<SearchKeyword>,
    @InjectRepository(ProductImpression)
    private readonly impressionRepo: Repository<ProductImpression>,
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
    private readonly geo: GeoResolverService,
  ) {}

  private countryName(code?: string | null): string | null {
    const c = (code || '').toUpperCase();
    if (!c) return null;
    const map: Record<string, string> = {
      ET: 'Ethiopia',
      SO: 'Somalia',
      KE: 'Kenya',
      DJ: 'Djibouti',
      US: 'USA',
    };
    return map[c] || null;
  }
  private cityToCountry(city?: string | null): string | null {
    return this.geo.resolveCountryFromCity(city);
  }

  @Get('admin/analytics/pro')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async getAdminProAnalytics() {
    // Platform-wide Analytics (Replicates Vendor Pro Analytics but global)

    // 1. Impressions: Total views per product (All Time)
    const impressionsRaw = await this.impressionRepo
      .createQueryBuilder('impression')
      .select('impression.productId', 'productId')
      .addSelect('COUNT(impression.id)', 'count')
      .innerJoin('product', 'p', 'p.id = impression.productId')
      .groupBy('impression.productId')
      .orderBy('count', 'DESC')
      .limit(100) // Safety limit for global query
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

    // Calculate Global Total Views (All Time)
    // We use innerJoin to ensure consistency with other charts that filter out orphaned impressions
    const totalImpressionViews = await this.impressionRepo
      .createQueryBuilder('impression')
      .innerJoin('product', 'p', 'p.id = impression.productId')
      .getCount();

    // 2. Visitor Locations (Real Data) - All Time
    const visitorLocationsRaw = await this.impressionRepo
      .createQueryBuilder('impression')
      .select('impression.country', 'country')
      .addSelect('COUNT(impression.id)', 'count')
      .innerJoin('product', 'p', 'p.id = impression.productId')
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
      .groupBy('impression.city')
      .addGroupBy('impression.country')
      .getRawMany();

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
        'Hargeisa',
        'Kismayo',
        'Bosaso',
        'Baidoa',
        'Beledweyne',
        'Garowe',
        'Wajaale',
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
      ],
    };

    const cityMap = new Map<
      string,
      { city: string; country: string; count: number }
    >();

    visitorCitiesRaw.forEach((r) => {
      const cityName = (r.city || 'Others').trim();
      let countryName = (r.country || 'Others').trim();

      const count = Number(r.count);

      const isCountryAllowed = allowedCountries.some(
        (c) => c.toLowerCase() === countryName.toLowerCase(),
      );
      if (!isCountryAllowed) {
        countryName = 'Others';
      }

      let finalCityName = cityName;

      if (countryName !== 'Others') {
        const lowerCountry = countryName.toLowerCase();
        const allowedList = allowedCitiesMap[lowerCountry] || [];
        const match = allowedList.find(
          (c) => c.toLowerCase() === cityName.toLowerCase(),
        );
        if (match) {
          finalCityName = match;
        } else {
          finalCityName = 'Others';
        }
      } else {
        finalCityName = 'Others';
      }

      const key = `${countryName}||${finalCityName}`;
      if (cityMap.has(key)) {
        const existing = cityMap.get(key);
        existing.count += count;
      } else {
        cityMap.set(key, { city: finalCityName, country: countryName, count });
      }
    });

    // Ensure "Others" row exists for every country present
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
      .where('impression.createdAt >= :date', { date: sevenDaysAgo })
      .groupBy("TO_CHAR(impression.createdAt, 'YYYY-MM-DD')")
      .orderBy('date', 'ASC')
      .getRawMany();

    // Fill in missing days
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

    // 5. Platform Protocol: Vendor Analytics by Country
    // Fetch aggregated data by Vendor + Country
    const vendorStatsRaw = await this.impressionRepo
      .createQueryBuilder('impression')
      .select('u.displayName', 'vendorName')
      .addSelect('u.email', 'vendorEmail')
      .addSelect('impression.country', 'country')
      .addSelect('COUNT(impression.id)', 'count')
      .innerJoin('product', 'p', 'p.id = impression.productId')
      .innerJoin('p.vendor', 'u')
      .where('impression.country IS NOT NULL')
      .groupBy('u.id')
      .addGroupBy('impression.country')
      .addOrderBy('count', 'DESC')
      .limit(1000) // Increase limit to capture full vendor distribution before grouping
      .getRawMany();

    // Post-process to group by Vendor (avoiding redundancy in the table)
    const vendorMap = new Map<
      string,
      {
        vendor: string;
        total: number;
        countries: { name: string; count: number }[];
      }
    >();

    vendorStatsRaw.forEach((r) => {
      const vKey = r.vendorEmail || 'unknown';
      const vName = r.vendorName || r.vendorEmail || 'Unknown Vendor';
      const cName = r.country;
      const count = Number(r.count);

      if (!vendorMap.has(vKey)) {
        vendorMap.set(vKey, { vendor: vName, total: 0, countries: [] });
      }
      const entry = vendorMap.get(vKey);
      entry.total += count;
      entry.countries.push({ name: cName, count });
    });

    const vendorCountryStats = Array.from(vendorMap.values())
      .map((v) => {
        // Sort countries for this vendor by volume
        const topCountries = v.countries.sort((a, b) => b.count - a.count);
        // Create display string (e.g., "Ethiopia, Somalia")
        const countryDisplay = topCountries.map((c) => c.name).join(', ');

        return {
          vendor: v.vendor,
          country: countryDisplay,
          views: v.total,
        };
      })
      .sort((a, b) => b.views - a.views) // Sort vendors by TOTAL views
      .slice(0, 20); // Top 20 Vendors

    return {
      totalImpressionViews,
      impressions,
      visitorLocations,
      visitorCities,
      trafficTrend,
      vendorCountryStats,
    };
  }

  // Primary path
  @Get('admin/search-keywords')
  async listKeywordsPrimary(
    @Query('page') page = 1,
    @Query('perPage') perPage = 20,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('minSubmits') minSubmits: string = '1',
    @Query('q') q?: string,
    @Query('sort') sort: SortKey = 'submit_desc',
    @Query('city') city?: string,
    @Query('country') country?: string,
    @Query('vendor') vendor?: string,
  ) {
    return this.listKeywords(
      page,
      perPage,
      from,
      to,
      minSubmits,
      q,
      sort,
      city,
      country,
      vendor,
    );
  }

  // Aliases to be resilient with the admin client
  @Get('admin/analytics/search-keywords')
  async listKeywordsAlias1(
    @Query('page') page = 1,
    @Query('perPage') perPage = 20,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('minSubmits') minSubmits: string = '1',
    @Query('q') q?: string,
    @Query('sort') sort: SortKey = 'submit_desc',
    @Query('city') city?: string,
    @Query('country') country?: string,
    @Query('vendor') vendor?: string,
  ) {
    return this.listKeywords(
      page,
      perPage,
      from,
      to,
      minSubmits,
      q,
      sort,
      city,
      country,
      vendor,
    );
  }

  @Get('admin/search/keywords')
  async listKeywordsAlias2(
    @Query('page') page = 1,
    @Query('perPage') perPage = 20,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('minSubmits') minSubmits: string = '1',
    @Query('q') q?: string,
    @Query('sort') sort: SortKey = 'submit_desc',
    @Query('city') city?: string,
    @Query('country') country?: string,
    @Query('vendor') vendor?: string,
  ) {
    return this.listKeywords(
      page,
      perPage,
      from,
      to,
      minSubmits,
      q,
      sort,
      city,
      country,
      vendor,
    );
  }

  // Additional aliases without the 'admin' segment to match some clients
  @Get('analytics/search-keywords')
  async listKeywordsAlias3(
    @Query('page') page = 1,
    @Query('perPage') perPage = 20,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('minSubmits') minSubmits: string = '1',
    @Query('q') q?: string,
    @Query('sort') sort: SortKey = 'submit_desc',
    @Query('city') city?: string,
    @Query('country') country?: string,
    @Query('vendor') vendor?: string,
  ) {
    return this.listKeywords(
      page,
      perPage,
      from,
      to,
      minSubmits,
      q,
      sort,
      city,
      country,
      vendor,
    );
  }

  @Get('analytics/search/keywords')
  async listKeywordsAlias4(
    @Query('page') page = 1,
    @Query('perPage') perPage = 20,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('minSubmits') minSubmits?: string,
    @Query('q') q?: string,
    @Query('sort') sort: SortKey = 'submit_desc',
    @Query('city') city?: string,
    @Query('country') country?: string,
    @Query('vendor') vendor?: string,
  ) {
    return this.listKeywords(
      page,
      perPage,
      from,
      to,
      minSubmits || '1',
      q,
      sort,
      city,
      country,
      vendor,
    );
  }

  // --- Top keywords by recent activity window ---
  private windowStart(window: 'day' | 'week' | 'month'): Date {
    const now = new Date();
    if (window === 'day') return new Date(now.getTime() - 24 * 60 * 60 * 1000);
    if (window === 'week')
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  }

  private async topKeywords(window: 'day' | 'week' | 'month', limit = 100) {
    const from = this.windowStart(window);
    const take = Math.min(Math.max(Number(limit) || 100, 1), 200);
    const qb = this.keywordRepo
      .createQueryBuilder('k')
      .where('k.lastSeenAt >= :from', { from })
      .orderBy('k.submitCount', 'DESC')
      .addOrderBy('k.totalCount', 'DESC')
      .addOrderBy('k.lastSeenAt', 'DESC')
      .take(take);
    const items = await qb.getMany();
    return { window, from, limit: take, count: items.length, items };
  }

  private async topAggregations(window: 'day' | 'week' | 'month', limit = 10) {
    const from = this.windowStart(window);
    const take = Math.min(Math.max(Number(limit) || 10, 1), 50);
    // Top Vendors
    // Compute Top Vendors by expanding vendorHits json across keywords within the window
    const since = from;
    const recent = await this.keywordRepo
      .createQueryBuilder('k')
      .select(['k.vendorHits', 'k.submitCount'])
      .where('k.lastSeenAt >= :since', { since })
      .andWhere('k.vendorHits IS NOT NULL')
      .getMany();
    const vendorMap = new Map<string, { name: string; submitCount: number }>();
    for (const row of recent) {
      const hits = (row as any).vendorHits as Array<{
        name: string;
        count: number;
      }> | null;
      if (!Array.isArray(hits)) continue;
      for (const h of hits) {
        const key = (h.name || '').toString();
        if (!key) continue;
        const prev = vendorMap.get(key) || { name: key, submitCount: 0 };
        prev.submitCount += Number(h.count) || 0;
        vendorMap.set(key, prev);
      }
    }
    let vendors = Array.from(vendorMap.values())
      .sort((a, b) => b.submitCount - a.submitCount)
      .slice(0, take)
      .map((v) => ({
        name: v.name,
        vendorName: v.name,
        submitCount: v.submitCount,
        submits: v.submitCount,
      }));
    if (!vendors.length) {
      // Fallback: derive vendors by scanning products for top keywords in the window
      const topKw = await this.keywordRepo
        .createQueryBuilder('k')
        .select(['k.q AS q'])
        .where('k.lastSeenAt >= :from', { from })
        .orderBy('k.submitCount', 'DESC')
        .limit(20)
        .getRawMany();
      const agg = new Map<string, number>();
      for (const row of topKw) {
        const qv = (row.q || '').toString();
        if (!qv) continue;
        const dist = await this.productRepo
          .createQueryBuilder('p')
          .leftJoin('p.vendor', 'vendor')
          .select([
            'COALESCE(vendor.storeName, vendor.displayName, vendor.legalName, vendor.email) AS name',
            'COUNT(*) AS c',
          ])
          .where('p.status = :st', { st: 'publish' })
          .andWhere('p.isBlocked = false')
          .andWhere('p.name ILIKE :q', { q: `%${qv}%` })
          .groupBy(
            'COALESCE(vendor.storeName, vendor.displayName, vendor.legalName, vendor.email)',
          )
          .orderBy('c', 'DESC')
          .limit(20)
          .getRawMany();
        for (const d of dist) {
          const name = (d.name || '').toString();
          if (!name) continue;
          const c = Number(d.c) || 0;
          agg.set(name, (agg.get(name) || 0) + c);
        }
      }
      vendors = Array.from(agg.entries())
        .map(([name, c]) => ({
          name,
          vendorName: name,
          submitCount: c,
          submits: c,
        }))
        .sort((a, b) => b.submitCount - a.submitCount)
        .slice(0, take);
    }

    // Top Cities
    const citiesRaw = await this.keywordRepo
      .createQueryBuilder('k')
      .select('k.lastCity', 'name')
      .addSelect('SUM(k.submitCount)', 'submits')
      .where('k.lastSeenAt >= :from', { from })
      .andWhere("COALESCE(k.lastCity, '') <> ''")
      .groupBy('k.lastCity')
      .orderBy('SUM(k.submitCount)', 'DESC')
      .limit(take)
      .getRawMany();
    const cities = citiesRaw.map((r: any) => {
      const code = this.cityToCountry(r.name) || null;
      const submits = Number(r.submits) || 0;
      return {
        name: r.name,
        submitCount: submits,
        submits,
        city: r.name,
        country: code,
        countryCode: code,
      };
    });

    // By Country (Ethiopia, Somalia, Kenya, Djibouti)
    // Compute vendor counts per country from vendorHits (distinct vendors across the window)
    const vendorSetsByCountry = new Map<string, Set<string>>();
    for (const row of recent) {
      const hits = (row as any).vendorHits as Array<{
        id?: number;
        name?: string;
        country?: string;
        count: number;
      }> | null;
      if (!Array.isArray(hits)) continue;
      for (const h of hits) {
        const cc = (h.country || '').toString().toUpperCase();
        if (!cc) continue;
        if (!vendorSetsByCountry.has(cc))
          vendorSetsByCountry.set(cc, new Set());
        const key =
          h.id != null && !Number.isNaN(Number(h.id))
            ? `id:${h.id}`
            : h.name
              ? `name:${h.name}`
              : null;
        if (key) vendorSetsByCountry.get(cc).add(key);
      }
    }
    // Rule: Country totals are the sum of city totals in the window (no double counting, no limit cut-off)
    const allowed = new Set(['ET', 'SO', 'KE', 'DJ', 'US']);
    const citiesRawAll = await this.keywordRepo
      .createQueryBuilder('k')
      .select('k.lastCity', 'name')
      .addSelect('SUM(k.submitCount)', 'submits')
      .where('k.lastSeenAt >= :from', { from })
      .andWhere("COALESCE(k.lastCity, '') <> ''")
      .groupBy('k.lastCity')
      .getRawMany();
    const cmap = new Map<string, number>();
    for (const r of citiesRawAll) {
      const code = this.cityToCountry(r.name);
      if (!code || !allowed.has(code)) continue;
      const cnt = Number(r.submits) || 0;
      cmap.set(code, (cmap.get(code) || 0) + cnt);
    }
    // Ensure all allowed codes appear even if 0
    for (const code of allowed) if (!cmap.has(code)) cmap.set(code, 0);
    const countries = Array.from(cmap.entries())
      .map(([code, cnt]) => ({
        code,
        name: this.countryName(code) || code,
        submitCount: cnt,
        submits: cnt,
        country: code,
        vendorCount: vendorSetsByCountry.get(code)?.size || 0,
      }))
      .sort((a, b) => b.submitCount - a.submitCount)
      .slice(0, 4);

    return { vendors, cities, countries };
  }

  // Primary top keywords endpoints
  @Get('admin/search-keywords/top')
  async topKeywordsPrimary(
    @Query('window') window: 'day' | 'week' | 'month' = 'day',
    @Query('limit') limit = 100,
  ) {
    return this.topKeywords(window, Number(limit));
  }

  @Get('admin/search-keywords/top/summary')
  async topKeywordsSummary(@Query('limit') limit = 100) {
    const take = Math.min(Math.max(Number(limit) || 100, 1), 200);
    const [day, week, month, aggDay, aggWeek, aggMonth] = await Promise.all([
      this.topKeywords('day', take),
      this.topKeywords('week', take),
      this.topKeywords('month', take),
      this.topAggregations('day', Math.min(10, take)),
      this.topAggregations('week', Math.min(10, take)),
      this.topAggregations('month', Math.min(10, take)),
    ]);
    return {
      limit: take,
      day,
      week,
      month,
      aggregations: { day: aggDay, week: aggWeek, month: aggMonth },
    };
  }

  // Aliases to be resilient with the admin client
  @Get('admin/analytics/search-keywords/top')
  async topKeywordsAlias1(
    @Query('window') window: 'day' | 'week' | 'month' = 'day',
    @Query('limit') limit = 100,
  ) {
    return this.topKeywords(window, Number(limit));
  }

  @Get('admin/search/keywords/top')
  async topKeywordsAlias2(
    @Query('window') window: 'day' | 'week' | 'month' = 'day',
    @Query('limit') limit = 100,
  ) {
    return this.topKeywords(window, Number(limit));
  }

  // Non-admin prefixed aliases (client fallbacks)
  @Get('analytics/search-keywords/top')
  async topKeywordsAlias3(
    @Query('window') window: 'day' | 'week' | 'month' = 'day',
    @Query('limit') limit = 100,
  ) {
    return this.topKeywords(window, Number(limit));
  }

  @Get('analytics/search/keywords/top')
  async topKeywordsAlias4(
    @Query('window') window: 'day' | 'week' | 'month' = 'day',
    @Query('limit') limit = 100,
  ) {
    return this.topKeywords(window, Number(limit));
  }

  // Aggregation endpoints (separate cards in UI)
  @Get('admin/search-keywords/aggregations')
  async aggregationsPrimary(
    @Query('window') window: 'day' | 'week' | 'month' = 'week',
    @Query('limit') limit = 10,
  ) {
    return this.topAggregations(window, Number(limit));
  }

  // Aliases for aggregations
  @Get('admin/analytics/search-keywords/aggregations')
  async aggregationsAlias1(
    @Query('window') window: 'day' | 'week' | 'month' = 'week',
    @Query('limit') limit = 10,
  ) {
    return this.topAggregations(window, Number(limit));
  }

  @Get('analytics/search-keywords/aggregations')
  async aggregationsAlias2(
    @Query('window') window: 'day' | 'week' | 'month' = 'week',
    @Query('limit') limit = 10,
  ) {
    return this.topAggregations(window, Number(limit));
  }

  private async listKeywords(
    page = 1,
    perPage = 20,
    from?: string,
    to?: string,
    minSubmits: string = '1',
    q?: string,
    sort: SortKey = 'submit_desc',
    city?: string,
    country?: string,
    vendor?: string,
  ) {
    const take = Math.min(Math.max(Number(perPage) || 20, 1), 100);
    const skip = (Math.max(Number(page) || 1, 1) - 1) * take;
    const qb = this.keywordRepo.createQueryBuilder('k');

    // Date range filter on lastSeenAt
    const fromDate = from ? new Date(from) : undefined;
    const toDate = to ? new Date(to) : undefined;
    if (fromDate) qb.andWhere('k.lastSeenAt >= :from', { from: fromDate });
    if (toDate) qb.andWhere('k.lastSeenAt <= :to', { to: toDate });

    // Min submits
    const minSub = Number(minSubmits);
    if (!Number.isNaN(minSub) && minSub > 0) {
      qb.andWhere('k.submitCount >= :minSub', { minSub });
    }

    // Keyword contains
    if (q && q.trim()) {
      qb.andWhere('(k.q ILIKE :kw OR k.qNorm ILIKE :kw)', {
        kw: `%${q.trim()}%`,
      });
    }
    // Filters: city, country, vendor
    if (city && city.trim())
      qb.andWhere('k.lastCity ILIKE :city', { city: `%${city.trim()}%` });
    if (country && country.trim())
      qb.andWhere('UPPER(k.lastCountry) = :ct', {
        ct: country.trim().toUpperCase(),
      });
    if (vendor && vendor.trim())
      qb.andWhere('k.lastVendorName ILIKE :vn', { vn: `%${vendor.trim()}%` });

    // Derive a “no-result rate” via lastResults only as a proxy for now
    // Sorting
    if (sort === 'submit_asc') qb.orderBy('k.submitCount', 'ASC');
    else if (sort === 'total_desc') qb.orderBy('k.totalCount', 'DESC');
    else if (sort === 'total_asc') qb.orderBy('k.totalCount', 'ASC');
    else if (sort === 'last_desc') qb.orderBy('k.lastSeenAt', 'DESC');
    else if (sort === 'last_asc') qb.orderBy('k.lastSeenAt', 'ASC');
    else qb.orderBy('k.submitCount', 'DESC');

    qb.skip(skip).take(take);
    const [rows, total] = await qb.getManyAndCount();
    const items = rows.map((r) => {
      const allowed = new Set(['ET', 'SO', 'KE', 'DJ', 'US']);
      const lastCountry = ((r as any).lastCountry || '')
        .toString()
        .toUpperCase();
      let code = lastCountry && allowed.has(lastCountry) ? lastCountry : null;
      if (!code) {
        const fromCity = this.cityToCountry((r as any).lastCity);
        if (fromCity && allowed.has(fromCity)) code = fromCity;
      }
      return {
        ...r,
        vendorName: (r as any).lastVendorName ?? null,
        city: (r as any).lastCity ?? null,
        country: code || ((r as any).lastCountry ?? null),
        countryCode: code || null,
      };
    });

    return {
      items,
      total,
      page: Math.max(Number(page) || 1, 1),
      perPage: take,
    };
  }
}
