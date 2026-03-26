import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AuthGuard } from '@nestjs/passport';
import { getRepositoryToken } from '@nestjs/typeorm';
import request from 'supertest';
import { AdminAdsController } from '../src/admin/ads.admin.controller';
import { RolesGuard } from '../src/auth/roles.guard';
import { EbirrTransaction } from '../src/payments/entities/ebirr-transaction.entity';
import { TelebirrTransaction } from '../src/payments/entities/telebirr-transaction.entity';
import { Product } from '../src/products/entities/product.entity';

describe('AdminAdsController audit query contract (e2e)', () => {
  let app: INestApplication;
  let productRepo: { createQueryBuilder: jest.Mock };
  let telebirrTxRepo: { createQueryBuilder: jest.Mock };
  let ebirrTxRepo: { createQueryBuilder: jest.Mock };
  let baseQb: any;
  let totalsQb: any;
  let teleQb: any;
  let ebirrQb: any;

  const resetMocks = () => {
    baseQb = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([
        [
          {
            id: 9,
            name: 'Featured Boost',
            sku: 'BOOST-9',
            status: 'draft',
            isBlocked: true,
            featured: true,
            featuredExpiresAt: new Date('2026-03-10T00:00:00.000Z'),
            featuredPaidAmount: '89.00',
            featuredPaidCurrency: 'ETB',
            vendor: {
              id: 14,
              storeName: 'Vendor Shop',
              displayName: 'Vendor Display',
            },
            category: { id: 3, name: 'Home' },
            createdAt: new Date('2026-03-19T10:00:00.000Z'),
          },
        ],
        1,
      ]),
    };

    totalsQb = {
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      setParameter: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue({
        featured_total: '2',
        active_total: '1',
        expired_total: '1',
        unpublished_total: '1',
        blocked_total: '1',
      }),
    };

    teleQb = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(null),
    };

    ebirrQb = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue({
        amount: '89.00',
        currency: 'ETB',
        created_at: new Date('2026-03-19T12:00:00.000Z'),
        merch_order_id: 'BOOST-9-EBIRR',
        status: 'SUCCESS',
      }),
    };

    productRepo.createQueryBuilder.mockReset();
    productRepo.createQueryBuilder
      .mockReturnValueOnce(baseQb)
      .mockReturnValueOnce(totalsQb);
    telebirrTxRepo.createQueryBuilder.mockReset();
    telebirrTxRepo.createQueryBuilder.mockReturnValue(teleQb);
    ebirrTxRepo.createQueryBuilder.mockReset();
    ebirrTxRepo.createQueryBuilder.mockReturnValue(ebirrQb);
  };

  beforeAll(async () => {
    productRepo = { createQueryBuilder: jest.fn() };
    telebirrTxRepo = { createQueryBuilder: jest.fn() };
    ebirrTxRepo = { createQueryBuilder: jest.fn() };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [AdminAdsController],
      providers: [
        { provide: getRepositoryToken(Product), useValue: productRepo },
        {
          provide: getRepositoryToken(TelebirrTransaction),
          useValue: telebirrTxRepo,
        },
        {
          provide: getRepositoryToken(EbirrTransaction),
          useValue: ebirrTxRepo,
        },
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
    resetMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  it('lists ads audit items with validated filters', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/admin/ads/audit')
      .query({ state: 'expired', page: '2', per_page: '25', q: '  boost  ' })
      .expect(200);

    expect(baseQb.andWhere).toHaveBeenNthCalledWith(
      2,
      '(p.name ILIKE :q OR p.description ILIKE :q OR vendor.storeName ILIKE :q OR vendor.displayName ILIKE :q)',
      { q: '%boost%' },
    );
    expect(baseQb.andWhere).toHaveBeenNthCalledWith(
      3,
      'p.featuredExpiresAt IS NOT NULL AND p.featuredExpiresAt <= :now',
      { now: expect.any(Date) },
    );
    expect(baseQb.skip).toHaveBeenCalledWith(25);
    expect(baseQb.take).toHaveBeenCalledWith(25);
    expect(response.body).toEqual(
      expect.objectContaining({
        summary: expect.objectContaining({
          totalFeatured: 2,
          blockedFeatured: 1,
        }),
        pagination: expect.objectContaining({
          page: 2,
          perPage: 25,
          total: 1,
        }),
        items: [
          expect.objectContaining({
            id: 9,
            activityState: 'expired',
            visibilityState: 'blocked',
            hasPayment: true,
            payment: expect.objectContaining({ provider: 'EBIRR' }),
          }),
        ],
      }),
    );
  });

  it('rejects malformed ads audit query filters', async () => {
    await request(app.getHttpServer())
      .get('/api/admin/ads/audit?state=soon')
      .expect(400);

    await request(app.getHttpServer())
      .get('/api/admin/ads/audit?page=abc')
      .expect(400);

    await request(app.getHttpServer())
      .get('/api/admin/ads/audit?per_page=0')
      .expect(400);

    await request(app.getHttpServer())
      .get('/api/admin/ads/audit?per_page=500')
      .expect(400);
  });
});
