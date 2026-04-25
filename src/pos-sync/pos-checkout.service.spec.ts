import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { InventoryLedgerService } from '../branches/inventory-ledger.service';
import { Branch } from '../branches/entities/branch.entity';
import { StockMovementType } from '../branches/entities/stock-movement.entity';
import { PartnerCredential } from '../partner-credentials/entities/partner-credential.entity';
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

  beforeEach(async () => {
    posCheckoutsRepository = {
      create: jest.fn((value) => ({ id: value.id ?? 71, ...value })),
      save: jest.fn(async (value) => value),
      findOne: jest.fn(),
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
            serviceFormat: 'CAFETERIA',
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

  it('persists loyalty and normalized FSR checkout item metadata during ingest', async () => {
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
              serviceFormat: 'FSR',
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
              serviceFormat: 'fsr',
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
              serviceFormat: 'FSR',
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
        serviceFormat: 'FSR',
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
    } as ListPosCheckoutsQueryDto);

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
});
