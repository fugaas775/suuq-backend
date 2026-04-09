import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BranchStaffService } from './branch-staff.service';
import { PosWorkspaceActivationService } from './pos-workspace-activation.service';
import { RetailEntitlementsService } from '../retail/retail-entitlements.service';
import { EbirrService } from '../ebirr/ebirr.service';
import {
  TenantSubscription,
  TenantSubscriptionStatus,
} from '../retail/entities/tenant-subscription.entity';
import {
  RetailModule,
  TenantModuleEntitlement,
} from '../retail/entities/tenant-module-entitlement.entity';

describe('PosWorkspaceActivationService', () => {
  let service: PosWorkspaceActivationService;

  const branchStaffServiceMock = {
    getPosWorkspaceActivationCandidatesForUser: jest.fn(),
  };

  const retailEntitlementsServiceMock = {
    getBranchWorkspaceStatus: jest.fn(),
  };

  const ebirrServiceMock = {
    initiatePayment: jest.fn(),
  };

  const tenantSubscriptionsRepository = {
    findOne: jest.fn(),
    create: jest.fn((value) => value),
    save: jest.fn(async (value) => value),
  };

  const tenantModuleEntitlementsRepository = {
    findOne: jest.fn(),
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    tenantSubscriptionsRepository.create.mockImplementation((value) => value);
    tenantSubscriptionsRepository.save.mockImplementation(
      async (value) => value,
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PosWorkspaceActivationService,
        { provide: BranchStaffService, useValue: branchStaffServiceMock },
        {
          provide: RetailEntitlementsService,
          useValue: retailEntitlementsServiceMock,
        },
        { provide: EbirrService, useValue: ebirrServiceMock },
        {
          provide: getRepositoryToken(TenantSubscription),
          useValue: tenantSubscriptionsRepository,
        },
        {
          provide: getRepositoryToken(TenantModuleEntitlement),
          useValue: tenantModuleEntitlementsRepository,
        },
      ],
    }).compile();

    service = module.get<PosWorkspaceActivationService>(
      PosWorkspaceActivationService,
    );
  });

  it('initiates Ebirr payment for a manager-owned activation candidate', async () => {
    branchStaffServiceMock.getPosWorkspaceActivationCandidatesForUser.mockResolvedValue(
      [
        {
          branchId: 21,
          branchName: 'Bole Flagship',
          role: 'MANAGER',
          isOwner: true,
          retailTenantId: 31,
          workspaceStatus: 'PAYMENT_REQUIRED',
          canStartTrial: true,
          canStartActivation: true,
          canOpenNow: false,
          trialStartedAt: null,
          trialEndsAt: null,
          trialDaysRemaining: null,
        },
      ],
    );
    tenantModuleEntitlementsRepository.findOne.mockResolvedValue({
      module: RetailModule.POS_CORE,
      enabled: true,
    });
    ebirrServiceMock.initiatePayment.mockResolvedValue({
      errorCode: '0',
      params: { state: 'PENDING' },
      toPayUrl: 'https://checkout.ebirr.test/session/1',
      responseMsg: 'Confirm the payment in Ebirr, then return to POS-S.',
    });

    const result = await service.startEbirrActivationPayment(
      { id: 9, roles: ['POS_MANAGER'] },
      { branchId: 21, phoneNumber: '0911223344' },
    );

    expect(ebirrServiceMock.initiatePayment).toHaveBeenCalledWith(
      expect.objectContaining({
        phoneNumber: '0911223344',
        amount: '1900.00',
        invoiceId: 'POSACTINV-21',
      }),
    );
    expect(result).toMatchObject({
      branchId: 21,
      branchName: 'Bole Flagship',
      status: 'PENDING_CONFIRMATION',
      checkoutUrl: 'https://checkout.ebirr.test/session/1',
    });
    expect(result.referenceId).toMatch(/^POSACT-21-/);
  });

  it('rejects activation attempts from non-manager staff', async () => {
    branchStaffServiceMock.getPosWorkspaceActivationCandidatesForUser.mockResolvedValue(
      [
        {
          branchId: 21,
          branchName: 'Bole Flagship',
          role: 'OPERATOR',
          isOwner: false,
          retailTenantId: 31,
          workspaceStatus: 'PAYMENT_REQUIRED',
          canStartTrial: false,
          canStartActivation: false,
          canOpenNow: false,
          trialStartedAt: null,
          trialEndsAt: null,
          trialDaysRemaining: null,
        },
      ],
    );

    await expect(
      service.startEbirrActivationPayment(
        { id: 9, roles: ['POS_OPERATOR'] },
        { branchId: 21, phoneNumber: '0911223344' },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('activates the tenant subscription after a successful callback', async () => {
    retailEntitlementsServiceMock.getBranchWorkspaceStatus.mockResolvedValue({
      tenant: { id: 31, name: 'Bole Retail' },
      entitlements: [{ module: RetailModule.POS_CORE }],
      trialStartedAt: null,
      trialEndsAt: null,
      trialDaysRemaining: null,
    });
    tenantSubscriptionsRepository.findOne.mockResolvedValue({
      id: 8,
      tenantId: 31,
      planCode: 'POS_BRANCH',
      status: TenantSubscriptionStatus.PAST_DUE,
      billingInterval: 'MONTHLY',
      startsAt: new Date('2026-04-01T00:00:00.000Z'),
      metadata: { previous: true },
    });

    const result = await service.completeEbirrActivationPayment(
      'POSACT-21-1731100000000',
    );

    expect(tenantSubscriptionsRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 8,
        tenantId: 31,
        status: TenantSubscriptionStatus.ACTIVE,
        amount: 1900,
        currency: 'ETB',
        autoRenew: true,
        metadata: expect.objectContaining({
          lastActivationReferenceId: 'POSACT-21-1731100000000',
          branchId: 21,
        }),
      }),
    );
    expect(result).toMatchObject({
      id: 8,
      status: TenantSubscriptionStatus.ACTIVE,
    });
  });

  it('returns the active subscription unchanged on duplicate callback processing', async () => {
    retailEntitlementsServiceMock.getBranchWorkspaceStatus.mockResolvedValue({
      tenant: { id: 31, name: 'Bole Retail' },
      entitlements: [{ module: RetailModule.POS_CORE }],
      trialStartedAt: null,
      trialEndsAt: null,
      trialDaysRemaining: null,
    });
    tenantSubscriptionsRepository.findOne.mockResolvedValue({
      id: 8,
      tenantId: 31,
      planCode: 'POS_BRANCH',
      status: TenantSubscriptionStatus.ACTIVE,
    });

    const result = await service.completeEbirrActivationPayment(
      'POSACT-21-1731100000000',
    );

    expect(tenantSubscriptionsRepository.save).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      id: 8,
      status: TenantSubscriptionStatus.ACTIVE,
    });
  });

  it('rejects completion when the branch is missing POS entitlement setup', async () => {
    retailEntitlementsServiceMock.getBranchWorkspaceStatus.mockResolvedValue({
      tenant: { id: 31, name: 'Bole Retail' },
      entitlements: [],
      trialStartedAt: null,
      trialEndsAt: null,
      trialDaysRemaining: null,
    });

    await expect(
      service.completeEbirrActivationPayment('POSACT-21-1731100000000'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('ignores unsupported activation references', async () => {
    await expect(
      service.completeEbirrActivationPayment('POSACT-invalid'),
    ).resolves.toBeNull();
  });

  it('starts a 15-day trial for an eligible manager-owned workspace', async () => {
    branchStaffServiceMock.getPosWorkspaceActivationCandidatesForUser.mockResolvedValue(
      [
        {
          branchId: 21,
          branchName: 'Bole Flagship',
          role: 'MANAGER',
          isOwner: true,
          retailTenantId: 31,
          workspaceStatus: 'PAYMENT_REQUIRED',
          canStartTrial: true,
          canStartActivation: true,
          canOpenNow: false,
          trialStartedAt: null,
          trialEndsAt: null,
          trialDaysRemaining: null,
        },
      ],
    );
    retailEntitlementsServiceMock.getBranchWorkspaceStatus.mockResolvedValue({
      tenant: { id: 31, name: 'Bole Retail' },
      entitlements: [{ module: RetailModule.POS_CORE }],
      trialStartedAt: null,
      trialEndsAt: null,
      trialDaysRemaining: null,
    });
    tenantSubscriptionsRepository.findOne.mockResolvedValue(null);

    const result = await service.startTrialActivation(
      { id: 9, roles: ['POS_MANAGER'] },
      { branchId: 21 },
    );

    expect(tenantSubscriptionsRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 31,
        status: TenantSubscriptionStatus.TRIAL,
        autoRenew: false,
        metadata: expect.objectContaining({
          branchId: 21,
          hasUsedTrial: true,
          lastActivationPaymentMethod: 'TRIAL',
        }),
      }),
    );
    expect(result).toMatchObject({
      branchId: 21,
      branchName: 'Bole Flagship',
      status: 'TRIAL',
      trialDaysRemaining: 15,
    });
  });
});
