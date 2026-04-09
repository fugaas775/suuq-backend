import { UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { PartnerCredentialsService } from '../partner-credentials/partner-credentials.service';
import { RetailEntitlementsService } from '../retail/retail-entitlements.service';
import { RetailModulesGuard } from '../retail/retail-modules.guard';
import { PosPartnerCheckoutController } from './pos-partner-checkout.controller';
import { PosCheckoutService } from './pos-checkout.service';

describe('PosPartnerCheckoutController', () => {
  let controller: PosPartnerCheckoutController;
  let posCheckoutService: {
    findAll: jest.Mock;
    findOne: jest.Mock;
    ingest: jest.Mock;
  };
  let partnerCredentialsService: { assertCredentialBranchAccess: jest.Mock };

  beforeEach(async () => {
    posCheckoutService = {
      findAll: jest.fn(),
      findOne: jest.fn(),
      ingest: jest.fn(),
    };

    partnerCredentialsService = {
      assertCredentialBranchAccess: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PosPartnerCheckoutController],
      providers: [
        { provide: PosCheckoutService, useValue: posCheckoutService },
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

    controller = module.get(PosPartnerCheckoutController);
  });

  it('returns partner-scoped checkout history', async () => {
    await controller.findAll(
      { branchId: 3, page: 1, limit: 20 },
      { partnerCredential: { id: 9, branchId: 3 } },
    );

    expect(
      partnerCredentialsService.assertCredentialBranchAccess,
    ).toHaveBeenCalledWith({ id: 9, branchId: 3 }, 3);
    expect(posCheckoutService.findAll).toHaveBeenCalledWith({
      branchId: 3,
      page: 1,
      limit: 20,
    });
  });

  it('returns partner-scoped checkout detail', async () => {
    await controller.findOne(71, 3, {
      partnerCredential: { id: 9, branchId: 3 },
    });

    expect(posCheckoutService.findOne).toHaveBeenCalledWith(71, 3);
  });

  it('forwards partner checkout ingestion with bound credential id', async () => {
    await controller.ingest(
      {
        branchId: 3,
        transactionType: 'SALE' as any,
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
      },
      {
        partnerCredential: { id: 9, branchId: 3 },
      },
    );

    expect(posCheckoutService.ingest).toHaveBeenCalledWith(
      expect.objectContaining({ branchId: 3, partnerCredentialId: 9 }),
      expect.objectContaining({ id: null, email: null }),
    );
  });

  it('blocks partner checkout access when the credential is bound to another branch', async () => {
    partnerCredentialsService.assertCredentialBranchAccess.mockImplementation(
      () => {
        throw new UnauthorizedException(
          'Partner credential is not authorized for branch 4',
        );
      },
    );

    expect(() =>
      controller.findAll(
        { branchId: 4 },
        { partnerCredential: { id: 9, branchId: 3 } },
      ),
    ).toThrow(UnauthorizedException);

    expect(posCheckoutService.findAll).not.toHaveBeenCalled();
  });
});
