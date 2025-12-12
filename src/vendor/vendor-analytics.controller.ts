import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../auth/roles.enum';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SearchKeyword } from '../products/entities/search-keyword.entity';
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
  ) {}

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
