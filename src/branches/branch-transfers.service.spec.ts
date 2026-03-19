import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Product } from '../products/entities/product.entity';
import { BranchTransfersService } from './branch-transfers.service';
import { BranchInventory } from './entities/branch-inventory.entity';
import {
  BranchTransfer,
  BranchTransferStatus,
} from './entities/branch-transfer.entity';
import { Branch } from './entities/branch.entity';
import { InventoryLedgerService } from './inventory-ledger.service';
import { ReplenishmentService } from './replenishment.service';
import { StockMovementType } from './entities/stock-movement.entity';

describe('BranchTransfersService', () => {
  let service: BranchTransfersService;
  let branchTransfersRepository: {
    create: jest.Mock;
    save: jest.Mock;
    findOne: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  let branchesRepository: { findOne: jest.Mock };
  let productsRepository: { findBy: jest.Mock };
  let branchInventoryRepository: { findOne: jest.Mock };
  let replenishmentService: { maybeCreateDraftPurchaseOrder: jest.Mock };
  let inventoryLedgerService: {
    adjustOutboundTransfers: jest.Mock;
    recordMovement: jest.Mock;
  };

  beforeEach(async () => {
    branchTransfersRepository = {
      create: jest.fn((value: any) => value),
      save: jest.fn(async (value: any) => value),
      findOne: jest.fn(),
      createQueryBuilder: jest.fn(),
    };
    branchesRepository = {
      findOne: jest.fn().mockResolvedValue({ id: 1 }),
    };
    productsRepository = {
      findBy: jest.fn().mockResolvedValue([{ id: 9 }]),
    };
    branchInventoryRepository = {
      findOne: jest.fn(),
    };
    replenishmentService = {
      maybeCreateDraftPurchaseOrder: jest.fn().mockResolvedValue(null),
    };
    inventoryLedgerService = {
      adjustOutboundTransfers: jest.fn().mockResolvedValue(undefined),
      recordMovement: jest.fn().mockResolvedValue(undefined),
    };

    const dataSource = {
      transaction: jest.fn(async (callback: any) =>
        callback({
          getRepository: jest.fn((entity: unknown) => {
            if (entity === BranchTransfer) {
              return branchTransfersRepository;
            }

            if (entity === BranchInventory) {
              return branchInventoryRepository;
            }

            return {};
          }),
        }),
      ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BranchTransfersService,
        { provide: DataSource, useValue: dataSource },
        {
          provide: InventoryLedgerService,
          useValue: inventoryLedgerService,
        },
        { provide: ReplenishmentService, useValue: replenishmentService },
        {
          provide: getRepositoryToken(BranchTransfer),
          useValue: branchTransfersRepository,
        },
        { provide: getRepositoryToken(Branch), useValue: branchesRepository },
        { provide: getRepositoryToken(Product), useValue: productsRepository },
        {
          provide: getRepositoryToken(BranchInventory),
          useValue: branchInventoryRepository,
        },
      ],
    }).compile();

    service = module.get(BranchTransfersService);
  });

  it('creates a requested transfer document', async () => {
    branchesRepository.findOne
      .mockResolvedValueOnce({ id: 1 })
      .mockResolvedValueOnce({ id: 2 });
    productsRepository.findBy.mockResolvedValue([{ id: 9 }]);

    const result = await service.create(
      {
        fromBranchId: 1,
        toBranchId: 2,
        items: [{ productId: 9, quantity: 3 }],
      },
      { id: 7 },
    );

    expect(result.status).toBe(BranchTransferStatus.REQUESTED);
    expect(result.requestedByUserId).toBe(7);
    expect(result.transferNumber).toMatch(/^BT-/);
    expect(branchTransfersRepository.save).toHaveBeenCalled();
  });

  it('dispatches a requested transfer and increments outbound projection', async () => {
    branchTransfersRepository.findOne.mockResolvedValue({
      id: 10,
      fromBranchId: 1,
      toBranchId: 2,
      status: BranchTransferStatus.REQUESTED,
      items: [{ productId: 9, quantity: 3 }],
      statusMeta: {},
    });
    branchInventoryRepository.findOne.mockResolvedValue({
      branchId: 1,
      productId: 9,
      quantityOnHand: 10,
      reservedQuantity: 1,
      reservedOnline: 1,
      reservedStoreOps: 0,
      outboundTransfers: 0,
      safetyStock: 1,
    });

    const result = await service.dispatch(10, { id: 8 }, 'sent to kiosk');

    expect(inventoryLedgerService.adjustOutboundTransfers).toHaveBeenCalledWith(
      {
        branchId: 1,
        productId: 9,
        quantityDelta: 3,
      },
      expect.any(Object),
    );
    expect(
      replenishmentService.maybeCreateDraftPurchaseOrder,
    ).toHaveBeenCalled();
    expect(result.status).toBe(BranchTransferStatus.DISPATCHED);
    expect(result.dispatchedByUserId).toBe(8);
  });

  it('rejects dispatch when available stock is insufficient', async () => {
    branchTransfersRepository.findOne.mockResolvedValue({
      id: 10,
      fromBranchId: 1,
      toBranchId: 2,
      status: BranchTransferStatus.REQUESTED,
      items: [{ productId: 9, quantity: 7 }],
      statusMeta: {},
    });
    branchInventoryRepository.findOne.mockResolvedValue({
      branchId: 1,
      productId: 9,
      quantityOnHand: 8,
      reservedQuantity: 1,
      reservedOnline: 1,
      reservedStoreOps: 0,
      outboundTransfers: 0,
      safetyStock: 1,
    });

    await expect(service.dispatch(10, { id: 8 })).rejects.toThrow(
      BadRequestException,
    );
    expect(
      inventoryLedgerService.adjustOutboundTransfers,
    ).not.toHaveBeenCalled();
  });

  it('receives a dispatched transfer and posts both stock movements', async () => {
    branchTransfersRepository.findOne.mockResolvedValue({
      id: 11,
      fromBranchId: 1,
      toBranchId: 2,
      status: BranchTransferStatus.DISPATCHED,
      items: [{ productId: 9, quantity: 4 }],
      statusMeta: {},
    });

    const result = await service.receive(11, { id: 5 }, 'received by store');

    expect(inventoryLedgerService.adjustOutboundTransfers).toHaveBeenCalledWith(
      {
        branchId: 1,
        productId: 9,
        quantityDelta: -4,
      },
      expect.any(Object),
    );
    expect(inventoryLedgerService.recordMovement).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        branchId: 1,
        productId: 9,
        movementType: StockMovementType.TRANSFER,
        quantityDelta: -4,
        sourceType: 'BRANCH_TRANSFER',
        sourceReferenceId: 11,
      }),
      expect.any(Object),
    );
    expect(inventoryLedgerService.recordMovement).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        branchId: 2,
        productId: 9,
        movementType: StockMovementType.TRANSFER,
        quantityDelta: 4,
        sourceType: 'BRANCH_TRANSFER',
        sourceReferenceId: 11,
      }),
      expect.any(Object),
    );
    expect(result.status).toBe(BranchTransferStatus.RECEIVED);
  });

  it('cancels a dispatched transfer and releases outbound projection', async () => {
    branchTransfersRepository.findOne.mockResolvedValue({
      id: 12,
      fromBranchId: 1,
      toBranchId: 2,
      status: BranchTransferStatus.DISPATCHED,
      items: [{ productId: 9, quantity: 2 }],
      statusMeta: {},
    });

    const result = await service.cancel(12, { id: 3 }, 'route aborted');

    expect(inventoryLedgerService.adjustOutboundTransfers).toHaveBeenCalledWith(
      {
        branchId: 1,
        productId: 9,
        quantityDelta: -2,
      },
      expect.any(Object),
    );
    expect(result.status).toBe(BranchTransferStatus.CANCELLED);
    expect(result.cancelledByUserId).toBe(3);
  });
});
