import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { GeoResolverService } from '../common/services/geo-resolver.service';
import { EbirrTransaction } from '../payments/entities/ebirr-transaction.entity';
import { TelebirrTransaction } from '../payments/entities/telebirr-transaction.entity';
import { ProductImpression } from '../products/entities/product-impression.entity';
import { Product } from '../products/entities/product.entity';
import { SearchKeyword } from '../products/entities/search-keyword.entity';
import { User } from '../users/entities/user.entity';
import { AdminAnalyticsController } from './analytics.controller';

describe('AdminAnalyticsController', () => {
  let controller: AdminAnalyticsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminAnalyticsController],
      providers: [
        {
          provide: getRepositoryToken(SearchKeyword),
          useValue: { createQueryBuilder: jest.fn() },
        },
        {
          provide: getRepositoryToken(ProductImpression),
          useValue: { createQueryBuilder: jest.fn() },
        },
        {
          provide: getRepositoryToken(Product),
          useValue: { createQueryBuilder: jest.fn(), findByIds: jest.fn() },
        },
        {
          provide: getRepositoryToken(User),
          useValue: { createQueryBuilder: jest.fn(), count: jest.fn() },
        },
        {
          provide: getRepositoryToken(TelebirrTransaction),
          useValue: { createQueryBuilder: jest.fn() },
        },
        {
          provide: getRepositoryToken(EbirrTransaction),
          useValue: { createQueryBuilder: jest.fn() },
        },
        {
          provide: GeoResolverService,
          useValue: { resolveCountryFromCity: jest.fn() },
        },
        { provide: DataSource, useValue: { getRepository: jest.fn() } },
      ],
    }).compile();

    controller = module.get(AdminAnalyticsController);
  });

  it('forwards validated search-keyword list filters through the primary route', async () => {
    const spy = jest
      .spyOn(controller as any, 'listKeywords')
      .mockResolvedValue({ items: [], total: 0, page: 2, perPage: 25 });

    await controller.listKeywordsPrimary({
      page: 2,
      perPage: 25,
      from: '2026-03-01T00:00:00.000Z',
      to: '2026-03-20T23:59:59.999Z',
      minSubmits: 3,
      q: 'flour',
      sort: 'total_desc',
      city: 'Addis',
      country: 'ET',
      vendor: 'Acme',
    });

    expect(spy).toHaveBeenCalledWith(
      2,
      25,
      '2026-03-01T00:00:00.000Z',
      '2026-03-20T23:59:59.999Z',
      3,
      'flour',
      'total_desc',
      'Addis',
      'ET',
      'Acme',
    );
  });

  it('reuses the same validated search-keyword contract across aliases', async () => {
    const spy = jest
      .spyOn(controller, 'listKeywordsPrimary')
      .mockResolvedValue({ items: [], total: 0, page: 1, perPage: 20 } as any);

    const query = {
      page: 2,
      perPage: 25,
      minSubmits: 1,
      sort: 'submit_desc' as const,
    };

    await controller.listKeywordsAlias1(query);
    await controller.listKeywordsAlias2(query);
    await controller.listKeywordsAlias3(query);
    await controller.listKeywordsAlias4(query);

    expect(spy).toHaveBeenCalledTimes(4);
    expect(spy).toHaveBeenNthCalledWith(1, query);
  });

  it('forwards top-keyword and aggregation queries through shared helpers', async () => {
    const topSpy = jest
      .spyOn(controller as any, 'topKeywords')
      .mockResolvedValue({ window: 'week', limit: 120, count: 0, items: [] });
    const aggSpy = jest
      .spyOn(controller as any, 'topAggregations')
      .mockResolvedValue({ vendors: [], cities: [], countries: [] });

    await controller.topKeywordsPrimary({ window: 'week', limit: 120 });
    await controller.aggregationsPrimary({ window: 'month', limit: 20 });

    expect(topSpy).toHaveBeenCalledWith('week', 120);
    expect(aggSpy).toHaveBeenCalledWith('month', 20);
  });

  it('builds top-keyword summary with validated capped limit', async () => {
    const topSpy = jest
      .spyOn(controller as any, 'topKeywords')
      .mockResolvedValue({ window: 'day', limit: 150, count: 0, items: [] });
    const aggSpy = jest
      .spyOn(controller as any, 'topAggregations')
      .mockResolvedValue({ vendors: [], cities: [], countries: [] });

    const result = await controller.topKeywordsSummary({ limit: 150 });

    expect(topSpy).toHaveBeenCalledTimes(3);
    expect(topSpy).toHaveBeenNthCalledWith(1, 'day', 150);
    expect(topSpy).toHaveBeenNthCalledWith(2, 'week', 150);
    expect(topSpy).toHaveBeenNthCalledWith(3, 'month', 150);
    expect(aggSpy).toHaveBeenCalledTimes(3);
    expect(result).toEqual(
      expect.objectContaining({
        limit: 150,
        aggregations: expect.any(Object),
      }),
    );
  });
});
