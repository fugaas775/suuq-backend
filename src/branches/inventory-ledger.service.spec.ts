import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Product } from '../products/entities/product.entity';
import { Branch } from './entities/branch.entity';
import { BranchInventory } from './entities/branch-inventory.entity';
import { ReplenishmentService } from './replenishment.service';
import {
  StockMovement,
  StockMovementType,
} from './entities/stock-movement.entity';
import { InventoryLedgerService } from './inventory-ledger.service';

describe('InventoryLedgerService', () => {
  let service: InventoryLedgerService;
  let branchesRepository: { findOne: jest.Mock };
  let productsRepository: { findOne: jest.Mock };
  let branchInventoryRepository: {
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let stockMovementsRepository: { create: jest.Mock; save: jest.Mock };
  let replenishmentService: { maybeCreateDraftPurchaseOrder: jest.Mock };

  beforeEach(async () => {
    branchesRepository = {
      findOne: jest.fn().mockResolvedValue({ id: 1 }),
    };
    productsRepository = {
      findOne: jest.fn().mockResolvedValue({ id: 9 }),
    };
    branchInventoryRepository = {
      findOne: jest.fn(),
      create: jest.fn((value: any) => value),
      save: jest.fn(async (value: any) => value),
    };
    stockMovementsRepository = {
      create: jest.fn((value: any) => value),
      save: jest.fn(async (value: any) => ({ id: 88, ...value })),
    };
    replenishmentService = {
      maybeCreateDraftPurchaseOrder: jest.fn().mockResolvedValue(null),
    };

    const dataSource = {
      transaction: jest.fn(async (callback: any) =>
        callback({
          getRepository: jest.fn((entity: unknown) => {
            if (entity === BranchInventory) return branchInventoryRepository;
            if (entity === StockMovement) return stockMovementsRepository;
            if (entity === Branch) return branchesRepository;
            if (entity === Product) return productsRepository;
            return {};
          }),
        }),
      ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InventoryLedgerService,
        { provide: DataSource, useValue: dataSource },
        { provide: ReplenishmentService, useValue: replenishmentService },
        { provide: getRepositoryToken(Branch), useValue: branchesRepository },
        { provide: getRepositoryToken(Product), useValue: productsRepository },
        {
          provide: getRepositoryToken(BranchInventory),
          useValue: branchInventoryRepository,
        },
        {
          provide: getRepositoryToken(StockMovement),
          useValue: stockMovementsRepository,
        },
      ],
    }).compile();

    service = module.get(InventoryLedgerService);
  });

  it('recomputes availableToSell after a stock movement', async () => {
    branchInventoryRepository.findOne.mockResolvedValue({
      id: 10,
      branchId: 1,
      productId: 9,
      quantityOnHand: 10,
      reservedQuantity: 1,
      reservedOnline: 2,
      reservedStoreOps: 1,
      inboundOpenPo: 0,
      outboundTransfers: 1,
      safetyStock: 2,
      availableToSell: 3,
      version: 4,
    });

    const result = await service.recordMovement({
      branchId: 1,
      productId: 9,
      movementType: StockMovementType.ADJUSTMENT,
      quantityDelta: 5,
      sourceType: 'TEST',
    });

    expect(result.inventory.quantityOnHand).toBe(15);
    expect(result.inventory.availableToSell).toBe(8);
    expect(result.inventory.version).toBe(5);
    expect(
      replenishmentService.maybeCreateDraftPurchaseOrder,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        branchId: 1,
        productId: 9,
        availableToSell: 8,
      }),
      expect.objectContaining({
        trigger: 'INVENTORY_ADJUSTMENT',
      }),
      expect.any(Object),
    );
  });

  it('prevents negative inventory balances', async () => {
    branchInventoryRepository.findOne.mockResolvedValue({
      id: 10,
      branchId: 1,
      productId: 9,
      quantityOnHand: 2,
      reservedQuantity: 0,
      reservedOnline: 0,
      reservedStoreOps: 0,
      inboundOpenPo: 0,
      outboundTransfers: 0,
      safetyStock: 0,
      availableToSell: 2,
      version: 0,
    });

    await expect(
      service.recordMovement({
        branchId: 1,
        productId: 9,
        movementType: StockMovementType.SALE,
        quantityDelta: -5,
        sourceType: 'TEST',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('adjusts inbound open purchase order projection buckets', async () => {
    branchInventoryRepository.findOne.mockResolvedValue({
      id: 10,
      branchId: 1,
      productId: 9,
      quantityOnHand: 10,
      reservedQuantity: 0,
      reservedOnline: 1,
      reservedStoreOps: 0,
      inboundOpenPo: 2,
      outboundTransfers: 0,
      safetyStock: 1,
      availableToSell: 8,
      version: 4,
    });

    const result = await service.adjustInboundOpenPo({
      branchId: 1,
      productId: 9,
      quantityDelta: 3,
    });

    expect(result.inboundOpenPo).toBe(5);
    expect(result.availableToSell).toBe(8);
    expect(result.version).toBe(5);
    expect(
      replenishmentService.maybeCreateDraftPurchaseOrder,
    ).not.toHaveBeenCalled();
  });

  it('triggers replenishment evaluation after POS sync movements', async () => {
    branchInventoryRepository.findOne.mockResolvedValue({
      id: 10,
      branchId: 1,
      productId: 9,
      quantityOnHand: 10,
      reservedQuantity: 0,
      reservedOnline: 0,
      reservedStoreOps: 0,
      inboundOpenPo: 0,
      outboundTransfers: 0,
      safetyStock: 3,
      availableToSell: 7,
      version: 4,
    });

    await service.recordMovement({
      branchId: 1,
      productId: 9,
      movementType: StockMovementType.SALE,
      quantityDelta: -4,
      sourceType: 'POS_SYNC',
      actorUserId: 21,
    });

    expect(
      replenishmentService.maybeCreateDraftPurchaseOrder,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        branchId: 1,
        productId: 9,
        availableToSell: 3,
      }),
      expect.objectContaining({
        trigger: 'POS_SYNC',
        actorUserId: 21,
      }),
      expect.any(Object),
    );
  });
});
