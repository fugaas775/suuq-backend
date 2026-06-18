import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { BranchInventory } from '../branches/entities/branch-inventory.entity';
import {
  StockMovement,
  StockMovementType,
} from '../branches/entities/stock-movement.entity';
import { InventoryLedgerService } from '../branches/inventory-ledger.service';
import { StockCount } from './entities/stock-count.entity';
import { RetailInventoryOpsService } from './retail-inventory-ops.service';

describe('RetailInventoryOpsService', () => {
  let service: RetailInventoryOpsService;
  let ledger: {
    getOnHand: jest.Mock;
    getOnHandWithManager: jest.Mock;
    recordMovement: jest.Mock;
  };
  let branchInventoryRepository: { findAndCount: jest.Mock };
  let stockMovementsRepository: { findAndCount: jest.Mock };
  let stockCountsRepository: { findAndCount: jest.Mock };
  let countRepo: { create: jest.Mock; save: jest.Mock };
  let txInventoryRepo: {
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };

  beforeEach(async () => {
    ledger = {
      getOnHand: jest.fn().mockResolvedValue(10),
      getOnHandWithManager: jest.fn(),
      recordMovement: jest.fn(),
    };
    branchInventoryRepository = { findAndCount: jest.fn() };
    stockMovementsRepository = { findAndCount: jest.fn() };
    stockCountsRepository = { findAndCount: jest.fn() };
    countRepo = {
      create: jest.fn((v: any) => v),
      save: jest.fn(async (v: any) => ({
        id: 7,
        createdAt: new Date('2026-06-18T00:00:00Z'),
        ...v,
      })),
    };
    txInventoryRepo = {
      findOne: jest.fn(),
      create: jest.fn((v: any) => v),
      save: jest.fn(async (v: any) => v),
    };

    const dataSource = {
      transaction: jest.fn(async (callback: any) =>
        callback({
          getRepository: jest.fn((entity: unknown) => {
            if (entity === StockCount) return countRepo;
            if (entity === BranchInventory) return txInventoryRepo;
            return {};
          }),
        }),
      ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RetailInventoryOpsService,
        { provide: DataSource, useValue: dataSource },
        { provide: InventoryLedgerService, useValue: ledger },
        {
          provide: getRepositoryToken(BranchInventory),
          useValue: branchInventoryRepository,
        },
        {
          provide: getRepositoryToken(StockMovement),
          useValue: stockMovementsRepository,
        },
        {
          provide: getRepositoryToken(StockCount),
          useValue: stockCountsRepository,
        },
      ],
    }).compile();

    service = module.get(RetailInventoryOpsService);
  });

  it('records a stock adjustment and maps prev/new quantities', async () => {
    ledger.recordMovement.mockResolvedValue({
      inventory: { quantityOnHand: 7 },
      movement: { id: 55, createdAt: new Date('2026-06-18T00:00:00Z') },
    });

    const result = await service.adjustStock(
      4,
      {
        branchId: 4,
        productId: 103,
        quantityDelta: -3,
        reason: 'WASTE',
        note: 'spoiled',
      },
      14,
    );

    expect(ledger.recordMovement).toHaveBeenCalledWith(
      expect.objectContaining({
        branchId: 4,
        productId: 103,
        movementType: StockMovementType.ADJUSTMENT,
        quantityDelta: -3,
        sourceType: 'MANUAL_ADJUSTMENT',
        actorUserId: 14,
        note: 'WASTE | spoiled',
      }),
    );
    expect(result).toMatchObject({
      adjustmentId: 55,
      previousQuantity: 10,
      newQuantity: 7,
      reason: 'WASTE',
      note: 'spoiled',
      adjustedByUserId: 14,
    });
  });

  it('decodes reason/note when listing adjustments', async () => {
    stockMovementsRepository.findAndCount.mockResolvedValue([
      [
        {
          id: 1,
          productId: 103,
          quantityDelta: -3,
          note: 'WASTE | spoiled',
          actorUserId: 14,
          createdAt: new Date(),
        },
        {
          id: 2,
          productId: 104,
          quantityDelta: 2,
          note: 'CORRECTION',
          actorUserId: null,
          createdAt: new Date(),
        },
      ],
      2,
    ]);

    const result = await service.getStockAdjustments({ branchId: 4 });

    expect(result.total).toBe(2);
    expect(result.items[0]).toMatchObject({ reason: 'WASTE', note: 'spoiled' });
    expect(result.items[1]).toMatchObject({ reason: 'CORRECTION', note: null });
  });

  it('applies a count: only varianced lines record a movement and variance is summed by magnitude', async () => {
    // expected on-hand per product: 103 → 10 (count 12 → +2), 104 → 5 (count 5 → 0, skipped)
    ledger.getOnHandWithManager.mockImplementation(
      async (_b: number, productId: number) => (productId === 103 ? 10 : 5),
    );
    ledger.recordMovement.mockResolvedValue({
      inventory: {},
      movement: { id: 1 },
    });

    const result = await service.countStock(
      4,
      {
        branchId: 4,
        countType: 'CYCLE',
        lines: [
          { productId: 103, countedQuantity: 12 },
          { productId: 104, countedQuantity: 5 },
        ],
      },
      14,
    );

    expect(result.countId).toBe(7);
    expect(result.lineCount).toBe(2);
    expect(result.totalVariance).toBe(2);
    expect(ledger.recordMovement).toHaveBeenCalledTimes(1); // only product 103 varied
    expect(ledger.recordMovement).toHaveBeenCalledWith(
      expect.objectContaining({
        productId: 103,
        quantityDelta: 2,
        sourceType: 'STOCK_COUNT',
        sourceReferenceId: 7,
      }),
      expect.anything(),
    );
    expect(result.lines).toEqual([
      {
        productId: 103,
        expectedQuantity: 10,
        countedQuantity: 12,
        variance: 2,
        newQuantityOnHand: 12,
      },
      {
        productId: 104,
        expectedQuantity: 5,
        countedQuantity: 5,
        variance: 0,
        newQuantityOnHand: 5,
      },
    ]);
  });

  it('upserts par levels, creating an inventory row when missing', async () => {
    txInventoryRepo.findOne.mockResolvedValue(null);

    const result = await service.updateParLevels(4, {
      branchId: 4,
      levels: [{ productId: 103, parLevel: 24, reorderPoint: 6 }],
    });

    expect(txInventoryRepo.create).toHaveBeenCalled();
    expect(result.updated).toBe(1);
    expect(result.items[0]).toMatchObject({
      productId: 103,
      parLevel: 24,
      reorderPoint: 6,
    });
  });
});
