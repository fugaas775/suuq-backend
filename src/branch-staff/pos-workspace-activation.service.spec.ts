import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BranchStaffService } from './branch-staff.service';
import { PosWorkspaceActivationService } from './pos-workspace-activation.service';
import { RetailEntitlementsService } from '../retail/retail-entitlements.service';
import { EbirrService } from '../ebirr/ebirr.service';
import { Branch } from '../branches/entities/branch.entity';
import { BranchStaffAssignment } from './entities/branch-staff-assignment.entity';
import { User } from '../users/entities/user.entity';
import { EquityPartnerService } from '../retail/equity-partner.service';
import { EmailService } from '../email/email.service';
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
    getPosBranchSummariesForUser: jest.fn().mockResolvedValue([]),
  };

  const branchesRepository = {
    find: jest.fn(),
  };

  const branchStaffAssignmentsRepository = {
    find: jest.fn(),
  };

  const retailEntitlementsServiceMock = {
    getBranchWorkspaceStatus: jest.fn(),
  };

  const ebirrServiceMock = {
    initiatePayment: jest.fn(),
    expireStalePendingTransactionsForPrefix: jest
      .fn()
      .mockResolvedValue(undefined),
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
    branchStaffServiceMock.getPosBranchSummariesForUser.mockResolvedValue([]);
    tenantSubscriptionsRepository.create.mockImplementation((value) => value);
    tenantSubscriptionsRepository.save.mockImplementation(
      async (value) => value,
    );
    ebirrServiceMock.expireStalePendingTransactionsForPrefix.mockResolvedValue(
      undefined,
    );
    branchesRepository.find.mockReset();
    branchStaffAssignmentsRepository.find.mockReset();

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
        {
          provide: getRepositoryToken(Branch),
          useValue: branchesRepository,
        },
        {
          provide: getRepositoryToken(BranchStaffAssignment),
          useValue: branchStaffAssignmentsRepository,
        },
        {
          provide: EquityPartnerService,
          useValue: {
            createMonthlyPayoutsForBranch: jest
              .fn()
              .mockResolvedValue(undefined),
            findActivePartnerByReferralCode: jest.fn().mockResolvedValue(null),
          },
        },
        {
          provide: EmailService,
          useValue: {
            sendPosBranchCreatedEmail: jest.fn().mockResolvedValue(undefined),
            sendBranchActivationPaymentEmail: jest
              .fn()
              .mockResolvedValue(undefined),
          },
        },
        {
          provide: getRepositoryToken(User),
          useValue: { findOne: jest.fn().mockResolvedValue(null) },
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
          serviceFormat: 'RETAIL',
          role: 'MANAGER',
          isOwner: true,
          retailTenantId: 31,
          workspaceStatus: 'PAYMENT_REQUIRED',
          canStartTrial: true,
          canStartActivation: true,
          canPayNow: true,
          canOpenNow: false,
          trialStartedAt: null,
          trialEndsAt: null,
          trialDaysRemaining: null,
        },
      ],
    );
    retailEntitlementsServiceMock.getBranchWorkspaceStatus.mockResolvedValue({
      branch: { id: 21, serviceFormat: 'RETAIL' },
      governance: {
        activationReadiness: {
          canActivate: true,
          blockers: [],
        },
      },
    });
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
        amount: '3900.00',
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
        branchId: 21,
        status: TenantSubscriptionStatus.ACTIVE,
        amount: 3900,
        amountTotal: 3900,
        periodMonths: 1,
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

  it('returns pending additional branch creation when Ebirr responds with gateway-timeout code E102051', async () => {
    branchStaffAssignmentsRepository.find.mockResolvedValue([
      { branchId: 21, userId: 9, isActive: true },
    ]);
    branchesRepository.find.mockResolvedValue([{ id: 21, retailTenantId: 31 }]);
    tenantSubscriptionsRepository.findOne.mockResolvedValue({
      id: 8,
      tenantId: 31,
      status: TenantSubscriptionStatus.ACTIVE,
      metadata: null,
    });
    const gatewayTimeoutError: any = new Error(
      'Transaction TIMEOUT (Gateway Timeout Error) (Code: E102051)',
    );
    gatewayTimeoutError.providerCode = 'E102051';
    ebirrServiceMock.initiatePayment.mockRejectedValue(gatewayTimeoutError);

    const result = await service.startAdditionalBranchCreationPayment(
      { id: 9, roles: ['POS_MANAGER'], email: 'seller@suuq.test' },
      {
        branchName: 'Smart Retail',
        serviceFormat: 'RETAIL',
        city: 'Addis Ababa',
        country: 'Ethiopia',
        address: 'Bole',
        defaultCurrency: 'ETB',
        phoneNumber: '0911223344',
        phone: '0911223344',
        tinNumber: '1234567890',
      },
    );

    expect(result).toMatchObject({
      status: 'PENDING',
      branchId: null,
      checkoutUrl: null,
      receiveCode: null,
    });
    expect(result.referenceId).toMatch(/^POSBRANCH-31-9-/);
    expect(result.providerMessage).toMatch(
      /wait for provider confirmation to create the branch automatically/i,
    );
    expect(tenantSubscriptionsRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          pendingBranchCreation: expect.objectContaining({
            branchName: 'Smart Retail',
            serviceFormat: 'RETAIL',
          }),
        }),
      }),
    );
  });

  it('does not import or depend on Product / BranchInventory entities (no product copy on equity-partner activation)', () => {
    // Regression guard for issue #4 (Phase 5): when an equity partner referral
    // creates a branch, no product/inventory rows must be seeded from anywhere.
    // The service should never have product/inventory repositories injected.

    const fs = require('fs');
    const source: string = fs.readFileSync(
      require.resolve('./pos-workspace-activation.service'),
      'utf-8',
    );
    expect(source).not.toMatch(/from\s+['"][^'"]*product[^'"]*['"]/i);
    expect(source).not.toMatch(/BranchInventory/);
    expect(source).not.toMatch(/Product\b/);
  });
  describe('branch-scoped subscription resolution', () => {
    function stubWorkspace() {
      retailEntitlementsServiceMock.getBranchWorkspaceStatus.mockResolvedValue({
        tenant: { id: 31, name: 'Bole Retail' },
        entitlements: [{ module: RetailModule.POS_CORE }],
        trialStartedAt: null,
        trialEndsAt: null,
        trialDaysRemaining: null,
      });
    }

    it('never falls back to a sibling branch subscription when this branch has none', async () => {
      stubWorkspace();
      // Branch 21 has no row; branch 99's row must NOT stand in for it. Only a
      // legacy tenant-wide row (branchId null) may.
      tenantSubscriptionsRepository.findOne.mockImplementation(
        async ({ where }: any) => {
          if (where.branchId === 21) return null;
          if (where.branchId === undefined)
            return { id: 4, tenantId: 31, branchId: 99 };
          return null; // the IsNull() legacy query
        },
      );

      await service.completeEbirrActivationPayment('POSACT-21-1731100000000');

      // A fresh row is created for branch 21 rather than branch 99's being reused.
      expect(tenantSubscriptionsRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: 31, branchId: 21 }),
      );
      expect(tenantSubscriptionsRepository.save).not.toHaveBeenCalledWith(
        expect.objectContaining({ id: 4 }),
      );
    });

    it('writes the pending period onto the row the completion reader will look at', async () => {
      stubWorkspace();
      const branchRow = { id: 8, tenantId: 31, branchId: 21, metadata: {} };
      tenantSubscriptionsRepository.findOne.mockImplementation(
        async ({ where }: any) => (where.branchId === 21 ? branchRow : null),
      );
      ebirrServiceMock.initiatePayment.mockResolvedValue({
        errorCode: '0',
        params: { state: 'PENDING' },
      });
      branchStaffServiceMock.getPosWorkspaceActivationCandidatesForUser.mockResolvedValue(
        [
          {
            branchId: 21,
            branchName: 'Bole Flagship',
            isOwner: true,
            role: 'MANAGER',
            workspaceStatus: 'PAYMENT_REQUIRED',
            retailTenantId: 31,
            serviceFormat: 'RETAIL',
            canStartActivation: true,
            canPayNow: true,
            canPayNow: true,
          },
        ],
      );
      tenantModuleEntitlementsRepository.findOne.mockResolvedValue({
        enabled: true,
      });

      await service.startEbirrActivationPayment(
        { id: 41, roles: ['POS_MANAGER'] },
        {
          branchId: 21,
          phoneNumber: '251911223344',
          subscriptionPeriod: 'ONE_YEAR',
        },
      );

      expect(tenantSubscriptionsRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 8,
          metadata: expect.objectContaining({
            pendingActivation: expect.objectContaining({
              branchId: 21,
              period: 'ONE_YEAR',
            }),
          }),
        }),
      );
    });

    it('recovers the period from the reference when no subscription row exists to stash it on', async () => {
      stubWorkspace();
      // No row anywhere: the pending-period write had nothing to land on, so
      // without the reference suffix this would grant a MONTHLY period for a
      // year that was already charged.
      tenantSubscriptionsRepository.findOne.mockResolvedValue(null);

      await service.completeEbirrActivationPayment(
        'POSACT-21-1731100000000-ONE_YEAR',
      );

      expect(tenantSubscriptionsRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          branchId: 21,
          periodMonths: 12,
          status: TenantSubscriptionStatus.ACTIVE,
        }),
      );
    });

    it('still parses legacy references with no period suffix', async () => {
      stubWorkspace();
      tenantSubscriptionsRepository.findOne.mockResolvedValue(null);

      await service.completeEbirrActivationPayment('POSACT-21-1731100000000');

      expect(tenantSubscriptionsRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ branchId: 21, periodMonths: 1 }),
      );
    });
  });
  describe('converting a live free trial', () => {
    const trialSummary = {
      branchId: 21,
      branchName: 'Bole Bites',
      serviceFormat: 'QSR',
      retailTenantId: 31,
      isOwner: true,
      role: 'MANAGER',
      workspaceStatus: 'ACTIVE',
      isTrialWorkspace: true,
      canStartActivation: false,
      canPayNow: true,
    };

    beforeEach(() => {
      // A trialing branch is ACTIVE, so it is deliberately absent here.
      branchStaffServiceMock.getPosWorkspaceActivationCandidatesForUser.mockResolvedValue(
        [],
      );
      retailEntitlementsServiceMock.getBranchWorkspaceStatus.mockResolvedValue({
        tenant: { id: 31, name: 'Bole Retail' },
        branch: { serviceFormat: 'QSR' },
        entitlements: [{ module: RetailModule.POS_CORE }],
      });
      tenantModuleEntitlementsRepository.findOne.mockResolvedValue({
        enabled: true,
      });
      tenantSubscriptionsRepository.findOne.mockResolvedValue(null);
      ebirrServiceMock.initiatePayment.mockResolvedValue({
        errorCode: '0',
        params: { state: 'PENDING' },
        toPayUrl: 'https://checkout.ebirr.test/1',
      });
    });

    it('accepts an early payment for a branch that is open on a trial', async () => {
      branchStaffServiceMock.getPosBranchSummariesForUser.mockResolvedValue([
        trialSummary,
      ]);

      const result = await service.startEbirrActivationPayment(
        { id: 41, roles: ['POS_MANAGER'] },
        { branchId: 21, phoneNumber: '251911223344' },
      );

      expect(result).toMatchObject({ branchId: 21 });
      expect(ebirrServiceMock.initiatePayment).toHaveBeenCalled();
    });

    it('refuses an operator who cannot pay for the trial branch', async () => {
      branchStaffServiceMock.getPosBranchSummariesForUser.mockResolvedValue([
        { ...trialSummary, isOwner: false, role: 'OPERATOR', canPayNow: false },
      ]);

      await expect(
        service.startEbirrActivationPayment(
          { id: 41, roles: ['POS_OPERATOR'] },
          { branchId: 21, phoneNumber: '251911223344' },
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(ebirrServiceMock.initiatePayment).not.toHaveBeenCalled();
    });

    it('still refuses a paid ACTIVE branch that has nothing to pay for', async () => {
      branchStaffServiceMock.getPosBranchSummariesForUser.mockResolvedValue([
        { ...trialSummary, isTrialWorkspace: false, canPayNow: false },
      ]);

      await expect(
        service.startEbirrActivationPayment(
          { id: 41, roles: ['POS_MANAGER'] },
          { branchId: 21, phoneNumber: '251911223344' },
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('ends a live trial on payment and starts the paid period today', async () => {
      const trialEndsAt = new Date(Date.now() + 120 * 86_400_000);
      retailEntitlementsServiceMock.getBranchWorkspaceStatus.mockResolvedValue({
        tenant: { id: 31, name: 'Bole Retail' },
        entitlements: [{ module: RetailModule.POS_CORE }],
      });
      tenantSubscriptionsRepository.findOne.mockResolvedValue({
        id: 8,
        tenantId: 31,
        branchId: 21,
        planCode: 'POS_BRANCH_TRIAL_14D',
        status: TenantSubscriptionStatus.TRIAL,
        endsAt: trialEndsAt,
        metadata: {},
      });

      await service.completeEbirrActivationPayment(
        'POSACT-21-1731100000000-MONTHLY',
      );

      const saved = tenantSubscriptionsRepository.save.mock.calls[0][0];
      expect(saved.status).toBe(TenantSubscriptionStatus.ACTIVE);
      // 30 days from today. The 120 free days still on the trial are given up —
      // stacking them would push a paid month four months out.
      expect(saved.endsAt.getTime()).toBeLessThan(Date.now() + 31 * 86_400_000);
      expect(saved.endsAt.getTime()).toBeGreaterThan(
        Date.now() + 29 * 86_400_000,
      );
      // The trial is over: the row no longer carries a trial plan code, and the
      // free time it gave up is on the record.
      expect(saved.planCode).not.toMatch(/TRIAL/);
      expect(saved.metadata.convertedFromTrialAt).toBeTruthy();
      expect(saved.metadata.trialWouldHaveEndedAt).toBe(
        trialEndsAt.toISOString(),
      );
      // One row, converted in place.
      expect(saved.id).toBe(8);
      expect(tenantSubscriptionsRepository.save).toHaveBeenCalledTimes(1);
    });

    it('does not back-date a paid period when the trial has already lapsed', async () => {
      const lapsedAt = new Date(Date.now() - 3 * 86_400_000);
      retailEntitlementsServiceMock.getBranchWorkspaceStatus.mockResolvedValue({
        tenant: { id: 31, name: 'Bole Retail' },
        entitlements: [{ module: RetailModule.POS_CORE }],
      });
      tenantSubscriptionsRepository.findOne.mockResolvedValue({
        id: 8,
        tenantId: 31,
        branchId: 21,
        planCode: 'POS_BRANCH_TRIAL_14D',
        status: TenantSubscriptionStatus.TRIAL,
        endsAt: lapsedAt,
        metadata: {},
      });

      await service.completeEbirrActivationPayment(
        'POSACT-21-1731100000000-MONTHLY',
      );

      const saved = tenantSubscriptionsRepository.save.mock.calls[0][0];
      expect(saved.endsAt.getTime()).toBeGreaterThan(
        Date.now() + 29 * 86_400_000,
      );
    });
  });
});
