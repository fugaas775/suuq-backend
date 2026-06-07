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
  let productsRepository: { findOne: jest.Mock; update: jest.Mock };
  let branchInventoryRepository: {
    find: jest.Mock;
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
      update: jest.fn().mockResolvedValue(undefined),
    };
    branchInventoryRepository = {
      find: jest.fn().mockResolvedValue([]),
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
    // recordMovement no longer auto-triggers replenishment — that evaluation now
    // lives in the branch-transfers flow, not in the inventory ledger.
    expect(
      replenishmentService.maybeCreateDraftPurchaseOrder,
    ).not.toHaveBeenCalled();
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

  it('records POS sync movements without auto-triggering replenishment', async () => {
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

    const result = await service.recordMovement({
      branchId: 1,
      productId: 9,
      movementType: StockMovementType.SALE,
      quantityDelta: -4,
      sourceType: 'POS_SYNC',
      actorUserId: 21,
    });

    // The POS sync movement is recorded and availableToSell recomputed, but the
    // inventory ledger does not auto-trigger replenishment — that evaluation now
    // lives in the branch-transfers flow.
    expect(result.inventory.availableToSell).toBe(3);
    expect(result.inventory.version).toBe(5);
    expect(
      replenishmentService.maybeCreateDraftPurchaseOrder,
    ).not.toHaveBeenCalled();
  });
});
