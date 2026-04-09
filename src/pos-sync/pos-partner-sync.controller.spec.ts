import { UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { PartnerCredentialsService } from '../partner-credentials/partner-credentials.service';
import { RetailEntitlementsService } from '../retail/retail-entitlements.service';
import { RetailModulesGuard } from '../retail/retail-modules.guard';
import { PosPartnerSyncController } from './pos-partner-sync.controller';
import { PosSyncService } from './pos-sync.service';

describe('PosPartnerSyncController', () => {
  let controller: PosPartnerSyncController;
  let posSyncService: {
    ingest: jest.Mock;
  };
  let partnerCredentialsService: { assertCredentialBranchAccess: jest.Mock };

  beforeEach(async () => {
    posSyncService = {
      ingest: jest.fn(),
    };

    partnerCredentialsService = {
      assertCredentialBranchAccess: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PosPartnerSyncController],
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
          provide: RetailModulesGuard,
          useValue: { canActivate: jest.fn().mockReturnValue(true) },
        },
      ],
    }).compile();

    controller = module.get(PosPartnerSyncController);
  });

  it('forwards partner-bound branch ingestion to the POS sync service', async () => {
    await controller.partnerIngest(
      {
        branchId: 3,
        syncType: 'SALES_SUMMARY' as any,
        entries: [],
      },
      {
        partnerCredential: { id: 9, branchId: 3 },
      },
    );

    expect(
      partnerCredentialsService.assertCredentialBranchAccess,
    ).toHaveBeenCalledWith({ id: 9, branchId: 3 }, 3);
    expect(posSyncService.ingest).toHaveBeenCalledWith(
      expect.objectContaining({ partnerCredentialId: 9, branchId: 3 }),
      expect.any(Object),
    );
  });

  it('blocks partner ingestion when the credential is bound to another branch', async () => {
    partnerCredentialsService.assertCredentialBranchAccess.mockImplementation(
      () => {
        throw new UnauthorizedException(
          'Partner credential is not authorized for branch 4',
        );
      },
    );

    expect(() =>
      controller.partnerIngest(
        {
          branchId: 4,
          syncType: 'SALES_SUMMARY' as any,
          entries: [],
        },
        {
          partnerCredential: { id: 9, branchId: 3 },
        },
      ),
    ).toThrow(UnauthorizedException);

    expect(posSyncService.ingest).not.toHaveBeenCalled();
  });
});
