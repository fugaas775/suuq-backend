import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  PurchaseOrder,
  PurchaseOrderStatus,
} from '../purchase-orders/entities/purchase-order.entity';
import { PurchaseOrdersService } from '../purchase-orders/purchase-orders.service';
import { RetailEntitlementsService } from '../retail/retail-entitlements.service';
import { SupplierOffer } from '../supplier-offers/entities/supplier-offer.entity';
import { ReplenishmentService } from './replenishment.service';

describe('ReplenishmentService', () => {
  let service: ReplenishmentService;
  let purchaseOrdersRepository: {
    create: jest.Mock;
    save: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  let supplierOffersRepository: { createQueryBuilder: jest.Mock };
  let retailEntitlementsService: {
    getActiveBranchModuleEntitlement: jest.Mock;
  };
  let purchaseOrdersService: {
    updateStatus: jest.Mock;
    updateStatusWithManager: jest.Mock;
  };

  beforeEach(async () => {
    purchaseOrdersRepository = {
      create: jest.fn((value: any) => value),
      save: jest.fn(async (value: any) => ({
        id: value.id ?? 19,
        ...value,
      })),
      createQueryBuilder: jest.fn(),
    };
    supplierOffersRepository = {
      createQueryBuilder: jest.fn(),
    };
    retailEntitlementsService = {
      getActiveBranchModuleEntitlement: jest.fn().mockResolvedValue({
        metadata: null,
      }),
    };
    purchaseOrdersService = {
      updateStatus: jest.fn(),
      updateStatusWithManager: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReplenishmentService,
        {
          provide: getRepositoryToken(PurchaseOrder),
          useValue: purchaseOrdersRepository,
        },
        {
          provide: getRepositoryToken(SupplierOffer),
          useValue: supplierOffersRepository,
        },
        {
          provide: RetailEntitlementsService,
          useValue: retailEntitlementsService,
        },
        {
          provide: PurchaseOrdersService,
          useValue: purchaseOrdersService,
        },
      ],
    }).compile();

    service = module.get(ReplenishmentService);
  });

  it('creates a draft auto replenishment purchase order when inventory crosses threshold', async () => {
    const supplierOfferQb = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue({
        id: 8,
        supplierProfileId: 21,
        unitWholesalePrice: 11,
        moq: 4,
        leadTimeDays: 2,
        currency: 'USD',
      }),
    };
    const openOrderQb = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(null),
    };
    const autoDraftQb = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(null),
    };

    supplierOffersRepository.createQueryBuilder.mockReturnValue(
      supplierOfferQb,
    );
    purchaseOrdersRepository.createQueryBuilder
      .mockReturnValueOnce(openOrderQb)
      .mockReturnValueOnce(autoDraftQb);

    const result = await service.maybeCreateDraftPurchaseOrder(
      {
        branchId: 3,
        productId: 9,
        safetyStock: 5,
        availableToSell: 2,
      } as any,
      { trigger: 'DISPATCHED_TRANSFER', sourceTransferId: 77, actorUserId: 4 },
    );

    expect(result).toEqual(
      expect.objectContaining({
        branchId: 3,
        supplierProfileId: 21,
        status: PurchaseOrderStatus.DRAFT,
      }),
    );
    expect(purchaseOrdersRepository.save).toHaveBeenCalled();
  });

  it('skips replenishment when inventory stays above threshold', async () => {
    const result = await service.maybeCreateDraftPurchaseOrder(
      {
        branchId: 3,
        productId: 9,
        safetyStock: 2,
        availableToSell: 3,
      } as any,
      { trigger: 'DISPATCHED_TRANSFER' },
    );

    expect(result).toBeNull();
    expect(supplierOffersRepository.createQueryBuilder).not.toHaveBeenCalled();
    expect(
      retailEntitlementsService.getActiveBranchModuleEntitlement,
    ).not.toHaveBeenCalled();
  });

  it('skips replenishment when inventory automation is not entitled', async () => {
    retailEntitlementsService.getActiveBranchModuleEntitlement.mockResolvedValue(
      null,
    );

    const result = await service.maybeCreateDraftPurchaseOrder(
      {
        branchId: 3,
        productId: 9,
        safetyStock: 5,
        availableToSell: 2,
      } as any,
      { trigger: 'DISPATCHED_TRANSFER' },
    );

    expect(result).toBeNull();
    expect(
      retailEntitlementsService.getActiveBranchModuleEntitlement,
    ).toHaveBeenCalledWith(3, 'INVENTORY_AUTOMATION');
    expect(supplierOffersRepository.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('auto submits a replenishment draft when entitlement policy allows it', async () => {
    retailEntitlementsService.getActiveBranchModuleEntitlement.mockResolvedValue(
      {
        metadata: {
          replenishmentPolicy: {
            submissionMode: 'AUTO_SUBMIT',
          },
        },
      },
    );
    purchaseOrdersService.updateStatus.mockImplementation(
      async (_id: number, dto: any) => ({
        id: 19,
        status: dto.status,
        statusMeta: {
          lastTransition: {
            toStatus: dto.status,
          },
        },
      }),
    );

    const supplierOfferQb = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue({
        id: 8,
        supplierProfileId: 21,
        unitWholesalePrice: 11,
        moq: 4,
        leadTimeDays: 2,
        currency: 'USD',
      }),
    };
    const openOrderQb = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(null),
    };
    const autoDraftQb = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(null),
    };

    supplierOffersRepository.createQueryBuilder.mockReturnValue(
      supplierOfferQb,
    );
    purchaseOrdersRepository.createQueryBuilder
      .mockReturnValueOnce(openOrderQb)
      .mockReturnValueOnce(autoDraftQb);

    const result = await service.maybeCreateDraftPurchaseOrder(
      {
        branchId: 3,
        productId: 9,
        safetyStock: 5,
        availableToSell: 2,
      } as any,
      { trigger: 'POS_SYNC', actorUserId: 4 },
    );

    expect(purchaseOrdersService.updateStatus).toHaveBeenCalledWith(
      expect.any(Number),
      expect.objectContaining({
        status: PurchaseOrderStatus.SUBMITTED,
        reason: 'Auto submitted by inventory automation policy',
      }),
      expect.objectContaining({
        id: 4,
        roles: ['POS_MANAGER'],
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        status: PurchaseOrderStatus.SUBMITTED,
      }),
    );
  });

  it('keeps replenishment drafts open when the policy window blocks submission', async () => {
    const realDate = Date;
    const fixedDate = new Date('2026-03-18T03:00:00.000Z');

    global.Date = class extends Date {
      constructor(value?: any) {
        super(value ?? fixedDate.toISOString());
      }

      static now() {
        return fixedDate.getTime();
      }
    } as DateConstructor;

    retailEntitlementsService.getActiveBranchModuleEntitlement.mockResolvedValue(
      {
        metadata: {
          replenishmentPolicy: {
            submissionMode: 'AUTO_SUBMIT',
            orderWindow: {
              daysOfWeek: [1],
              startHour: 8,
              endHour: 17,
              timeZone: 'UTC',
            },
          },
        },
      },
    );

    const supplierOfferQb = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue({
        id: 8,
        supplierProfileId: 21,
        unitWholesalePrice: 11,
        moq: 4,
        leadTimeDays: 2,
        currency: 'USD',
      }),
    };
    const openOrderQb = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(null),
    };
    const autoDraftQb = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(null),
    };

    supplierOffersRepository.createQueryBuilder.mockReturnValue(
      supplierOfferQb,
    );
    purchaseOrdersRepository.createQueryBuilder
      .mockReturnValueOnce(openOrderQb)
      .mockReturnValueOnce(autoDraftQb);

    try {
      const result = await service.maybeCreateDraftPurchaseOrder(
        {
          branchId: 3,
          productId: 9,
          safetyStock: 5,
          availableToSell: 2,
        } as any,
        { trigger: 'POS_SYNC', actorUserId: 4 },
      );

      expect(purchaseOrdersService.updateStatus).not.toHaveBeenCalled();
      expect(result).toEqual(
        expect.objectContaining({
          status: PurchaseOrderStatus.DRAFT,
          statusMeta: expect.objectContaining({
            lastAutoSubmissionAttempt: expect.objectContaining({
              eligible: false,
              blockedReason: 'DAY_OF_WEEK_BLOCKED',
            }),
          }),
        }),
      );
    } finally {
      global.Date = realDate;
    }
  });

  it('keeps replenishment drafts open when the supplier does not match the preferred supplier policy', async () => {
    retailEntitlementsService.getActiveBranchModuleEntitlement.mockResolvedValue(
      {
        metadata: {
          replenishmentPolicy: {
            submissionMode: 'AUTO_SUBMIT',
            preferredSupplierProfileId: 55,
          },
        },
      },
    );

    const supplierOfferQb = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue({
        id: 8,
        supplierProfileId: 21,
        unitWholesalePrice: 11,
        moq: 4,
        leadTimeDays: 2,
        currency: 'USD',
      }),
    };
    const openOrderQb = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(null),
    };
    const autoDraftQb = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(null),
    };

    supplierOffersRepository.createQueryBuilder.mockReturnValue(
      supplierOfferQb,
    );
    purchaseOrdersRepository.createQueryBuilder
      .mockReturnValueOnce(openOrderQb)
      .mockReturnValueOnce(autoDraftQb);

    const result = await service.maybeCreateDraftPurchaseOrder(
      {
        branchId: 3,
        productId: 9,
        safetyStock: 5,
        availableToSell: 2,
      } as any,
      { trigger: 'POS_SYNC', actorUserId: 4 },
    );

    expect(purchaseOrdersService.updateStatus).not.toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({
        status: PurchaseOrderStatus.DRAFT,
        statusMeta: expect.objectContaining({
          autoReplenishmentPreferredSupplierProfileId: 55,
          lastAutoSubmissionAttempt: expect.objectContaining({
            eligible: false,
            blockedReason: 'PREFERRED_SUPPLIER_REQUIRED',
            preferredSupplierProfileId: 55,
          }),
        }),
      }),
    );
  });

  it('keeps replenishment drafts open when the minimum order total is not met', async () => {
    retailEntitlementsService.getActiveBranchModuleEntitlement.mockResolvedValue(
      {
        metadata: {
          replenishmentPolicy: {
            submissionMode: 'AUTO_SUBMIT',
            minimumOrderTotal: 250,
          },
        },
      },
    );

    const supplierOfferQb = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue({
        id: 8,
        supplierProfileId: 21,
        unitWholesalePrice: 11,
        moq: 4,
        leadTimeDays: 2,
        currency: 'USD',
      }),
    };
    const openOrderQb = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(null),
    };
    const autoDraftQb = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(null),
    };

    supplierOffersRepository.createQueryBuilder.mockReturnValue(
      supplierOfferQb,
    );
    purchaseOrdersRepository.createQueryBuilder
      .mockReturnValueOnce(openOrderQb)
      .mockReturnValueOnce(autoDraftQb);

    const result = await service.maybeCreateDraftPurchaseOrder(
      {
        branchId: 3,
        productId: 9,
        safetyStock: 5,
        availableToSell: 2,
      } as any,
      { trigger: 'POS_SYNC', actorUserId: 4 },
    );

    expect(purchaseOrdersService.updateStatus).not.toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({
        status: PurchaseOrderStatus.DRAFT,
        statusMeta: expect.objectContaining({
          autoReplenishmentMinimumOrderTotal: 250,
          lastAutoSubmissionAttempt: expect.objectContaining({
            eligible: false,
            blockedReason: 'MINIMUM_ORDER_TOTAL_NOT_MET',
            minimumOrderTotal: 250,
          }),
        }),
      }),
    );
  });

  it('re-evaluates an auto-replenishment draft and submits it when the updated policy now allows it', async () => {
    retailEntitlementsService.getActiveBranchModuleEntitlement.mockResolvedValue(
      {
        metadata: {
          replenishmentPolicy: {
            submissionMode: 'AUTO_SUBMIT',
            minimumOrderTotal: 100,
          },
        },
      },
    );
    purchaseOrdersService.updateStatus.mockImplementation(
      async (_id: number, dto: any) => ({
        id: 25,
        status: dto.status,
        statusMeta: {
          lastTransition: {
            toStatus: dto.status,
          },
        },
      }),
    );

    const result = await service.reevaluateDraftPurchaseOrder(
      {
        id: 25,
        branchId: 3,
        supplierProfileId: 21,
        status: PurchaseOrderStatus.DRAFT,
        total: 125,
        statusMeta: {
          autoReplenishment: true,
          autoReplenishmentSubmissionMode: 'DRAFT_ONLY',
        },
      } as any,
      4,
    );

    expect(purchaseOrdersService.updateStatus).toHaveBeenCalledWith(
      25,
      expect.objectContaining({
        status: PurchaseOrderStatus.SUBMITTED,
      }),
      expect.objectContaining({
        id: 4,
        roles: ['POS_MANAGER'],
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        status: PurchaseOrderStatus.SUBMITTED,
      }),
    );
  });

  it('merges repeated auto replenishment into an existing draft line', async () => {
    const supplierOfferQb = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue({
        id: 8,
        supplierProfileId: 21,
        unitWholesalePrice: 11,
        moq: 4,
        leadTimeDays: 2,
        currency: 'USD',
      }),
    };
    const openOrderQb = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue({
        id: 13,
        status: PurchaseOrderStatus.DRAFT,
        subtotal: 44,
        total: 44,
        statusMeta: { autoReplenishment: true },
        items: [
          {
            id: 3,
            productId: 9,
            supplierOfferId: 8,
            orderedQuantity: 4,
            unitPrice: 11,
            note: 'Auto replenishment triggered by dispatched_transfer 70',
          },
        ],
      }),
    };

    supplierOffersRepository.createQueryBuilder.mockReturnValue(
      supplierOfferQb,
    );
    purchaseOrdersRepository.createQueryBuilder.mockReturnValue(openOrderQb);

    await service.maybeCreateDraftPurchaseOrder(
      {
        branchId: 3,
        productId: 9,
        safetyStock: 5,
        availableToSell: 1,
      } as any,
      { trigger: 'DISPATCHED_TRANSFER', sourceTransferId: 77, actorUserId: 4 },
    );

    expect(purchaseOrdersRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 13,
        subtotal: 88,
        total: 88,
        items: [
          expect.objectContaining({
            productId: 9,
            orderedQuantity: 8,
            supplierOfferId: 8,
          }),
        ],
        statusMeta: expect.objectContaining({
          autoReplenishment: true,
          autoReplenishmentPolicy: 'MERGE_SAME_BRANCH_SUPPLIER_PRODUCT',
          autoReplenishmentSubmissionMode: 'DRAFT_ONLY',
          lastAutoReplenishment: expect.objectContaining({
            mergedIntoExistingLine: true,
            sourceTransferId: 77,
          }),
        }),
      }),
    );
  });
});
