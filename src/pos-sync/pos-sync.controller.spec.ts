import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { RetailModulesGuard } from '../retail/retail-modules.guard';
import { RetailEntitlementsService } from '../retail/retail-entitlements.service';
import { PosSyncController } from './pos-sync.controller';
import { PosSyncService } from './pos-sync.service';

describe('PosSyncController', () => {
  let controller: PosSyncController;
  let posSyncService: {
    findAll: jest.Mock;
    create: jest.Mock;
    ingest: jest.Mock;
    updateStatus: jest.Mock;
    listTransferConfirmations: jest.Mock;
    replayFailedEntries: jest.Mock;
  };

  beforeEach(async () => {
    posSyncService = {
      findAll: jest.fn(),
      create: jest.fn(),
      ingest: jest.fn(),
      updateStatus: jest.fn(),
      listTransferConfirmations: jest.fn().mockResolvedValue([]),
      replayFailedEntries: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PosSyncController],
      providers: [
        { provide: PosSyncService, useValue: posSyncService },
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

    controller = module.get(PosSyncController);
  });

  it('returns transfer confirmations for a sync job', async () => {
    await controller.transferConfirmations(41, { branchId: 3 });

    expect(posSyncService.listTransferConfirmations).toHaveBeenCalledWith(
      41,
      3,
    );
  });

  it('replays failed entries for a sync job', async () => {
    await controller.replayFailures(
      41,
      { branchId: 3, entryIndexes: [0, 2] },
      { user: { id: 17, email: 'ops@suuq.test', roles: ['POS_MANAGER'] } },
    );

    expect(posSyncService.replayFailedEntries).toHaveBeenCalledWith(
      41,
      { branchId: 3, entryIndexes: [0, 2] },
      expect.objectContaining({
        id: 17,
        email: 'ops@suuq.test',
        roles: ['POS_MANAGER'],
      }),
    );
  });
});
