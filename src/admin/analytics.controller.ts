import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../auth/roles.enum';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SearchKeyword } from '../products/entities/search-keyword.entity';
import { Product } from '../products/entities/product.entity';
import { GeoResolverService } from '../common/services/geo-resolver.service';

type SortKey = 'submit_desc' | 'submit_asc' | 'total_desc' | 'total_asc' | 'last_desc' | 'last_asc' | 'noresult_desc' | 'noresult_asc';

@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
@Controller()
export class AdminAnalyticsController {
  constructor(
    @InjectRepository(SearchKeyword) private readonly keywordRepo: Repository<SearchKeyword>,
    @InjectRepository(Product) private readonly productRepo: Repository<Product>,
    private readonly geo: GeoResolverService,
  ) {}

  private countryName(code?: string | null): string | null {
    const c = (code || '').toUpperCase();
    if (!c) return null;
    const map: Record<string, string> = { ET: 'Ethiopia', SO: 'Somalia', KE: 'Kenya', DJ: 'Djibouti' };
    return map[c] || null;
  }
  private cityToCountry(city?: string | null): string | null {
    return this.geo.resolveCountryFromCity(city);
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
  return this.listKeywords(page, perPage, from, to, minSubmits, q, sort, city, country, vendor);
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
  return this.listKeywords(page, perPage, from, to, minSubmits, q, sort, city, country, vendor);
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
  return this.listKeywords(page, perPage, from, to, minSubmits, q, sort, city, country, vendor);
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
  return this.listKeywords(page, perPage, from, to, minSubmits, q, sort, city, country, vendor);
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
  return this.listKeywords(page, perPage, from, to, minSubmits || '1', q, sort, city, country, vendor);
  }

  // --- Top keywords by recent activity window ---
  private windowStart(window: 'day' | 'week' | 'month'): Date {
    const now = new Date();
    if (window === 'day') return new Date(now.getTime() - 24 * 60 * 60 * 1000);
    if (window === 'week') return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
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
      const hits = (row as any).vendorHits as Array<{ name: string; count: number }> | null;
      if (!Array.isArray(hits)) continue;
      for (const h of hits) {
        const key = (h.name || '').toString();
        if (!key) continue;
        const prev = vendorMap.get(key) || { name: key, submitCount: 0 };
        prev.submitCount += Number(h.count) || 0;
        vendorMap.set(key, prev);
      }
    }
  let vendors = Array.from(vendorMap.values()).sort((a, b) => b.submitCount - a.submitCount).slice(0, take)
      .map((v) => ({ name: v.name, vendorName: v.name, submitCount: v.submitCount, submits: v.submitCount }));
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
            "COALESCE(vendor.storeName, vendor.displayName, vendor.legalName, vendor.email) AS name",
            'COUNT(*) AS c',
          ])
          .where('p.status = :st', { st: 'publish' })
          .andWhere('p.isBlocked = false')
          .andWhere('p.name ILIKE :q', { q: `%${qv}%` })
          .groupBy("COALESCE(vendor.storeName, vendor.displayName, vendor.legalName, vendor.email)")
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
        .map(([name, c]) => ({ name, vendorName: name, submitCount: c, submits: c }))
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
      const hits = (row as any).vendorHits as Array<{ id?: number; name?: string; country?: string; count: number }> | null;
      if (!Array.isArray(hits)) continue;
      for (const h of hits) {
        const cc = (h.country || '').toString().toUpperCase();
        if (!cc) continue;
        if (!vendorSetsByCountry.has(cc)) vendorSetsByCountry.set(cc, new Set());
        const key = (h.id != null && !Number.isNaN(Number(h.id))) ? `id:${h.id}` : (h.name ? `name:${h.name}` : null);
        if (key) vendorSetsByCountry.get(cc)!.add(key);
      }
    }
    // Rule: Country totals are the sum of city totals in the window (no double counting, no limit cut-off)
    const allowed = new Set(['ET', 'SO', 'KE', 'DJ']);
    const citiesRawAll = await this.keywordRepo
      .createQueryBuilder('k')
      .select('k.lastCity', 'name')
      .addSelect('SUM(k.submitCount)', 'submits')
      .where('k.lastSeenAt >= :from', { from })
      .andWhere("COALESCE(k.lastCity, '') <> ''")
      .groupBy('k.lastCity')
      .getRawMany();
    const cmap = new Map<string, number>();
    for (const r of citiesRawAll as any[]) {
      const code = this.cityToCountry(r.name);
      if (!code || !allowed.has(code)) continue;
      const cnt = Number(r.submits) || 0;
      cmap.set(code, (cmap.get(code) || 0) + cnt);
    }
    // Ensure all allowed codes appear even if 0
    for (const code of allowed) if (!cmap.has(code)) cmap.set(code, 0);
    const countries = Array.from(cmap.entries())
      .map(([code, cnt]) => ({ code, name: this.countryName(code) || code, submitCount: cnt, submits: cnt, country: code, vendorCount: vendorSetsByCountry.get(code)?.size || 0 }))
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
  async topKeywordsSummary(
    @Query('limit') limit = 100,
  ) {
    const take = Math.min(Math.max(Number(limit) || 100, 1), 200);
    const [day, week, month, aggDay, aggWeek, aggMonth] = await Promise.all([
      this.topKeywords('day', take),
      this.topKeywords('week', take),
      this.topKeywords('month', take),
      this.topAggregations('day', Math.min(10, take)),
      this.topAggregations('week', Math.min(10, take)),
      this.topAggregations('month', Math.min(10, take)),
    ]);
    return { limit: take, day, week, month, aggregations: { day: aggDay, week: aggWeek, month: aggMonth } };
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
      qb.andWhere('(k.q ILIKE :kw OR k.qNorm ILIKE :kw)', { kw: `%${q.trim()}%` });
    }
  // Filters: city, country, vendor
  if (city && city.trim()) qb.andWhere('k.lastCity ILIKE :city', { city: `%${city.trim()}%` });
  if (country && country.trim()) qb.andWhere('UPPER(k.lastCountry) = :ct', { ct: country.trim().toUpperCase() });
  if (vendor && vendor.trim()) qb.andWhere('k.lastVendorName ILIKE :vn', { vn: `%${vendor.trim()}%` });

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
      const allowed = new Set(['ET', 'SO', 'KE', 'DJ']);
      const lastCountry = ((r as any).lastCountry || '').toString().toUpperCase();
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
