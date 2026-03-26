import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AuthGuard } from '@nestjs/passport';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { AdminAnalyticsController } from '../src/admin/analytics.controller';
import { RolesGuard } from '../src/auth/roles.guard';
import { GeoResolverService } from '../src/common/services/geo-resolver.service';
import { EbirrTransaction } from '../src/payments/entities/ebirr-transaction.entity';
import { TelebirrTransaction } from '../src/payments/entities/telebirr-transaction.entity';
import { ProductImpression } from '../src/products/entities/product-impression.entity';
import { Product } from '../src/products/entities/product.entity';
import { SearchKeyword } from '../src/products/entities/search-keyword.entity';
import { User } from '../src/users/entities/user.entity';

describe('AdminAnalyticsController search-keyword query contract (e2e)', () => {
  let app: INestApplication;
  let keywordRepo: { createQueryBuilder: jest.Mock };
  let geo: { resolveCountryFromCity: jest.Mock };

  const createListQb = () => ({
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getManyAndCount: jest.fn().mockResolvedValue([
      [
        {
          id: 9,
          q: 'flour',
          qNorm: 'flour',
          submitCount: 12,
          totalCount: 18,
          lastSeenAt: new Date('2026-03-20T12:00:00.000Z'),
          lastVendorName: 'Acme',
          lastCity: 'Addis Ababa',
          lastCountry: 'ET',
        },
      ],
      1,
    ]),
  });

  const createTopKeywordsQb = () => ({
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue([
      {
        id: 10,
        q: 'flour',
        submitCount: 14,
        totalCount: 20,
        lastSeenAt: new Date('2026-03-21T12:00:00.000Z'),
      },
    ]),
  });

  const createRecentQb = () => ({
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue([
      {
        vendorHits: [{ name: 'Acme', country: 'ET', count: 5 }],
        submitCount: 5,
      },
    ]),
  });

  const createCitiesQb = () => ({
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    getRawMany: jest
      .fn()
      .mockResolvedValue([{ name: 'Addis Ababa', submits: '5' }]),
  });

  const createCitiesAllQb = () => ({
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    getRawMany: jest
      .fn()
      .mockResolvedValue([{ name: 'Addis Ababa', submits: '5' }]),
  });

  beforeAll(async () => {
    keywordRepo = { createQueryBuilder: jest.fn() };
    geo = {
      resolveCountryFromCity: jest
        .fn()
        .mockImplementation((city?: string | null) =>
          city && city.toLowerCase().includes('addis') ? 'ET' : null,
        ),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [AdminAnalyticsController],
      providers: [
        { provide: getRepositoryToken(SearchKeyword), useValue: keywordRepo },
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
        { provide: GeoResolverService, useValue: geo },
        { provide: DataSource, useValue: { getRepository: jest.fn() } },
      ],
    })
      .overrideGuard(AuthGuard('jwt'))
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
  });

  beforeEach(() => {
    keywordRepo.createQueryBuilder.mockReset();
  });

  afterAll(async () => {
    await app.close();
  });

  it('lists search keywords with validated filters', async () => {
    const listQb = createListQb();
    keywordRepo.createQueryBuilder.mockReturnValue(listQb);

    const response = await request(app.getHttpServer())
      .get('/api/admin/search-keywords')
      .query({
        page: '2',
        perPage: '25',
        from: '2026-03-01T00:00:00.000Z',
        to: '2026-03-20T23:59:59.999Z',
        minSubmits: '3',
        q: '  flour  ',
        sort: 'total_desc',
        city: '  Addis  ',
        country: 'et',
        vendor: '  Acme  ',
      })
      .expect(200);

    expect(listQb.skip).toHaveBeenCalledWith(25);
    expect(listQb.take).toHaveBeenCalledWith(25);
    expect(response.body).toEqual(
      expect.objectContaining({
        total: 1,
        page: 2,
        perPage: 25,
        items: [
          expect.objectContaining({
            id: 9,
            vendorName: 'Acme',
            countryCode: 'ET',
          }),
        ],
      }),
    );
  });

  it('serves top keywords and aggregations with validated window filters', async () => {
    keywordRepo.createQueryBuilder
      .mockReturnValueOnce(createTopKeywordsQb())
      .mockReturnValueOnce(createRecentQb())
      .mockReturnValueOnce(createCitiesQb())
      .mockReturnValueOnce(createCitiesAllQb());

    const top = await request(app.getHttpServer())
      .get('/api/admin/search-keywords/top')
      .query({ window: 'week', limit: '120' })
      .expect(200);

    expect(top.body).toEqual(
      expect.objectContaining({ window: 'week', limit: 120, count: 1 }),
    );

    keywordRepo.createQueryBuilder
      .mockReturnValueOnce(createRecentQb())
      .mockReturnValueOnce(createCitiesQb())
      .mockReturnValueOnce(createCitiesAllQb());

    const aggregations = await request(app.getHttpServer())
      .get('/api/admin/search-keywords/aggregations')
      .query({ window: 'month', limit: '20' })
      .expect(200);

    expect(aggregations.body).toEqual(
      expect.objectContaining({
        vendors: [expect.objectContaining({ name: 'Acme' })],
        cities: [expect.objectContaining({ name: 'Addis Ababa' })],
        countries: expect.any(Array),
      }),
    );
  });

  it('rejects malformed analytics search-keyword filters', async () => {
    await request(app.getHttpServer())
      .get('/api/admin/search-keywords?page=abc')
      .expect(400);

    await request(app.getHttpServer())
      .get('/api/admin/search-keywords?perPage=0')
      .expect(400);

    await request(app.getHttpServer())
      .get('/api/admin/search-keywords?sort=popularity')
      .expect(400);

    await request(app.getHttpServer())
      .get('/api/admin/search-keywords?from=bad-date')
      .expect(400);

    await request(app.getHttpServer())
      .get('/api/admin/search-keywords/top?window=year')
      .expect(400);

    await request(app.getHttpServer())
      .get('/api/admin/search-keywords/aggregations?limit=99')
      .expect(400);
  });
});
