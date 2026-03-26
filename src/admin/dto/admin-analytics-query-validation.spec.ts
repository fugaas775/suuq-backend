import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { AdminAnalyticsAggregationsQueryDto } from './admin-analytics-aggregations-query.dto';
import { AdminAnalyticsSearchKeywordsQueryDto } from './admin-analytics-search-keywords-query.dto';
import { AdminAnalyticsSummaryQueryDto } from './admin-analytics-summary-query.dto';
import { AdminAnalyticsTopKeywordsQueryDto } from './admin-analytics-top-keywords-query.dto';

describe('Admin analytics DTO validation', () => {
  it('transforms valid search-keyword list filters', () => {
    const dto = plainToInstance(AdminAnalyticsSearchKeywordsQueryDto, {
      page: '2',
      perPage: '25',
      from: '2026-03-01T00:00:00.000Z',
      to: '2026-03-20T23:59:59.999Z',
      minSubmits: '3',
      q: '  flour  ',
      sort: 'total_desc',
      city: '  Addis  ',
      country: ' et ',
      vendor: '  Acme  ',
    });

    expect(validateSync(dto)).toHaveLength(0);
    expect(dto).toEqual(
      expect.objectContaining({
        page: 2,
        perPage: 25,
        minSubmits: 3,
        q: 'flour',
        sort: 'total_desc',
        city: 'Addis',
        country: 'et',
        vendor: 'Acme',
      }),
    );
  });

  it('transforms valid top, summary, and aggregation filters', () => {
    const topDto = plainToInstance(AdminAnalyticsTopKeywordsQueryDto, {
      window: 'Week',
      limit: '120',
    });
    const summaryDto = plainToInstance(AdminAnalyticsSummaryQueryDto, {
      limit: '150',
    });
    const aggDto = plainToInstance(AdminAnalyticsAggregationsQueryDto, {
      window: 'Month',
      limit: '20',
    });

    expect(validateSync(topDto)).toHaveLength(0);
    expect(validateSync(summaryDto)).toHaveLength(0);
    expect(validateSync(aggDto)).toHaveLength(0);
    expect(topDto).toEqual(
      expect.objectContaining({ window: 'week', limit: 120 }),
    );
    expect(summaryDto).toEqual(expect.objectContaining({ limit: 150 }));
    expect(aggDto).toEqual(
      expect.objectContaining({ window: 'month', limit: 20 }),
    );
  });

  it('rejects malformed analytics filters', () => {
    const listDto = plainToInstance(AdminAnalyticsSearchKeywordsQueryDto, {
      page: 'abc',
      perPage: '0',
      from: 'bad-date',
      sort: 'popularity',
    });
    const topDto = plainToInstance(AdminAnalyticsTopKeywordsQueryDto, {
      window: 'year',
      limit: '999',
    });
    const aggDto = plainToInstance(AdminAnalyticsAggregationsQueryDto, {
      limit: '99',
    });

    expect(validateSync(listDto).map((error) => error.property)).toEqual(
      expect.arrayContaining(['page', 'perPage', 'from', 'sort']),
    );
    expect(validateSync(topDto).map((error) => error.property)).toEqual(
      expect.arrayContaining(['window', 'limit']),
    );
    expect(validateSync(aggDto).map((error) => error.property)).toEqual(
      expect.arrayContaining(['limit']),
    );
  });
});
