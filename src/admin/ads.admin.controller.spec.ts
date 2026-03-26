import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AdminAdsController } from './ads.admin.controller';
import { Product } from '../products/entities/product.entity';
import { TelebirrTransaction } from '../payments/entities/telebirr-transaction.entity';
import { EbirrTransaction } from '../payments/entities/ebirr-transaction.entity';

describe('AdminAdsController', () => {
  let controller: AdminAdsController;
  let productRepo: { createQueryBuilder: jest.Mock };
  let telebirrTxRepo: { createQueryBuilder: jest.Mock };
  let ebirrTxRepo: { createQueryBuilder: jest.Mock };
  let baseQb: any;
  let totalsQb: any;
  let teleQb: any;
  let ebirrQb: any;

  beforeEach(async () => {
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
            id: 7,
            name: 'Boosted Product',
            sku: 'SKU-7',
            status: 'publish',
            isBlocked: false,
            featured: true,
            featuredExpiresAt: new Date('2099-03-25T00:00:00.000Z'),
            featuredPaidAmount: '199.50',
            featuredPaidCurrency: 'ETB',
            vendor: { id: 12, storeName: 'Acme', displayName: 'Acme Supply' },
            category: { id: 4, name: 'Electronics' },
            createdAt: new Date('2026-03-20T10:00:00.000Z'),
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
        featured_total: '4',
        active_total: '3',
        expired_total: '1',
        unpublished_total: '1',
        blocked_total: '0',
      }),
    };

    teleQb = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue({
        amount: '199.50',
        created_at: new Date('2026-03-20T12:00:00.000Z'),
        merch_order_id: 'BOOST-7-TELE',
        status: 'SUCCESS',
      }),
    };

    ebirrQb = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(null),
    };

    productRepo = {
      createQueryBuilder: jest
        .fn()
        .mockReturnValueOnce(baseQb)
        .mockReturnValueOnce(totalsQb),
    };
    telebirrTxRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(teleQb),
    };
    ebirrTxRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(ebirrQb),
    };

    const module: TestingModule = await Test.createTestingModule({
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
    }).compile();

    controller = module.get(AdminAdsController);
  });

  it('uses validated audit filters and returns normalized audit payloads', async () => {
    const result = await controller.getAdsAudit({
      state: 'active',
      page: 2,
      per_page: 25,
      q: 'boost',
    });

    expect(baseQb.andWhere).toHaveBeenNthCalledWith(
      2,
      '(p.name ILIKE :q OR p.description ILIKE :q OR vendor.storeName ILIKE :q OR vendor.displayName ILIKE :q)',
      { q: '%boost%' },
    );
    expect(baseQb.andWhere).toHaveBeenNthCalledWith(
      3,
      '(p.featuredExpiresAt IS NULL OR p.featuredExpiresAt > :now)',
      { now: expect.any(Date) },
    );
    expect(baseQb.skip).toHaveBeenCalledWith(25);
    expect(baseQb.take).toHaveBeenCalledWith(25);
    expect(result).toEqual(
      expect.objectContaining({
        summary: {
          totalFeatured: 4,
          activeFeatured: 3,
          expiredFeatured: 1,
          unpublishedFeatured: 1,
          blockedFeatured: 0,
        },
        pagination: expect.objectContaining({
          page: 2,
          perPage: 25,
          total: 1,
          totalPages: 1,
        }),
        items: [
          expect.objectContaining({
            id: 7,
            activityState: 'active',
            hasPayment: true,
            payment: expect.objectContaining({ provider: 'TELEBIRR' }),
          }),
        ],
      }),
    );
  });

  it('defaults audit pagination when filters are omitted', async () => {
    const freshBaseQb = {
      ...baseQb,
      andWhere: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
    };
    productRepo.createQueryBuilder = jest
      .fn()
      .mockReturnValueOnce(freshBaseQb)
      .mockReturnValueOnce(totalsQb);

    const module: TestingModule = await Test.createTestingModule({
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
    }).compile();

    controller = module.get(AdminAdsController);

    await controller.getAdsAudit({});

    expect(freshBaseQb.skip).toHaveBeenCalledWith(0);
    expect(freshBaseQb.take).toHaveBeenCalledWith(20);
  });
});
