import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { InventoryLedgerService } from '../branches/inventory-ledger.service';
import { VariantInventoryService } from '../branches/variant-inventory.service';
import { GeneralLedgerService } from '../accounting/general-ledger.service';
import { ProductCostService } from '../purchase-orders/product-cost.service';
import { Branch } from '../branches/entities/branch.entity';
import { StockMovementType } from '../branches/entities/stock-movement.entity';
import { PartnerCredential } from '../partner-credentials/entities/partner-credential.entity';
import { EmailService } from '../email/email.service';
import { ProductAliasesService } from '../product-aliases/product-aliases.service';
import { ProductAliasType } from '../product-aliases/entities/product-alias.entity';
import { Product } from '../products/entities/product.entity';
import { ListPosCheckoutsQueryDto } from './dto/list-pos-checkouts-query.dto';
import { PosCheckoutService } from './pos-checkout.service';
import {
  PosRegisterSession,
  PosRegisterSessionStatus,
} from './entities/pos-register-session.entity';
import {
  PosCheckout,
  PosCheckoutStatus,
  PosCheckoutTransactionType,
} from './entities/pos-checkout.entity';
import {
  PosSuspendedCart,
  PosSuspendedCartStatus,
} from './entities/pos-suspended-cart.entity';

describe('PosCheckoutService', () => {
  let service: PosCheckoutService;
  let posCheckoutsRepository: {
    create: jest.Mock;
    save: jest.Mock;
    findOne: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  let branchesRepository: { findOne: jest.Mock };
  let productsRepository: { findOne: jest.Mock };
  let partnerCredentialsRepository: { findOne: jest.Mock };
  let registerSessionsRepository: { findOne: jest.Mock; save: jest.Mock };
  let suspendedCartsRepository: { findOne: jest.Mock; save: jest.Mock };
  let inventoryLedgerService: { recordMovement: jest.Mock };
  let productAliasesService: { resolveProductIdForBranch: jest.Mock };
  let dataSource: { transaction: jest.Mock };
  let generalLedgerService: {
    post: jest.Mock;
    reverse: jest.Mock;
    findEntryByIdempotencyKey: jest.Mock;
  };
  let productCostService: { weightedAverageCosts: jest.Mock };

  beforeEach(async () => {
    generalLedgerService = {
      post: jest.fn().mockResolvedValue({ id: 1 }),
      reverse: jest.fn().mockResolvedValue(null),
      findEntryByIdempotencyKey: jest.fn().mockResolvedValue(null),
    };
    productCostService = {
      weightedAverageCosts: jest.fn().mockResolvedValue(new Map()),
    };
    posCheckoutsRepository = {
      create: jest.fn((value) => ({ id: value.id ?? 71, ...value })),
      save: jest.fn(async (value) => value),
      findOne: jest.fn().mockResolvedValue({ id: 71, status: 'PROCESSED' }),
      createQueryBuilder: jest.fn(),
    };

    branchesRepository = {
      findOne: jest.fn().mockResolvedValue({ id: 3 }),
    };

    productsRepository = {
      findOne: jest.fn().mockResolvedValue({
        id: 55,
        name: 'Sparkling Water',
        sku: 'WATER-600',
        currency: 'USD',
        price: 15,
        salePrice: 15,
        category: { name: 'SNACK' },
        manageStock: true,
      }),
    };

    partnerCredentialsRepository = {
      findOne: jest.fn().mockResolvedValue(null),
    };

    registerSessionsRepository = {
      findOne: jest.fn().mockResolvedValue(null),
      save: jest.fn(async (value) => value),
    };

    suspendedCartsRepository = {
      findOne: jest.fn().mockResolvedValue(null),
      save: jest.fn(async (value) => value),
    };

    inventoryLedgerService = {
      recordMovement: jest.fn().mockResolvedValue({}),
    };

    productAliasesService = {
      resolveProductIdForBranch: jest.fn().mockResolvedValue(55),
    };

    dataSource = {
      transaction: jest.fn(async (callback) =>
        callback({
          getRepository: jest.fn((entity) => {
            if (entity === PosCheckout) {
              return posCheckoutsRepository;
            }
            if (entity === PosRegisterSession) {
              return registerSessionsRepository;
            }
            if (entity === PosSuspendedCart) {
              return suspendedCartsRepository;
            }
            if (entity === Branch) {
              return branchesRepository;
            }
            if (entity === Product) {
              return productsRepository;
            }

            return null;
          }),
        }),
      ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PosCheckoutService,
        { provide: DataSource, useValue: dataSource },
        {
          provide: getRepositoryToken(PosCheckout),
          useValue: posCheckoutsRepository,
        },
        { provide: getRepositoryToken(Branch), useValue: branchesRepository },
        { provide: getRepositoryToken(Product), useValue: productsRepository },
        {
          provide: getRepositoryToken(PartnerCredential),
          useValue: partnerCredentialsRepository,
        },
        {
          provide: getRepositoryToken(PosRegisterSession),
          useValue: registerSessionsRepository,
        },
        {
          provide: getRepositoryToken(PosSuspendedCart),
          useValue: suspendedCartsRepository,
        },
        {
          provide: InventoryLedgerService,
          useValue: inventoryLedgerService,
        },
        { provide: ProductAliasesService, useValue: productAliasesService },
        { provide: EmailService, useValue: {} },
        {
          provide: VariantInventoryService,
          useValue: { recordVariantMovement: jest.fn() },
        },
        { provide: GeneralLedgerService, useValue: generalLedgerService },
        { provide: ProductCostService, useValue: productCostService },
      ],
    }).compile();

    service = module.get(PosCheckoutService);
  });

  it('quotes branch-scoped checkout totals with backend promotion rules', async () => {
    const result = await service.quote({
      branchId: 3,
      transactionType: PosCheckoutTransactionType.SALE,
      promoCode: 'SAVE5',
      items: [
        {
          lineId: 'line-1',
          productId: 55,
          sku: 'WATER-600',
          category: 'SNACK',
          quantity: 4,
          unitPrice: 15,
          taxRate: 0.15,
        },
      ],
    });

    expect(result.pricingSource).toBe('BACKEND_QUOTE');
    expect(result.automaticDiscount).toBeGreaterThan(0);
    expect(result.promoCodeDiscount).toBeGreaterThan(0);
    expect(result.grandTotal).toBeGreaterThan(0);
    expect(result.lines[0]?.promotionLabels.length).toBeGreaterThan(0);
  });

  it('quotes customer-type discounts for food-service baskets', async () => {
    const result = await service.quote({
      branchId: 3,
      transactionType: PosCheckoutTransactionType.SALE,
      customerProfile: {
        customerType: 'STAFF_MEAL',
      },
      items: [
        {
          lineId: 'line-1',
          productId: 55,
          sku: 'CAFE-LUNCH-TRAY',
          category: 'FOOD_SERVICE',
          quantity: 2,
          unitPrice: 185,
          taxRate: 0.15,
          metadata: {
            serviceFormat: 'BAKERY',
          },
        },
      ],
    });

    expect(result.customerPricingRule.code).toBe('STAFF_MEAL');
    expect(result.customerTypeDiscount).toBeGreaterThan(0);
    expect(result.discountTotal).toBe(result.customerTypeDiscount);
    expect(result.lines[0]?.customerTypeDiscount).toBeGreaterThan(0);
  });

  it('ingests sale checkouts into negative sale stock movements', async () => {
    posCheckoutsRepository.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 71,
        branchId: 3,
        registerSessionId: 11,
        suspendedCartId: 91,
        registerId: 'front-1',
        transactionType: PosCheckoutTransactionType.SALE,
        status: PosCheckoutStatus.PROCESSED,
        currency: 'USD',
        subtotal: 15,
        discountAmount: 0,
        taxAmount: 0,
        total: 15,
        paidAmount: 20,
        changeDue: 5,
        itemCount: 1,
        occurredAt: new Date('2026-04-01T10:00:00.000Z'),
        processedAt: new Date('2026-04-01T10:01:00.000Z'),
        tenders: [{ method: 'CASH', amount: 20 }],
        items: [
          {
            productId: 55,
            quantity: 2,
            unitPrice: 7.5,
            discountAmount: 0,
            taxAmount: 0,
            lineTotal: 15,
          },
        ],
        createdAt: new Date('2026-04-01T10:00:00.000Z'),
        updatedAt: new Date('2026-04-01T10:01:00.000Z'),
      });
    registerSessionsRepository.findOne.mockResolvedValueOnce({
      id: 11,
      branchId: 3,
      registerId: 'front-1',
      status: PosRegisterSessionStatus.OPEN,
    });
    suspendedCartsRepository.findOne.mockResolvedValueOnce({
      id: 91,
      branchId: 3,
      registerId: 'front-1',
      registerSessionId: 11,
      status: PosSuspendedCartStatus.SUSPENDED,
      metadata: null,
    });

    const result = await service.ingest(
      {
        branchId: 3,
        transactionType: PosCheckoutTransactionType.SALE,
        externalCheckoutId: 'sale-001',
        registerId: 'front-1',
        registerSessionId: 11,
        suspendedCartId: 91,
        receiptNumber: 'R-1001',
        currency: 'usd',
        subtotal: 15,
        total: 15,
        paidAmount: 20,
        changeDue: 5,
        occurredAt: '2026-04-01T10:00:00.000Z',
        items: [
          {
            productId: 55,
            quantity: 2,
            unitPrice: 7.5,
            lineTotal: 15,
          },
        ],
        tenders: [{ method: 'CASH', amount: 20 }],
      },
      { id: 17, roles: ['POS_OPERATOR'] },
    );

    expect(inventoryLedgerService.recordMovement).toHaveBeenCalledWith(
      expect.objectContaining({
        branchId: 3,
        productId: 55,
        movementType: StockMovementType.SALE,
        quantityDelta: -2,
        sourceType: 'POS_CHECKOUT',
        sourceReferenceId: 71,
        actorUserId: 17,
      }),
      expect.any(Object),
    );
    expect(suspendedCartsRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 91,
        status: PosSuspendedCartStatus.RESUMED,
        resumedByUserId: 17,
      }),
    );
    expect(result.status).toBe(PosCheckoutStatus.PROCESSED);
  });

  it('clamps a future occurredAt (device clock skew) to server time', async () => {
    // Idempotency lookups (no `where.id`) miss; the post-save reload (`where.id`) hits.
    posCheckoutsRepository.findOne.mockImplementation((opts) =>
      Promise.resolve(
        opts?.where?.id
          ? {
              id: 71,
              branchId: 3,
              transactionType: PosCheckoutTransactionType.SALE,
              status: PosCheckoutStatus.PROCESSED,
              currency: 'USD',
              subtotal: 15,
              total: 15,
              itemCount: 1,
              occurredAt: new Date('2026-04-01T10:00:00.000Z'),
              processedAt: new Date('2026-04-01T10:01:00.000Z'),
              tenders: [{ method: 'CASH', amount: 15 }],
              items: [
                { productId: 55, quantity: 1, unitPrice: 15, lineTotal: 15 },
              ],
              createdAt: new Date('2026-04-01T10:00:00.000Z'),
              updatedAt: new Date('2026-04-01T10:01:00.000Z'),
            }
          : null,
      ),
    );

    const before = Date.now();
    await service.ingest(
      {
        branchId: 3,
        transactionType: PosCheckoutTransactionType.SALE,
        receiptNumber: 'R-FUTURE',
        currency: 'usd',
        subtotal: 15,
        total: 15,
        paidAmount: 15,
        // Device clock is set far in the future — must never be stored verbatim,
        // otherwise the sale would be filed under a day that has not happened yet
        // and would vanish from the "Today" report.
        occurredAt: '2999-01-01T00:00:00.000Z',
        items: [{ productId: 55, quantity: 1, unitPrice: 15, lineTotal: 15 }],
        tenders: [{ method: 'CASH', amount: 15 }],
      },
      { id: 17, roles: ['POS_OPERATOR'] },
    );
    const after = Date.now();

    // The checkout is stamped with server "now", not the year-2999 client time.
    const createdWith = posCheckoutsRepository.create.mock.calls[0][0];
    const storedOccurredAt = createdWith.occurredAt as Date;
    expect(storedOccurredAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(storedOccurredAt.getTime()).toBeLessThanOrEqual(after);
    // The inventory movement is stamped with the same clamped time.
    expect(inventoryLedgerService.recordMovement).toHaveBeenCalledWith(
      expect.objectContaining({ occurredAt: storedOccurredAt }),
      expect.any(Object),
    );
  });

  it('preserves a past occurredAt (genuine offline sale synced later)', async () => {
    posCheckoutsRepository.findOne.mockImplementation((opts) =>
      Promise.resolve(
        opts?.where?.id
          ? {
              id: 71,
              branchId: 3,
              transactionType: PosCheckoutTransactionType.SALE,
              status: PosCheckoutStatus.PROCESSED,
              currency: 'USD',
              subtotal: 15,
              total: 15,
              itemCount: 1,
              occurredAt: new Date('2026-04-01T10:00:00.000Z'),
              processedAt: new Date('2026-04-01T10:01:00.000Z'),
              tenders: [{ method: 'CASH', amount: 15 }],
              items: [
                { productId: 55, quantity: 1, unitPrice: 15, lineTotal: 15 },
              ],
              createdAt: new Date('2026-04-01T10:00:00.000Z'),
              updatedAt: new Date('2026-04-01T10:01:00.000Z'),
            }
          : null,
      ),
    );

    // A real sale that happened in the past and is only now syncing — keep its time.
    const offlineIso = '2026-04-01T10:00:00.000Z';
    await service.ingest(
      {
        branchId: 3,
        transactionType: PosCheckoutTransactionType.SALE,
        receiptNumber: 'R-OFFLINE',
        currency: 'usd',
        subtotal: 15,
        total: 15,
        paidAmount: 15,
        occurredAt: offlineIso,
        captureState: 'OFFLINE_CAPTURED',
        items: [{ productId: 55, quantity: 1, unitPrice: 15, lineTotal: 15 }],
        tenders: [{ method: 'CASH', amount: 15 }],
      },
      { id: 17, roles: ['POS_OPERATOR'] },
    );

    const storedOccurredAt = posCheckoutsRepository.create.mock.calls[0][0]
      .occurredAt as Date;
    expect(storedOccurredAt.toISOString()).toBe(offlineIso);
  });

  it('preserves client capture time for online captures (not server receive time)', async () => {
    posCheckoutsRepository.findOne.mockImplementation((opts) =>
      Promise.resolve(
        opts?.where?.id
          ? {
              id: 71,
              branchId: 3,
              transactionType: PosCheckoutTransactionType.SALE,
              status: PosCheckoutStatus.PROCESSED,
              currency: 'USD',
              subtotal: 15,
              total: 15,
              itemCount: 1,
              occurredAt: new Date('2026-04-01T10:00:00.000Z'),
              processedAt: new Date('2026-04-01T10:01:00.000Z'),
              tenders: [{ method: 'CASH', amount: 15 }],
              items: [
                { productId: 55, quantity: 1, unitPrice: 15, lineTotal: 15 },
              ],
              createdAt: new Date('2026-04-01T10:00:00.000Z'),
              updatedAt: new Date('2026-04-01T10:01:00.000Z'),
            }
          : null,
      ),
    );

    // Even for ONLINE_CAPTURED, the client-supplied occurredAt is the capture
    // time and must be preserved.  Using server receive-time instead would cause
    // brief sync delays (e.g., a momentary network blip) to mis-file the sale
    // into the wrong report day if the sync arrived after EAT midnight.
    const captureIso = '2026-04-01T10:00:00.000Z';
    await service.ingest(
      {
        branchId: 3,
        transactionType: PosCheckoutTransactionType.SALE,
        receiptNumber: 'R-ONLINE',
        currency: 'usd',
        subtotal: 15,
        total: 15,
        paidAmount: 15,
        occurredAt: captureIso,
        captureState: 'ONLINE_CAPTURED',
        items: [{ productId: 55, quantity: 1, unitPrice: 15, lineTotal: 15 }],
        tenders: [{ method: 'CASH', amount: 15 }],
      },
      { id: 17, roles: ['POS_OPERATOR'] },
    );

    const stored = posCheckoutsRepository.create.mock.calls[0][0]
      .occurredAt as Date;
    // Stored time is the client capture time, NOT server receive time.
    expect(stored.toISOString()).toBe(captureIso);
  });

  it('persists customer profile metadata during checkout ingest', async () => {
    posCheckoutsRepository.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 72,
        branchId: 3,
        transactionType: PosCheckoutTransactionType.SALE,
        status: PosCheckoutStatus.PROCESSED,
        currency: 'USD',
        subtotal: 185,
        discountAmount: 27.75,
        taxAmount: 23.59,
        total: 180.84,
        paidAmount: 180.84,
        changeDue: 0,
        itemCount: 1,
        occurredAt: new Date('2026-04-01T11:00:00.000Z'),
        processedAt: new Date('2026-04-01T11:01:00.000Z'),
        metadata: {
          customerProfile: { customerType: 'STAFF_MEAL' },
          pricingSummary: {
            serviceType: 'TO_GO',
            packagingCharge: 12,
          },
        },
        tenders: [{ method: 'CARD', amount: 180.84 }],
        items: [
          {
            productId: 55,
            quantity: 1,
            unitPrice: 185,
            discountAmount: 27.75,
            taxAmount: 23.59,
            lineTotal: 180.84,
          },
        ],
        createdAt: new Date('2026-04-01T11:00:00.000Z'),
        updatedAt: new Date('2026-04-01T11:01:00.000Z'),
      });

    const result = await service.ingest(
      {
        branchId: 3,
        transactionType: PosCheckoutTransactionType.SALE,
        externalCheckoutId: 'sale-002',
        receiptNumber: 'R-1002',
        currency: 'USD',
        subtotal: 185,
        discountAmount: 27.75,
        taxAmount: 23.59,
        total: 180.84,
        paidAmount: 180.84,
        changeDue: 0,
        occurredAt: '2026-04-01T11:00:00.000Z',
        customerProfile: {
          customerType: 'STAFF_MEAL',
        },
        pricingSummary: {
          grandTotal: 180.84,
          taxTotal: 23.59,
          discountTotal: 27.75,
          serviceType: 'TO_GO',
          packagingCharge: 12,
        },
        items: [
          {
            productId: 55,
            quantity: 1,
            unitPrice: 185,
            discountAmount: 27.75,
            taxAmount: 23.59,
            lineTotal: 180.84,
          },
        ],
      },
      { id: 17, roles: ['POS_OPERATOR'] },
    );

    expect(posCheckoutsRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          customerProfile: { customerType: 'STAFF_MEAL' },
          pricingSummary: expect.objectContaining({
            serviceType: 'TO_GO',
            packagingCharge: 12,
          }),
        }),
      }),
    );
    expect(result.customerProfile).toEqual({ customerType: 'STAFF_MEAL' });
    expect(result.pricingSummary).toEqual(
      expect.objectContaining({
        serviceType: 'TO_GO',
        packagingCharge: 12,
      }),
    );
  });

  it('persists loyalty and normalized hotel checkout item metadata during ingest', async () => {
    posCheckoutsRepository.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 73,
        branchId: 3,
        transactionType: PosCheckoutTransactionType.SALE,
        status: PosCheckoutStatus.PROCESSED,
        currency: 'USD',
        subtotal: 340,
        discountAmount: 0,
        taxAmount: 51,
        total: 391,
        paidAmount: 391,
        changeDue: 0,
        itemCount: 1,
        occurredAt: new Date('2026-04-01T12:00:00.000Z'),
        processedAt: new Date('2026-04-01T12:01:00.000Z'),
        metadata: {
          loyaltySummary: {
            memberId: 'LOY-204',
            programName: 'Neighborhood Rewards',
            pointsEarned: 12,
          },
        },
        tenders: [{ method: 'CARD', amount: 391 }],
        items: [
          {
            productId: 55,
            quantity: 1,
            unitPrice: 340,
            discountAmount: 0,
            taxAmount: 51,
            lineTotal: 391,
            metadata: {
              serviceFormat: 'HOTEL',
              tableArea: 'PATIO',
              tableLabel: 'Table 12',
              course: 'MAIN',
              courseServiceState: 'READY',
              courseReadyAt: '2026-04-01T12:05:00.000Z',
            },
          },
        ],
        createdAt: new Date('2026-04-01T12:00:00.000Z'),
        updatedAt: new Date('2026-04-01T12:01:00.000Z'),
      });

    const result = await service.ingest(
      {
        branchId: 3,
        transactionType: PosCheckoutTransactionType.SALE,
        externalCheckoutId: 'sale-003',
        receiptNumber: 'R-1003',
        currency: 'USD',
        subtotal: 340,
        taxAmount: 51,
        total: 391,
        paidAmount: 391,
        changeDue: 0,
        occurredAt: '2026-04-01T12:00:00.000Z',
        loyaltySummary: {
          memberId: 'LOY-204',
          programName: 'Neighborhood Rewards',
          pointsEarned: 12,
        },
        items: [
          {
            productId: 55,
            quantity: 1,
            unitPrice: 340,
            taxAmount: 51,
            lineTotal: 391,
            metadata: {
              serviceFormat: 'hotel',
              tableArea: 'patio',
              tableLabel: 'Table 12',
              course: 'main',
              courseServiceState: 'ready',
              courseReadyAt: '2026-04-01T12:05:00.000Z',
            },
          },
        ],
        tenders: [{ method: 'CARD', amount: 391 }],
      },
      { id: 17, roles: ['POS_OPERATOR'] },
    );

    expect(posCheckoutsRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          loyaltySummary: expect.objectContaining({
            memberId: 'LOY-204',
            pointsEarned: 12,
          }),
        }),
        items: [
          expect.objectContaining({
            metadata: expect.objectContaining({
              serviceFormat: 'HOTEL',
              tableArea: 'PATIO',
              tableLabel: 'Table 12',
              course: 'MAIN',
              courseServiceState: 'READY',
              courseReadyAt: '2026-04-01T12:05:00.000Z',
            }),
          }),
        ],
      }),
    );
    expect(result.loyaltySummary).toEqual(
      expect.objectContaining({
        memberId: 'LOY-204',
        pointsEarned: 12,
      }),
    );
    expect(result.items[0]?.metadata).toEqual(
      expect.objectContaining({
        serviceFormat: 'HOTEL',
        tableArea: 'PATIO',
        tableLabel: 'Table 12',
        course: 'MAIN',
        courseServiceState: 'READY',
      }),
    );
  });

  it('ingests returns into positive adjustment stock movements', async () => {
    posCheckoutsRepository.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 70,
        branchId: 3,
        receiptNumber: 'POS-3-1001',
        transactionType: PosCheckoutTransactionType.SALE,
        status: PosCheckoutStatus.PROCESSED,
      })
      .mockResolvedValueOnce({
        id: 71,
        branchId: 3,
        transactionType: PosCheckoutTransactionType.RETURN,
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
        tenders: [{ method: 'CARD', amount: 15 }],
        items: [
          {
            productId: 55,
            quantity: 1,
            unitPrice: 15,
            discountAmount: 0,
            taxAmount: 0,
            lineTotal: 15,
          },
        ],
        createdAt: new Date('2026-04-01T10:00:00.000Z'),
        updatedAt: new Date('2026-04-01T10:01:00.000Z'),
      });

    await service.ingest({
      branchId: 3,
      transactionType: PosCheckoutTransactionType.RETURN,
      externalCheckoutId: 'return-001',
      sourceReceiptNumber: 'POS-3-1001',
      refundMethod: 'CARD',
      currency: 'USD',
      subtotal: 15,
      total: 15,
      paidAmount: 15,
      occurredAt: '2026-04-01T10:00:00.000Z',
      items: [
        {
          productId: 55,
          quantity: 1,
          unitPrice: 15,
          lineTotal: 15,
        },
      ],
      tenders: [{ method: 'CARD', amount: 15 }],
    });

    expect(inventoryLedgerService.recordMovement).toHaveBeenCalledWith(
      expect.objectContaining({
        movementType: StockMovementType.ADJUSTMENT,
        quantityDelta: 1,
      }),
      expect.any(Object),
    );
  });

  it('rejects returns when source sale is not processed and persists the failure', async () => {
    posCheckoutsRepository.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 88,
        branchId: 3,
        receiptNumber: 'POS-3-1001',
        transactionType: PosCheckoutTransactionType.SALE,
        status: PosCheckoutStatus.FAILED,
      })
      .mockResolvedValueOnce({
        id: 71,
        branchId: 3,
        receiptNumber: 'RET-3-1002',
        transactionType: PosCheckoutTransactionType.RETURN,
        status: PosCheckoutStatus.FAILED,
        failureReason:
          'Return source sale POS-3-1001 is FAILED and cannot be returned until it is PROCESSED',
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
        tenders: [{ method: 'CARD', amount: 15 }],
        items: [
          {
            productId: 55,
            quantity: 1,
            unitPrice: 15,
            discountAmount: 0,
            taxAmount: 0,
            lineTotal: 15,
          },
        ],
        createdAt: new Date('2026-04-01T10:00:00.000Z'),
        updatedAt: new Date('2026-04-01T10:01:00.000Z'),
      });

    const result = await service.ingest({
      branchId: 3,
      transactionType: PosCheckoutTransactionType.RETURN,
      externalCheckoutId: 'return-guard-001',
      sourceReceiptNumber: 'POS-3-1001',
      refundMethod: 'CARD',
      currency: 'USD',
      subtotal: 15,
      total: 15,
      paidAmount: 15,
      occurredAt: '2026-04-01T10:00:00.000Z',
      items: [
        {
          productId: 55,
          quantity: 1,
          unitPrice: 15,
          lineTotal: 15,
        },
      ],
      tenders: [{ method: 'CARD', amount: 15 }],
    });

    expect(posCheckoutsRepository.save).toHaveBeenLastCalledWith(
      expect.objectContaining({
        status: PosCheckoutStatus.FAILED,
        failureReason: expect.stringContaining(
          'cannot be returned until it is PROCESSED',
        ),
      }),
    );
    expect(result.status).toBe(PosCheckoutStatus.FAILED);
    expect(result.failureReason).toContain(
      'cannot be returned until it is PROCESSED',
    );
    expect(inventoryLedgerService.recordMovement).not.toHaveBeenCalled();
  });

  it('returns existing checkouts for idempotent retries', async () => {
    posCheckoutsRepository.findOne.mockResolvedValue({
      id: 71,
      branchId: 3,
      externalCheckoutId: 'sale-001',
      idempotencyKey: 'idem-1',
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
      metadata: {
        customerProfile: {
          name: 'Liya Tesfaye',
          phoneNumber: '251911000111',
          reference: 'CRM-21',
        },
        loyaltySummary: {
          memberId: 'LOY-204',
          programName: 'Neighborhood Rewards',
          pointsEarned: 12,
        },
      },
      tenders: [],
      items: [],
      createdAt: new Date('2026-04-01T10:00:00.000Z'),
      updatedAt: new Date('2026-04-01T10:01:00.000Z'),
    });

    const result = await service.ingest({
      branchId: 3,
      transactionType: PosCheckoutTransactionType.SALE,
      idempotencyKey: 'idem-1',
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
    });

    expect(posCheckoutsRepository.save).not.toHaveBeenCalled();
    expect(inventoryLedgerService.recordMovement).not.toHaveBeenCalled();
    expect(result.id).toBe(71);
    expect(result.customerProfile).toEqual(
      expect.objectContaining({
        name: 'Liya Tesfaye',
        phoneNumber: '251911000111',
      }),
    );
    expect(result.loyaltySummary).toEqual(
      expect.objectContaining({
        memberId: 'LOY-204',
        pointsEarned: 12,
      }),
    );
  });

  it('persists failed checkouts for business-rule errors', async () => {
    posCheckoutsRepository.findOne.mockResolvedValueOnce({
      id: 71,
      branchId: 3,
      transactionType: PosCheckoutTransactionType.SALE,
      status: PosCheckoutStatus.FAILED,
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
      failureReason: 'No product alias matched BARCODE:0001',
      tenders: [],
      items: [
        {
          aliasType: ProductAliasType.BARCODE,
          aliasValue: '0001',
          quantity: 1,
          unitPrice: 15,
          discountAmount: 0,
          taxAmount: 0,
          lineTotal: 15,
        },
      ],
      createdAt: new Date('2026-04-01T10:00:00.000Z'),
      updatedAt: new Date('2026-04-01T10:01:00.000Z'),
    });
    productAliasesService.resolveProductIdForBranch.mockResolvedValueOnce(null);

    const result = await service.ingest({
      branchId: 3,
      transactionType: PosCheckoutTransactionType.SALE,
      currency: 'USD',
      subtotal: 15,
      total: 15,
      occurredAt: '2026-04-01T10:00:00.000Z',
      items: [
        {
          aliasType: ProductAliasType.BARCODE,
          aliasValue: '0001',
          quantity: 1,
          unitPrice: 15,
          lineTotal: 15,
        },
      ],
    });

    expect(posCheckoutsRepository.save).toHaveBeenLastCalledWith(
      expect.objectContaining({
        status: PosCheckoutStatus.FAILED,
        failureReason: 'No product alias matched BARCODE:0001',
      }),
    );
    expect(result.status).toBe(PosCheckoutStatus.FAILED);
  });

  it('returns paginated branch-scoped checkout history', async () => {
    const queryBuilder = {
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([
        [
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
        1,
      ]),
    };
    posCheckoutsRepository.createQueryBuilder.mockReturnValue(queryBuilder);

    const result = await service.findAll({
      branchId: 3,
      page: 1,
      limit: 20,
      status: PosCheckoutStatus.PROCESSED,
      transactionType: PosCheckoutTransactionType.SALE,
    });

    expect(result.total).toBe(1);
    expect(result.items[0]?.id).toBe(71);
    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      'checkout.status = :status',
      { status: PosCheckoutStatus.PROCESSED },
    );
  });

  it('rejects checkouts against closed register sessions and persists the failure', async () => {
    posCheckoutsRepository.findOne.mockResolvedValue({
      id: 71,
      branchId: 3,
      registerSessionId: 11,
      transactionType: PosCheckoutTransactionType.SALE,
      status: PosCheckoutStatus.FAILED,
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
      failureReason: 'Register session 11 is not open',
      tenders: [],
      items: [],
      createdAt: new Date('2026-04-01T10:00:00.000Z'),
      updatedAt: new Date('2026-04-01T10:01:00.000Z'),
    });
    registerSessionsRepository.findOne.mockResolvedValueOnce({
      id: 11,
      branchId: 3,
      registerId: 'front-1',
      status: PosRegisterSessionStatus.CLOSED,
    });

    const result = await service.ingest({
      branchId: 3,
      transactionType: PosCheckoutTransactionType.SALE,
      registerId: 'front-1',
      registerSessionId: 11,
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
    });

    expect(posCheckoutsRepository.save).toHaveBeenLastCalledWith(
      expect.objectContaining({
        status: PosCheckoutStatus.FAILED,
        failureReason: 'Register session 11 is not open',
      }),
    );
    expect(result.status).toBe(PosCheckoutStatus.FAILED);
    expect(inventoryLedgerService.recordMovement).not.toHaveBeenCalled();
  });

  it('persists return linkage and pricing summary metadata for return ingests', async () => {
    posCheckoutsRepository.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 70,
        branchId: 3,
        receiptNumber: 'POS-3-1001',
        transactionType: PosCheckoutTransactionType.SALE,
        status: PosCheckoutStatus.PROCESSED,
      })
      .mockResolvedValueOnce({
        id: 71,
        branchId: 3,
        transactionType: PosCheckoutTransactionType.RETURN,
        status: PosCheckoutStatus.PROCESSED,
        currency: 'USD',
        subtotal: 15,
        discountAmount: 1,
        taxAmount: 2.1,
        total: 16.1,
        paidAmount: 16.1,
        changeDue: 0,
        itemCount: 1,
        occurredAt: new Date('2026-04-01T10:00:00.000Z'),
        processedAt: new Date('2026-04-01T10:01:00.000Z'),
        metadata: {
          returnContext: {
            sourceReceiptId: 'receipt-1',
            sourceReceiptNumber: 'POS-3-1001',
            refundMethod: 'CARD',
          },
          pricingSummary: {
            discountTotal: 1,
            taxTotal: 2.1,
            grandTotal: 16.1,
          },
        },
        tenders: [{ method: 'CARD', amount: 16.1 }],
        items: [
          {
            productId: 55,
            quantity: 1,
            unitPrice: 15,
            discountAmount: 1,
            taxAmount: 2.1,
            lineTotal: 16.1,
          },
        ],
        createdAt: new Date('2026-04-01T10:00:00.000Z'),
        updatedAt: new Date('2026-04-01T10:01:00.000Z'),
      });

    const result = await service.ingest({
      branchId: 3,
      transactionType: PosCheckoutTransactionType.RETURN,
      externalCheckoutId: 'return-002',
      sourceReceiptId: 'receipt-1',
      sourceReceiptNumber: 'POS-3-1001',
      refundMethod: 'CARD',
      currency: 'USD',
      subtotal: 15,
      discountAmount: 1,
      taxAmount: 2.1,
      total: 16.1,
      paidAmount: 16.1,
      occurredAt: '2026-04-01T10:00:00.000Z',
      pricingSummary: {
        discountTotal: 1,
        taxTotal: 2.1,
        grandTotal: 16.1,
      },
      items: [
        {
          productId: 55,
          quantity: 1,
          unitPrice: 15,
          discountAmount: 1,
          taxAmount: 2.1,
          lineTotal: 16.1,
        },
      ],
      tenders: [{ method: 'CARD', amount: 16.1 }],
    });

    expect(posCheckoutsRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          returnContext: expect.objectContaining({
            sourceReceiptId: 'receipt-1',
            sourceReceiptNumber: 'POS-3-1001',
            refundMethod: 'CARD',
          }),
          pricingSummary: expect.objectContaining({
            grandTotal: 16.1,
          }),
        }),
      }),
    );
    expect(result.sourceReceiptNumber).toBe('POS-3-1001');
    expect(result.refundMethod).toBe('CARD');
  });

  describe('general-ledger posting', () => {
    const lineTotals = (lines: any[]) => {
      const debit = lines.reduce((s, l) => s + Number(l.debit || 0), 0);
      const credit = lines.reduce((s, l) => s + Number(l.credit || 0), 0);
      return {
        debit: Math.round(debit * 100) / 100,
        credit: Math.round(credit * 100) / 100,
      };
    };
    const findLine = (lines: any[], code: string) =>
      lines.find((l) => l.accountCode === code);

    const cashSaleCheckout = (overrides: Record<string, any> = {}) => ({
      id: 71,
      branchId: 3,
      transactionType: PosCheckoutTransactionType.SALE,
      currency: 'ETB',
      total: 100,
      paidAmount: 100,
      taxAmount: 0,
      occurredAt: new Date('2026-06-12T10:00:00Z'),
      tenders: [{ method: 'CASH', amount: 100 }],
      metadata: {
        financialClassification: {
          recognitionBasis: 'CASH',
          revenue: { account: 'SERVICE_REVENUE', amount: 100 },
          cogsSource: 'INVENTORY',
        },
      },
      ...overrides,
    });

    it('posts a balanced cash sale (Dr Cash / Cr Service revenue)', async () => {
      await (service as any).postCheckoutToLedger(cashSaleCheckout());

      expect(generalLedgerService.post).toHaveBeenCalledTimes(1);
      const entry = generalLedgerService.post.mock.calls[0][0];
      const { debit, credit } = lineTotals(entry.lines);
      expect(debit).toBe(100);
      expect(credit).toBe(100);
      expect(findLine(entry.lines, '1000').debit).toBe(100); // CASH
      expect(findLine(entry.lines, '4000').credit).toBe(100); // SERVICE_REVENUE
      expect(entry.sourceType).toBe('POS_CHECKOUT');
    });

    it('balances a cash sale where the customer tendered change (paid > total)', async () => {
      await (service as any).postCheckoutToLedger(
        cashSaleCheckout({
          paidAmount: 150, // tendered 150 for a 100 sale
          changeDue: 50,
          tenders: [{ method: 'CASH', amount: 150 }],
        }),
      );

      expect(generalLedgerService.post).toHaveBeenCalledTimes(1);
      const entry = generalLedgerService.post.mock.calls[0][0];
      const { debit, credit } = lineTotals(entry.lines);
      expect(debit).toBe(100); // net cash retained, not the 150 tendered
      expect(credit).toBe(100);
      expect(findLine(entry.lines, '1000').debit).toBe(100); // CASH = paid − change
      expect(findLine(entry.lines, '1100')).toBeUndefined(); // no spurious receivable
    });

    it('books the unpaid remainder of an account-credit sale to receivables', async () => {
      await (service as any).postCheckoutToLedger(
        cashSaleCheckout({
          paidAmount: 40,
          tenders: [{ method: 'CASH', amount: 40 }],
        }),
      );

      const entry = generalLedgerService.post.mock.calls[0][0];
      const { debit, credit } = lineTotals(entry.lines);
      expect(debit).toBe(100);
      expect(credit).toBe(100);
      expect(findLine(entry.lines, '1000').debit).toBe(40); // CASH paid
      expect(findLine(entry.lines, '1100').debit).toBe(60); // ACCOUNTS_RECEIVABLE
    });

    it('splits tax out of revenue into the tax-payable account', async () => {
      await (service as any).postCheckoutToLedger(
        cashSaleCheckout({ taxAmount: 15 }),
      );
      const entry = generalLedgerService.post.mock.calls[0][0];
      expect(findLine(entry.lines, '4000').credit).toBe(85); // revenue net of tax
      expect(findLine(entry.lines, '2100').credit).toBe(15); // TAX_PAYABLE
      const { debit, credit } = lineTotals(entry.lines);
      expect(debit).toBe(credit);
    });

    it('mirrors a return (Cr Cash / Dr revenue)', async () => {
      await (service as any).postCheckoutToLedger(
        cashSaleCheckout({
          transactionType: PosCheckoutTransactionType.RETURN,
        }),
      );
      const entry = generalLedgerService.post.mock.calls[0][0];
      expect(entry.sourceType).toBe('POS_RETURN');
      expect(findLine(entry.lines, '1000').credit).toBe(100); // cash out
      expect(findLine(entry.lines, '4000').debit).toBe(100); // revenue reversed
    });

    it('does not post accrual-format checkouts (deferred to the hospitality phase)', async () => {
      await (service as any).postCheckoutToLedger(
        cashSaleCheckout({
          metadata: {
            financialClassification: {
              recognitionBasis: 'ACCRUAL',
              revenue: { account: 'RENTAL_REVENUE', amount: 100 },
            },
          },
        }),
      );
      expect(generalLedgerService.post).not.toHaveBeenCalled();
    });

    it('does not post when no financialClassification was sent', async () => {
      await (service as any).postCheckoutToLedger(
        cashSaleCheckout({ metadata: {} }),
      );
      expect(generalLedgerService.post).not.toHaveBeenCalled();
    });

    it('posts COGS relief at weighted-average cost for inventory sales', async () => {
      productCostService.weightedAverageCosts.mockResolvedValueOnce(
        new Map([[55, 10]]),
      );
      await (service as any).postCheckoutToLedger(
        cashSaleCheckout({ items: [{ productId: 55, quantity: 2 }] }),
      );
      const cogs = generalLedgerService.post.mock.calls
        .map((c) => c[0])
        .find((e) => String(e.idempotencyKey).startsWith('pos-cogs-'));
      expect(cogs).toBeTruthy();
      expect(findLine(cogs.lines, '5000').debit).toBe(20); // COGS = 10 × 2
      expect(findLine(cogs.lines, '1200').credit).toBe(20); // INVENTORY
    });

    it('does not post COGS for service-cost formats', async () => {
      await (service as any).postCheckoutToLedger(
        cashSaleCheckout({
          items: [{ productId: 55, quantity: 2 }],
          metadata: {
            financialClassification: {
              recognitionBasis: 'CASH',
              revenue: { account: 'SERVICE_REVENUE', amount: 100 },
              cogsSource: 'SERVICE_COST',
            },
          },
        }),
      );
      const cogs = generalLedgerService.post.mock.calls
        .map((c) => c[0])
        .find((e) => String(e.idempotencyKey).startsWith('pos-cogs-'));
      expect(cogs).toBeUndefined();
      expect(productCostService.weightedAverageCosts).not.toHaveBeenCalled();
    });

    it('settleReceivable posts Dr Cash / Cr Accounts receivable', async () => {
      const result = await service.settleReceivable(
        {
          branchId: 3,
          idempotencyKey: 'ar-settle-POS-3-555-30000',
          currency: 'ETB',
          originalReceiptNumber: 'POS-3-555',
          settledAmount: 300,
          tenders: [{ method: 'CASH', amount: 300 }],
        },
        { id: 9 },
      );

      expect(result.posted).toBe(true);
      const entry = generalLedgerService.post.mock.calls[0][0];
      expect(entry.sourceType).toBe('AR_SETTLEMENT');
      expect(findLine(entry.lines, '1000').debit).toBe(300); // CASH
      expect(findLine(entry.lines, '1100').credit).toBe(300); // ACCOUNTS_RECEIVABLE
      const { debit, credit } = lineTotals(entry.lines);
      expect(debit).toBe(credit);
    });
  });
});
