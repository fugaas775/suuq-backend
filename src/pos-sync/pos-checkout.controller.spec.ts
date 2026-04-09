import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { RetailModulesGuard } from '../retail/retail-modules.guard';
import { RetailEntitlementsService } from '../retail/retail-entitlements.service';
import { PosCheckoutController } from './pos-checkout.controller';
import { PosCheckoutService } from './pos-checkout.service';
import { PosCheckoutTransactionType } from './entities/pos-checkout.entity';
import { PosCheckoutStatus } from './entities/pos-checkout.entity';

describe('PosCheckoutController', () => {
  let controller: PosCheckoutController;
  let posCheckoutService: {
    quote: jest.Mock;
    findAll: jest.Mock;
    findOne: jest.Mock;
    ingest: jest.Mock;
  };

  beforeEach(async () => {
    posCheckoutService = {
      quote: jest.fn(),
      findAll: jest.fn(),
      findOne: jest.fn(),
      ingest: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PosCheckoutController],
      providers: [
        { provide: PosCheckoutService, useValue: posCheckoutService },
        { provide: Reflector, useValue: { getAllAndOverride: jest.fn() } },
        {
          provide: RetailEntitlementsService,
          useValue: { assertBranchHasModules: jest.fn() },
        },
        {
          provide: RetailModulesGuard,
          useValue: { canActivate: jest.fn().mockReturnValue(true) },
        },
      ],
    }).compile();

    controller = module.get(PosCheckoutController);
  });

  it('returns paginated branch-scoped checkout history', async () => {
    posCheckoutService.findAll.mockResolvedValue({
      items: [
        {
          id: 71,
          branchId: 3,
          transactionType: PosCheckoutTransactionType.SALE,
          status: PosCheckoutStatus.PROCESSED,
          currency: 'USD',
          subtotal: 15,
          discountAmount: 0,
          taxAmount: 0,
          total: 15,
          paidAmount: 15,
          changeDue: 0,
          itemCount: 1,
          occurredAt: new Date('2026-04-01T10:00:00.000Z'),
          processedAt: new Date('2026-04-01T10:01:00.000Z'),
          createdAt: new Date('2026-04-01T10:00:00.000Z'),
          updatedAt: new Date('2026-04-01T10:01:00.000Z'),
        },
      ],
      total: 1,
      page: 1,
      perPage: 20,
      totalPages: 1,
    });

    const result = await controller.findAll({
      branchId: 3,
      page: 1,
      limit: 20,
      status: PosCheckoutStatus.PROCESSED,
    });

    expect(posCheckoutService.findAll).toHaveBeenCalledWith({
      branchId: 3,
      page: 1,
      limit: 20,
      status: PosCheckoutStatus.PROCESSED,
    });
    expect(result.total).toBe(1);
  });

  it('returns a backend checkout quote for the active branch', async () => {
    await controller.quote({
      branchId: 3,
      transactionType: PosCheckoutTransactionType.SALE,
      promoCode: 'SAVE5',
      items: [
        {
          lineId: 'line-1',
          productId: 55,
          quantity: 2,
          unitPrice: 15,
          taxRate: 0.15,
        },
      ],
    });

    expect(posCheckoutService.quote).toHaveBeenCalledWith(
      expect.objectContaining({
        branchId: 3,
        promoCode: 'SAVE5',
      }),
    );
  });

  it('returns branch-scoped checkout detail', async () => {
    await controller.findOne(71, 3);

    expect(posCheckoutService.findOne).toHaveBeenCalledWith(71, 3);
  });

  it('passes the authenticated actor through checkout ingest', async () => {
    await controller.ingest(
      {
        branchId: 3,
        transactionType: PosCheckoutTransactionType.SALE,
        currency: 'USD',
        subtotal: 15,
        total: 15,
        occurredAt: '2026-04-01T10:00:00.000Z',
        items: [
          {
            productId: 55,
            quantity: 1,
            unitPrice: 15,
            lineTotal: 15,
          },
        ],
      },
      { user: { id: 17, email: 'cashier@suuq.test', roles: ['POS_OPERATOR'] } },
    );

    expect(posCheckoutService.ingest).toHaveBeenCalledWith(
      expect.objectContaining({ branchId: 3 }),
      expect.objectContaining({
        id: 17,
        email: 'cashier@suuq.test',
        roles: ['POS_OPERATOR'],
      }),
    );
  });
});
