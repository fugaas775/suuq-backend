import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { PartnerCredentialsService } from '../partner-credentials/partner-credentials.service';
import { PartnerCredentialAuthGuard } from '../partner-credentials/partner-credential-auth.guard';
import { RetailModulesGuard } from '../retail/retail-modules.guard';
import { RetailEntitlementsService } from '../retail/retail-entitlements.service';
import { PosSyncController } from './pos-sync.controller';
import { PosSyncStatus, PosSyncType } from './entities/pos-sync-job.entity';
import { PosSyncRequestAuthGuard } from './pos-sync-request-auth.guard';
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
  let partnerCredentialsService: { assertCredentialBranchAccess: jest.Mock };

  beforeEach(async () => {
    posSyncService = {
      findAll: jest.fn(),
      create: jest.fn(),
      ingest: jest.fn(),
      updateStatus: jest.fn(),
      listTransferConfirmations: jest.fn().mockResolvedValue([]),
      replayFailedEntries: jest.fn(),
    };

    partnerCredentialsService = {
      assertCredentialBranchAccess: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PosSyncController],
      providers: [
        { provide: PosSyncService, useValue: posSyncService },
        {
          provide: PartnerCredentialsService,
          useValue: partnerCredentialsService,
        },
        { provide: Reflector, useValue: { getAllAndOverride: jest.fn() } },
        {
          provide: RetailEntitlementsService,
          useValue: { assertBranchHasModules: jest.fn() },
        },
        {
          provide: PosSyncRequestAuthGuard,
          useValue: { canActivate: jest.fn().mockReturnValue(true) },
        },
        {
          provide: PartnerCredentialAuthGuard,
          useValue: { canActivate: jest.fn().mockReturnValue(true) },
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
    await controller.transferConfirmations(
      41,
      { branchId: 3 },
      { user: { roles: ['POS_MANAGER'] } },
    );

    expect(posSyncService.listTransferConfirmations).toHaveBeenCalledWith(
      41,
      3,
    );
  });

  it('returns a scoped paginated list of sync jobs', async () => {
    posSyncService.findAll.mockResolvedValue({
      items: [
        {
          id: 41,
          branchId: 3,
          partnerCredentialId: null,
          syncType: PosSyncType.SALES_SUMMARY,
          status: PosSyncStatus.PROCESSED,
          externalJobId: null,
          idempotencyKey: null,
          acceptedCount: 2,
          rejectedCount: 0,
          processedAt: null,
          failedEntries: [],
          createdAt: new Date('2026-03-19T10:00:00.000Z'),
          updatedAt: new Date('2026-03-19T10:05:00.000Z'),
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
      failedOnly: true,
    });

    expect(posSyncService.findAll).toHaveBeenCalledWith({
      branchId: 3,
      page: 1,
      limit: 20,
      failedOnly: true,
    });
    expect(result.total).toBe(1);
  });

  it('returns partner-scoped transfer confirmations for a sync job', async () => {
    await controller.transferConfirmations(
      41,
      { branchId: 3 },
      { partnerCredential: { id: 9, branchId: 3 }, user: { roles: [] } },
    );

    expect(
      partnerCredentialsService.assertCredentialBranchAccess,
    ).toHaveBeenCalledWith({ id: 9, branchId: 3 }, 3);
    expect(posSyncService.listTransferConfirmations).toHaveBeenCalledWith(
      41,
      3,
      9,
    );
  });

  it('blocks transfer confirmations for JWT users without a POS role', async () => {
    expect(() =>
      controller.transferConfirmations(
        41,
        { branchId: 3 },
        { user: { roles: ['CUSTOMER'] } },
      ),
    ).toThrow(ForbiddenException);
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

  it('replays partner-scoped failed entries for a sync job', async () => {
    await controller.replayFailures(
      41,
      { branchId: 3, entryIndexes: [0] },
      { partnerCredential: { id: 9, branchId: 3 }, user: { roles: [] } },
    );

    expect(
      partnerCredentialsService.assertCredentialBranchAccess,
    ).toHaveBeenCalledWith({ id: 9, branchId: 3 }, 3);
    expect(posSyncService.replayFailedEntries).toHaveBeenCalledWith(
      41,
      { branchId: 3, entryIndexes: [0] },
      expect.objectContaining({
        id: null,
        email: null,
        roles: [],
      }),
      9,
    );
  });
});
