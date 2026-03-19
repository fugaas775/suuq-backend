import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BranchTransfersService } from '../branches/branch-transfers.service';
import { InventoryLedgerService } from '../branches/inventory-ledger.service';
import { Branch } from '../branches/entities/branch.entity';
import { StockMovementType } from '../branches/entities/stock-movement.entity';
import { PartnerCredential } from '../partner-credentials/entities/partner-credential.entity';
import { ProductAliasesService } from '../product-aliases/product-aliases.service';
import { ProductAliasType } from '../product-aliases/entities/product-alias.entity';
import { PosSyncService } from './pos-sync.service';
import {
  PosSyncJob,
  PosSyncStatus,
  PosSyncType,
} from './entities/pos-sync-job.entity';

describe('PosSyncService', () => {
  let service: PosSyncService;
  let posSyncJobsRepository: {
    create: jest.Mock;
    save: jest.Mock;
    find: jest.Mock;
    findOne: jest.Mock;
  };
  let branchesRepository: { findOne: jest.Mock };
  let partnerCredentialsRepository: { findOne: jest.Mock };
  let branchTransfersService: {
    create: jest.Mock;
    dispatch: jest.Mock;
    findBySource: jest.Mock;
    findOne: jest.Mock;
    receive: jest.Mock;
  };
  let inventoryLedgerService: {
    recordMovement: jest.Mock;
    transferStock: jest.Mock;
    getOnHand: jest.Mock;
    adjustInboundOpenPo: jest.Mock;
    adjustReservedOnline: jest.Mock;
    adjustOutboundTransfers: jest.Mock;
  };
  let productAliasesService: { resolveProductIdForBranch: jest.Mock };

  beforeEach(async () => {
    posSyncJobsRepository = {
      create: jest.fn((value) => ({ id: value.id ?? 41, ...value })),
      save: jest.fn(async (value) => value),
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn(),
    };

    branchesRepository = {
      findOne: jest.fn().mockResolvedValue({ id: 3 }),
    };

    partnerCredentialsRepository = {
      findOne: jest.fn().mockResolvedValue(null),
    };

    branchTransfersService = {
      create: jest.fn(),
      dispatch: jest.fn(),
      findBySource: jest.fn(),
      findOne: jest.fn(),
      receive: jest.fn(),
    };

    inventoryLedgerService = {
      recordMovement: jest.fn(),
      transferStock: jest.fn(),
      getOnHand: jest.fn().mockResolvedValue(12),
      adjustInboundOpenPo: jest.fn(),
      adjustReservedOnline: jest.fn(),
      adjustOutboundTransfers: jest.fn(),
    };
    productAliasesService = {
      resolveProductIdForBranch: jest.fn().mockResolvedValue(9),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PosSyncService,
        {
          provide: getRepositoryToken(PosSyncJob),
          useValue: posSyncJobsRepository,
        },
        { provide: getRepositoryToken(Branch), useValue: branchesRepository },
        {
          provide: getRepositoryToken(PartnerCredential),
          useValue: partnerCredentialsRepository,
        },
        { provide: BranchTransfersService, useValue: branchTransfersService },
        { provide: InventoryLedgerService, useValue: inventoryLedgerService },
        { provide: ProductAliasesService, useValue: productAliasesService },
      ],
    }).compile();

    service = module.get(PosSyncService);
  });

  it('replays failed entries into a new sync job', async () => {
    posSyncJobsRepository.findOne
      .mockResolvedValueOnce({
        id: 41,
        branchId: 3,
        syncType: PosSyncType.SALES_SUMMARY,
        status: PosSyncStatus.FAILED,
        partnerCredentialId: 12,
        failedEntries: [
          {
            entryIndex: 0,
            productId: null,
            aliasType: ProductAliasType.LOCAL_SKU,
            aliasValue: 'sku-001',
            quantity: 4,
            movementType: null,
            counterpartyBranchId: null,
            transferId: null,
            note: 'retry me',
            error: 'No product alias matched LOCAL_SKU:sku-001',
          },
        ],
      })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 12, branchId: 3 })
      .mockResolvedValueOnce({
        id: 41,
        branchId: 3,
        syncType: PosSyncType.SALES_SUMMARY,
        partnerCredentialId: 12,
        status: PosSyncStatus.RECEIVED,
        acceptedCount: 0,
        rejectedCount: 0,
      })
      .mockResolvedValueOnce({
        id: 41,
        branchId: 3,
        syncType: PosSyncType.SALES_SUMMARY,
        partnerCredentialId: 12,
        status: PosSyncStatus.PROCESSED,
        acceptedCount: 1,
        rejectedCount: 0,
      });
    partnerCredentialsRepository.findOne.mockResolvedValueOnce({
      id: 12,
      branchId: 3,
    });
    productAliasesService.resolveProductIdForBranch.mockResolvedValueOnce(55);

    await service.replayFailedEntries(
      41,
      { branchId: 3 },
      { id: 17, roles: ['POS_MANAGER'] },
      12,
    );

    expect(
      productAliasesService.resolveProductIdForBranch,
    ).toHaveBeenCalledWith(3, 12, ProductAliasType.LOCAL_SKU, 'sku-001');
    expect(inventoryLedgerService.recordMovement).toHaveBeenCalledWith(
      expect.objectContaining({
        branchId: 3,
        productId: 55,
        movementType: StockMovementType.SALE,
        quantityDelta: -4,
        note: 'retry me',
      }),
    );
  });

  it('rejects replay when no failed entries match the requested selection', async () => {
    posSyncJobsRepository.findOne.mockResolvedValue({
      id: 41,
      branchId: 3,
      syncType: PosSyncType.STOCK_DELTA,
      status: PosSyncStatus.FAILED,
      failedEntries: [
        {
          entryIndex: 0,
          productId: 9,
          aliasType: null,
          aliasValue: null,
          quantity: 2,
          movementType: StockMovementType.TRANSFER,
          counterpartyBranchId: null,
          transferId: null,
          note: null,
          error: 'counterpartyBranchId is required for transfer sync entries',
        },
      ],
    });

    await expect(
      service.replayFailedEntries(41, { branchId: 3, entryIndexes: [9] }),
    ).rejects.toThrow(
      'No failed entries matched the requested replay selection for POS sync job 41',
    );
  });

  it('ingests sales summaries into sale stock movements', async () => {
    const baseJob = {
      id: 41,
      branchId: 3,
      syncType: PosSyncType.SALES_SUMMARY,
      status: PosSyncStatus.RECEIVED,
      acceptedCount: 0,
      rejectedCount: 0,
    } as PosSyncJob;

    posSyncJobsRepository.findOne
      .mockResolvedValueOnce(baseJob)
      .mockResolvedValueOnce({
        ...baseJob,
        status: PosSyncStatus.PROCESSED,
        acceptedCount: 1,
        rejectedCount: 0,
      });

    const result = await service.ingest(
      {
        branchId: 3,
        syncType: PosSyncType.SALES_SUMMARY,
        entries: [{ productId: 9, quantity: 4, note: 'Till close' }],
      },
      { id: 17, roles: ['POS_MANAGER'] },
    );

    expect(inventoryLedgerService.recordMovement).toHaveBeenCalledWith(
      expect.objectContaining({
        branchId: 3,
        productId: 9,
        movementType: StockMovementType.SALE,
        quantityDelta: -4,
      }),
    );
    expect(result.status).toBe(PosSyncStatus.PROCESSED);
  });

  it('ingests stock snapshots as adjustment deltas', async () => {
    const baseJob = {
      id: 41,
      branchId: 3,
      syncType: PosSyncType.STOCK_SNAPSHOT,
      status: PosSyncStatus.RECEIVED,
      acceptedCount: 0,
      rejectedCount: 0,
    } as PosSyncJob;

    posSyncJobsRepository.findOne
      .mockResolvedValueOnce(baseJob)
      .mockResolvedValueOnce({
        ...baseJob,
        status: PosSyncStatus.PROCESSED,
        acceptedCount: 1,
        rejectedCount: 0,
      });

    await service.ingest(
      {
        branchId: 3,
        syncType: PosSyncType.STOCK_SNAPSHOT,
        entries: [{ productId: 9, quantity: 15 }],
      },
      { id: 17, roles: ['POS_MANAGER'] },
    );

    expect(inventoryLedgerService.getOnHand).toHaveBeenCalledWith(3, 9);
    expect(inventoryLedgerService.recordMovement).toHaveBeenCalledWith(
      expect.objectContaining({
        movementType: StockMovementType.ADJUSTMENT,
        quantityDelta: 3,
      }),
    );
  });

  it('resolves product aliases during ingest when productId is not supplied', async () => {
    const baseJob = {
      id: 41,
      branchId: 3,
      syncType: PosSyncType.SALES_SUMMARY,
      status: PosSyncStatus.RECEIVED,
      acceptedCount: 0,
      rejectedCount: 0,
    } as PosSyncJob;

    posSyncJobsRepository.findOne
      .mockResolvedValueOnce(baseJob)
      .mockResolvedValueOnce({
        ...baseJob,
        status: PosSyncStatus.PROCESSED,
        acceptedCount: 1,
        rejectedCount: 0,
      });
    partnerCredentialsRepository.findOne.mockResolvedValueOnce({
      id: 12,
      branchId: 3,
    });
    productAliasesService.resolveProductIdForBranch.mockResolvedValueOnce(55);

    await service.ingest(
      {
        branchId: 3,
        partnerCredentialId: 12,
        syncType: PosSyncType.SALES_SUMMARY,
        entries: [
          {
            aliasType: ProductAliasType.BARCODE,
            aliasValue: '01234567890',
            quantity: 4,
          },
        ],
      },
      { id: 17, roles: ['POS_MANAGER'] },
    );

    expect(
      productAliasesService.resolveProductIdForBranch,
    ).toHaveBeenCalledWith(3, 12, ProductAliasType.BARCODE, '01234567890');
    expect(inventoryLedgerService.recordMovement).toHaveBeenCalledWith(
      expect.objectContaining({
        productId: 55,
        movementType: StockMovementType.SALE,
      }),
    );
  });

  it('creates and dispatches persisted transfers for outbound transfer deltas', async () => {
    const baseJob = {
      id: 41,
      branchId: 3,
      syncType: PosSyncType.STOCK_DELTA,
      status: PosSyncStatus.RECEIVED,
      acceptedCount: 0,
      rejectedCount: 0,
    } as PosSyncJob;

    posSyncJobsRepository.findOne
      .mockResolvedValueOnce(baseJob)
      .mockResolvedValueOnce({
        ...baseJob,
        status: PosSyncStatus.PROCESSED,
        acceptedCount: 1,
        rejectedCount: 0,
      });
    branchTransfersService.create.mockResolvedValue({ id: 501 });

    await service.ingest(
      {
        branchId: 3,
        syncType: PosSyncType.STOCK_DELTA,
        entries: [
          {
            productId: 9,
            quantity: -2,
            movementType: StockMovementType.TRANSFER,
            counterpartyBranchId: 4,
            note: 'Move to kiosk branch',
          },
        ],
      },
      { id: 17, roles: ['POS_MANAGER'] },
    );

    expect(branchTransfersService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        fromBranchId: 3,
        toBranchId: 4,
        items: [expect.objectContaining({ productId: 9, quantity: 2 })],
      }),
      expect.objectContaining({ id: 17 }),
      expect.objectContaining({
        sourceType: 'POS_SYNC',
        sourceReferenceId: 41,
        sourceEntryIndex: 0,
      }),
    );
    expect(branchTransfersService.dispatch).toHaveBeenCalledWith(
      501,
      expect.objectContaining({ id: 17 }),
      'Move to kiosk branch',
    );
  });

  it('receives inbound transfer deltas against a persisted transfer document', async () => {
    const baseJob = {
      id: 41,
      branchId: 3,
      syncType: PosSyncType.STOCK_DELTA,
      status: PosSyncStatus.RECEIVED,
      acceptedCount: 0,
      rejectedCount: 0,
    } as PosSyncJob;

    posSyncJobsRepository.findOne
      .mockResolvedValueOnce(baseJob)
      .mockResolvedValueOnce({
        ...baseJob,
        status: PosSyncStatus.PROCESSED,
        acceptedCount: 1,
        rejectedCount: 0,
      });
    branchTransfersService.findOne.mockResolvedValue({
      id: 602,
      fromBranchId: 4,
      toBranchId: 3,
      items: [{ productId: 9, quantity: 2 }],
    });

    await service.ingest(
      {
        branchId: 3,
        syncType: PosSyncType.STOCK_DELTA,
        entries: [
          {
            productId: 9,
            quantity: 2,
            movementType: StockMovementType.TRANSFER,
            counterpartyBranchId: 4,
            transferId: 602,
            note: 'Receive from kiosk branch',
          },
        ],
      },
      { id: 17, roles: ['POS_MANAGER'] },
    );

    expect(branchTransfersService.receive).toHaveBeenCalledWith(
      602,
      expect.objectContaining({ id: 17 }),
      'Receive from kiosk branch',
    );
  });

  it('returns the existing sync job when the same idempotency key is retried', async () => {
    posSyncJobsRepository.findOne.mockResolvedValueOnce({
      id: 77,
      branchId: 3,
      syncType: PosSyncType.SALES_SUMMARY,
      status: PosSyncStatus.PROCESSED,
      acceptedCount: 1,
      rejectedCount: 0,
    });

    posSyncJobsRepository.findOne.mockResolvedValueOnce({
      id: 77,
      branchId: 3,
      syncType: PosSyncType.SALES_SUMMARY,
      status: PosSyncStatus.PROCESSED,
      acceptedCount: 1,
      rejectedCount: 0,
    });

    const result = await service.ingest(
      {
        branchId: 3,
        syncType: PosSyncType.SALES_SUMMARY,
        idempotencyKey: 'sync-123',
        entries: [{ productId: 9, quantity: 4 }],
      },
      { id: 17, roles: ['POS_MANAGER'] },
    );

    expect(posSyncJobsRepository.save).not.toHaveBeenCalled();
    expect(inventoryLedgerService.recordMovement).not.toHaveBeenCalled();
    expect(result.id).toBe(77);
  });

  it('returns created transfer confirmations for a sync job', async () => {
    posSyncJobsRepository.findOne.mockResolvedValue({
      id: 41,
      branchId: 3,
      syncType: PosSyncType.STOCK_DELTA,
      status: PosSyncStatus.PROCESSED,
      acceptedCount: 1,
      rejectedCount: 0,
    });
    branchTransfersService.findBySource.mockResolvedValue([
      {
        id: 501,
        transferNumber: 'BT-501',
        status: 'DISPATCHED',
        fromBranchId: 3,
        toBranchId: 4,
        sourceEntryIndex: 0,
        items: [{ productId: 9 }],
        createdAt: new Date('2026-03-17T09:00:00.000Z'),
      },
    ]);

    const result = await service.listTransferConfirmations(41, 3);

    expect(branchTransfersService.findBySource).toHaveBeenCalledWith(
      'POS_SYNC',
      41,
      3,
    );
    expect(result).toEqual([
      expect.objectContaining({
        entryIndex: 0,
        transferId: 501,
        transferNumber: 'BT-501',
        fromBranchId: 3,
        toBranchId: 4,
        productIds: [9],
      }),
    ]);
  });

  it('rejects partner transfer confirmation lookups for another credential', async () => {
    posSyncJobsRepository.findOne.mockResolvedValue({
      id: 41,
      branchId: 3,
      partnerCredentialId: 9,
      syncType: PosSyncType.STOCK_DELTA,
      status: PosSyncStatus.PROCESSED,
      acceptedCount: 1,
      rejectedCount: 0,
    });

    await expect(service.listTransferConfirmations(41, 3, 12)).rejects.toThrow(
      'POS sync job 41 does not belong to partner credential 12',
    );
  });

  it('persists failed entry details when an ingest entry is rejected', async () => {
    const baseJob = {
      id: 41,
      branchId: 3,
      syncType: PosSyncType.STOCK_DELTA,
      status: PosSyncStatus.RECEIVED,
      acceptedCount: 0,
      rejectedCount: 0,
      failedEntries: [],
    } as PosSyncJob;

    posSyncJobsRepository.findOne
      .mockResolvedValueOnce(baseJob)
      .mockResolvedValueOnce({
        ...baseJob,
        status: PosSyncStatus.FAILED,
        acceptedCount: 0,
        rejectedCount: 1,
        failedEntries: [
          {
            entryIndex: 0,
            productId: 9,
            aliasType: null,
            aliasValue: null,
            quantity: 2,
            movementType: StockMovementType.TRANSFER,
            counterpartyBranchId: null,
            transferId: null,
            note: null,
            error: 'counterpartyBranchId is required for transfer sync entries',
          },
        ],
      });

    await service.ingest(
      {
        branchId: 3,
        syncType: PosSyncType.STOCK_DELTA,
        entries: [
          {
            productId: 9,
            quantity: 2,
            movementType: StockMovementType.TRANSFER,
          },
        ],
      },
      { id: 17, roles: ['POS_MANAGER'] },
    );

    expect(posSyncJobsRepository.save).toHaveBeenLastCalledWith(
      expect.objectContaining({
        id: 41,
        status: PosSyncStatus.FAILED,
        acceptedCount: 0,
        rejectedCount: 1,
        failedEntries: [
          expect.objectContaining({
            entryIndex: 0,
            productId: 9,
            aliasType: null,
            aliasValue: null,
            transferId: null,
            error: 'counterpartyBranchId is required for transfer sync entries',
          }),
        ],
      }),
    );
  });

  it('records alias metadata when alias-based ingest cannot resolve a product', async () => {
    const baseJob = {
      id: 41,
      branchId: 3,
      syncType: PosSyncType.SALES_SUMMARY,
      status: PosSyncStatus.RECEIVED,
      acceptedCount: 0,
      rejectedCount: 0,
      failedEntries: [],
    } as PosSyncJob;

    posSyncJobsRepository.findOne
      .mockResolvedValueOnce(baseJob)
      .mockResolvedValueOnce({
        ...baseJob,
        status: PosSyncStatus.FAILED,
        acceptedCount: 0,
        rejectedCount: 1,
        failedEntries: [
          {
            entryIndex: 0,
            productId: null,
            aliasType: ProductAliasType.LOCAL_SKU,
            aliasValue: 'sku-001',
            quantity: 4,
            movementType: null,
            counterpartyBranchId: null,
            transferId: null,
            note: null,
            error: 'No product alias matched LOCAL_SKU:sku-001',
          },
        ],
      });
    productAliasesService.resolveProductIdForBranch.mockResolvedValueOnce(null);

    await service.ingest(
      {
        branchId: 3,
        syncType: PosSyncType.SALES_SUMMARY,
        entries: [
          {
            aliasType: ProductAliasType.LOCAL_SKU,
            aliasValue: 'sku-001',
            quantity: 4,
          },
        ],
      },
      { id: 17, roles: ['POS_MANAGER'] },
    );

    expect(posSyncJobsRepository.save).toHaveBeenLastCalledWith(
      expect.objectContaining({
        failedEntries: [
          expect.objectContaining({
            productId: null,
            aliasType: ProductAliasType.LOCAL_SKU,
            aliasValue: 'sku-001',
            error: 'No product alias matched LOCAL_SKU:sku-001',
          }),
        ],
      }),
    );
  });

  it('validates branch context when updating a sync job status', async () => {
    posSyncJobsRepository.findOne.mockResolvedValue({
      id: 41,
      branchId: 3,
      syncType: PosSyncType.SALES_SUMMARY,
      status: PosSyncStatus.RECEIVED,
      acceptedCount: 0,
      rejectedCount: 0,
    });

    await expect(
      service.updateStatus(41, {
        branchId: 7,
        status: PosSyncStatus.PROCESSED,
      }),
    ).rejects.toThrow('POS sync job 41 does not belong to branch 7');
  });
});
