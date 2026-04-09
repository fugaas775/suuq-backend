import { UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { PartnerCredentialsService } from '../partner-credentials/partner-credentials.service';
import { RetailEntitlementsService } from '../retail/retail-entitlements.service';
import { RetailModulesGuard } from '../retail/retail-modules.guard';
import { PosPartnerRegisterController } from './pos-partner-register.controller';
import { PosRegisterService } from './pos-register.service';

describe('PosPartnerRegisterController', () => {
  let controller: PosPartnerRegisterController;
  let posRegisterService: {
    findSessions: jest.Mock;
    openSession: jest.Mock;
    closeSession: jest.Mock;
    findSuspendedCarts: jest.Mock;
    suspendCart: jest.Mock;
    resumeSuspendedCart: jest.Mock;
    discardSuspendedCart: jest.Mock;
  };
  let partnerCredentialsService: { assertCredentialBranchAccess: jest.Mock };

  beforeEach(async () => {
    posRegisterService = {
      findSessions: jest.fn(),
      openSession: jest.fn(),
      closeSession: jest.fn(),
      findSuspendedCarts: jest.fn(),
      suspendCart: jest.fn(),
      resumeSuspendedCart: jest.fn(),
      discardSuspendedCart: jest.fn(),
    };

    partnerCredentialsService = {
      assertCredentialBranchAccess: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PosPartnerRegisterController],
      providers: [
        { provide: PosRegisterService, useValue: posRegisterService },
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

    controller = module.get(PosPartnerRegisterController);
  });

  it('returns partner-scoped register sessions', async () => {
    await controller.findSessions(
      { branchId: 3, page: 1, limit: 20 },
      { partnerCredential: { id: 9, branchId: 3 } },
    );

    expect(posRegisterService.findSessions).toHaveBeenCalledWith({
      branchId: 3,
      page: 1,
      limit: 20,
    });
  });

  it('opens partner-scoped register sessions', async () => {
    await controller.openSession(
      { branchId: 3, registerId: 'front-1' },
      { partnerCredential: { id: 9, branchId: 3 } },
    );

    expect(posRegisterService.openSession).toHaveBeenCalledWith(
      { branchId: 3, registerId: 'front-1' },
      { id: null, email: null },
    );
  });

  it('closes partner-scoped register sessions', async () => {
    await controller.closeSession(
      11,
      { branchId: 3 },
      { partnerCredential: { id: 9, branchId: 3 } },
    );

    expect(posRegisterService.closeSession).toHaveBeenCalledWith(
      11,
      { branchId: 3 },
      { id: null, email: null },
    );
  });

  it('lists partner-scoped suspended carts', async () => {
    await controller.findSuspendedCarts(
      { branchId: 3 },
      { partnerCredential: { id: 9, branchId: 3 } },
    );

    expect(posRegisterService.findSuspendedCarts).toHaveBeenCalledWith({
      branchId: 3,
    });
  });

  it('mutates partner-scoped suspended carts', async () => {
    await controller.suspendCart(
      {
        branchId: 3,
        label: 'Lane 2 basket',
        currency: 'USD',
        itemCount: 1,
        total: 15,
        cartSnapshot: { items: [] },
      },
      { partnerCredential: { id: 9, branchId: 3 } },
    );
    await controller.resumeSuspendedCart(
      91,
      { branchId: 3 },
      { partnerCredential: { id: 9, branchId: 3 } },
    );
    await controller.discardSuspendedCart(
      91,
      { branchId: 3 },
      { partnerCredential: { id: 9, branchId: 3 } },
    );

    expect(posRegisterService.suspendCart).toHaveBeenCalled();
    expect(posRegisterService.resumeSuspendedCart).toHaveBeenCalledWith(
      91,
      { branchId: 3 },
      { id: null, email: null },
    );
    expect(posRegisterService.discardSuspendedCart).toHaveBeenCalledWith(
      91,
      { branchId: 3 },
      { id: null, email: null },
    );
  });

  it('blocks partner register access when the credential is bound to another branch', async () => {
    partnerCredentialsService.assertCredentialBranchAccess.mockImplementation(
      () => {
        throw new UnauthorizedException(
          'Partner credential is not authorized for branch 4',
        );
      },
    );

    expect(() =>
      controller.findSessions(
        { branchId: 4 },
        { partnerCredential: { id: 9, branchId: 3 } },
      ),
    ).toThrow(UnauthorizedException);

    expect(posRegisterService.findSessions).not.toHaveBeenCalled();
  });
});
