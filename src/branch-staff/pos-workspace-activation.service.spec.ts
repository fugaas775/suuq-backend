import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BranchStaffService } from './branch-staff.service';
import { PosWorkspaceActivationService } from './pos-workspace-activation.service';
import { RetailEntitlementsService } from '../retail/retail-entitlements.service';
import { SubscriptionPaymentClaimsService } from '../subscription-payments/subscription-payment-claims.service';
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
    findOne: jest.fn(),
  };

  const branchStaffAssignmentsRepository = {
    find: jest.fn(),
  };

  const retailEntitlementsServiceMock = {
    getBranchWorkspaceStatus: jest.fn(),
  };

  const proof = { channel: 'CBE', payerReference: 'FT24123ABCD' };
  const paymentClaimsMock = {
    assertProofAcceptable: jest.fn(),
    submit: jest.fn(),
    describeForCustomer: jest.fn(),
    findByReference: jest.fn(),
  };

  const tenantSubscriptionsRepository = {
    findOne: jest.fn(),
    find: jest.fn().mockResolvedValue([]),
    create: jest.fn((value) => value),
    save: jest.fn(async (value) => value),
  };

  const emailServiceMock = {
    sendPosBranchCreatedEmail: jest.fn(),
    sendBranchActivationPaymentEmail: jest.fn(),
    sendSubscriptionReceiptEmail: jest.fn(),
  };
  const usersRepositoryMock = { findOne: jest.fn() };

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
    paymentClaimsMock.assertProofAcceptable.mockResolvedValue(undefined);
    paymentClaimsMock.submit.mockImplementation(async (input) => ({
      id: 1,
      status: 'SUBMITTED',
      createdAt: new Date(),
      ...input,
    }));
    paymentClaimsMock.describeForCustomer.mockImplementation((claim) => ({
      claimId: claim.id,
      referenceId: claim.referenceId,
      status: 'PENDING_VERIFICATION',
      amount: claim.amount,
      currency: claim.currency,
      channel: claim.channel,
      payerReference: claim.payerReference,
      message: 'Payment submitted.',
    }));
    paymentClaimsMock.findByReference.mockResolvedValue(null);
    tenantSubscriptionsRepository.find.mockResolvedValue([]);
    emailServiceMock.sendPosBranchCreatedEmail.mockResolvedValue(undefined);
    emailServiceMock.sendBranchActivationPaymentEmail.mockResolvedValue(
      undefined,
    );
    emailServiceMock.sendSubscriptionReceiptEmail.mockResolvedValue(undefined);
    usersRepositoryMock.findOne.mockResolvedValue(null);
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
        {
          provide: SubscriptionPaymentClaimsService,
          useValue: paymentClaimsMock,
        },
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
        { provide: EmailService, useValue: emailServiceMock },
        { provide: getRepositoryToken(User), useValue: usersRepositoryMock },
      ],
    }).compile();

    service = module.get<PosWorkspaceActivationService>(
      PosWorkspaceActivationService,
    );
  });

  it('files a payment claim for a manager-owned activation candidate and grants nothing', async () => {
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

    const result = await service.startActivationPayment(
      { id: 9, roles: ['POS_MANAGER'] },
      { branchId: 21, ...proof },
    );

    // Nothing is granted: the claim goes to the admin queue with the proof.
    expect(paymentClaimsMock.submit).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'POS_BRANCH',
        branchId: 21,
        amount: 3900,
        channel: 'CBE',
        payerReference: 'FT24123ABCD',
      }),
    );
    expect(tenantSubscriptionsRepository.save).not.toHaveBeenCalledWith(
      expect.objectContaining({ status: TenantSubscriptionStatus.ACTIVE }),
    );
    expect(result).toMatchObject({
      branchId: 21,
      branchName: 'Bole Flagship',
      status: 'PENDING_VERIFICATION',
    });
    expect(result.referenceId).toMatch(/^POSACT-21-/);
  });

  describe('what a branch is charged', () => {
    const candidateFor = (serviceFormat: string) => {
      branchStaffServiceMock.getPosWorkspaceActivationCandidatesForUser.mockResolvedValue(
        [
          {
            branchId: 21,
            branchName: 'Bole Flagship',
            serviceFormat,
            role: 'MANAGER',
            isOwner: true,
            retailTenantId: 31,
            workspaceStatus: 'PAYMENT_REQUIRED',
            canStartActivation: true,
            canPayNow: true,
            canOpenNow: false,
          },
        ],
      );
      retailEntitlementsServiceMock.getBranchWorkspaceStatus.mockResolvedValue({
        branch: { id: 21, serviceFormat },
        governance: {
          activationReadiness: { canActivate: true, blockers: [] },
        },
      });
      tenantModuleEntitlementsRepository.findOne.mockResolvedValue({
        module: RetailModule.POS_CORE,
        enabled: true,
      });
    };
    const pay = (subscriptionPeriod?: string) =>
      service.startActivationPayment(
        { id: 9, roles: ['POS_MANAGER'] },
        { branchId: 21, subscriptionPeriod, ...proof },
      );
    const claimedAmount = () =>
      paymentClaimsMock.submit.mock.calls[0][0].amount as number;

    it('charges a school 4,900 a month and 52,920 a year', async () => {
      candidateFor('SCHOOL');
      branchesRepository.findOne.mockResolvedValue({
        id: 21,
        serviceFormat: 'SCHOOL',
        subscriptionDiscountPercent: 0,
      });

      await pay('MONTHLY');
      expect(claimedAmount()).toBe(4900);

      paymentClaimsMock.submit.mockClear();
      await pay('ONE_YEAR');
      expect(claimedAmount()).toBe(52920);
    });

    it('takes the branch discount off the amount claimed', async () => {
      candidateFor('RETAIL');
      branchesRepository.findOne.mockResolvedValue({
        id: 21,
        serviceFormat: 'RETAIL',
        subscriptionDiscountPercent: 50,
      });

      await pay('MONTHLY');

      expect(claimedAmount()).toBe(1950);
    });

    it('takes no payment from a complimentary branch', async () => {
      candidateFor('SCHOOL');
      branchesRepository.findOne.mockResolvedValue({
        id: 21,
        serviceFormat: 'SCHOOL',
        subscriptionDiscountPercent: 100,
      });

      await expect(pay('MONTHLY')).rejects.toMatchObject({ status: 409 });
      expect(paymentClaimsMock.submit).not.toHaveBeenCalled();
    });
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
      service.startActivationPayment(
        { id: 9, roles: ['POS_OPERATOR'] },
        { branchId: 21, ...proof },
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

    const result = await service.completeActivationPayment(
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
        // Ebirr holds no mandate — nothing renews by itself.
        autoRenew: false,
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

    const result = await service.completeActivationPayment(
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
      service.completeActivationPayment('POSACT-21-1731100000000'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('ignores unsupported activation references', async () => {
    await expect(
      service.completeActivationPayment('POSACT-invalid'),
    ).resolves.toBeNull();
  });

  it('holds a new branch until its payment is verified', async () => {
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

    const result = await service.startAdditionalBranchCreationPayment(
      { id: 9, roles: ['POS_MANAGER'], email: 'seller@suuq.test' },
      {
        branchName: 'Smart Retail',
        serviceFormat: 'RETAIL',
        city: 'Addis Ababa',
        country: 'Ethiopia',
        address: 'Bole',
        defaultCurrency: 'ETB',
        phone: '0911223344',
        tinNumber: '1234567890',
        ...proof,
      },
    );

    expect(result).toMatchObject({ status: 'PENDING', branchId: null });
    expect(result.referenceId).toMatch(/^POSBRANCH-31-9-/);
    expect(paymentClaimsMock.submit).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'POS_BRANCH_CREATE',
        tenantId: 31,
        subjectName: 'Smart Retail',
        amount: 3900,
      }),
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

  it('will not create a branch for a reference that is not the pending one', async () => {
    tenantSubscriptionsRepository.findOne.mockResolvedValue({
      id: 8,
      tenantId: 31,
      status: TenantSubscriptionStatus.ACTIVE,
      metadata: {
        pendingBranchCreation: {
          referenceId: 'POSBRANCH-31-9-111',
          branchName: 'Smart Retail',
          serviceFormat: 'RETAIL',
        },
      },
    });

    const result =
      await service.completeBranchCreationPayment('POSBRANCH-31-9-999');

    expect(result).toEqual({ branchId: 0, created: false });
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

      await service.completeActivationPayment('POSACT-21-1731100000000');

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

      await service.startActivationPayment(
        { id: 41, roles: ['POS_MANAGER'] },
        {
          branchId: 21,
          ...proof,
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

      await service.completeActivationPayment(
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

      await service.completeActivationPayment('POSACT-21-1731100000000');

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
    });

    it('accepts an early payment for a branch that is open on a trial', async () => {
      branchStaffServiceMock.getPosBranchSummariesForUser.mockResolvedValue([
        trialSummary,
      ]);

      const result = await service.startActivationPayment(
        { id: 41, roles: ['POS_MANAGER'] },
        { branchId: 21, ...proof },
      );

      expect(result).toMatchObject({ branchId: 21 });
      expect(paymentClaimsMock.submit).toHaveBeenCalled();
    });

    it('refuses an operator who cannot pay for the trial branch', async () => {
      branchStaffServiceMock.getPosBranchSummariesForUser.mockResolvedValue([
        { ...trialSummary, isOwner: false, role: 'OPERATOR', canPayNow: false },
      ]);

      await expect(
        service.startActivationPayment(
          { id: 41, roles: ['POS_OPERATOR'] },
          { branchId: 21, ...proof },
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(paymentClaimsMock.submit).not.toHaveBeenCalled();
    });

    it('still refuses a paid ACTIVE branch that has nothing to pay for', async () => {
      branchStaffServiceMock.getPosBranchSummariesForUser.mockResolvedValue([
        { ...trialSummary, isTrialWorkspace: false, canPayNow: false },
      ]);

      await expect(
        service.startActivationPayment(
          { id: 41, roles: ['POS_MANAGER'] },
          { branchId: 21, ...proof },
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('starts a term paid during the free period when the free period ends — no free day lost', async () => {
      const trialEndsAt = new Date(Date.now() + 40 * 86_400_000);
      retailEntitlementsServiceMock.getBranchWorkspaceStatus.mockResolvedValue({
        tenant: { id: 31, name: 'Bole Retail' },
        entitlements: [{ module: RetailModule.POS_CORE }],
      });
      const freeRow = {
        id: 8,
        tenantId: 31,
        branchId: 21,
        planCode: 'POS_BRANCH_TRIAL_14D',
        status: TenantSubscriptionStatus.TRIAL,
        endsAt: trialEndsAt,
        metadata: {},
      };
      tenantSubscriptionsRepository.findOne.mockResolvedValue(freeRow);

      await service.completeActivationPayment(
        'POSACT-21-1731100000000-MONTHLY',
      );

      const saved = tenantSubscriptionsRepository.save.mock.calls[0][0];
      // A row of its own, beginning the instant the free period runs out.
      expect(saved.id).toBeUndefined();
      expect(saved.status).toBe(TenantSubscriptionStatus.ACTIVE);
      expect(saved.startsAt.getTime()).toBe(trialEndsAt.getTime());
      expect(saved.endsAt.getTime()).toBeGreaterThan(
        trialEndsAt.getTime() + 27 * 86_400_000,
      );
      expect(saved.metadata).toMatchObject({
        chainsFromPreviousEnd: true,
        trialWouldHaveEndedAt: trialEndsAt.toISOString(),
      });
      expect(saved.metadata.convertedFromTrialAt).toBeTruthy();
      // The free row is left exactly as it was, to run out on its own date.
      expect(freeRow.status).toBe(TenantSubscriptionStatus.TRIAL);
      expect(freeRow.endsAt.getTime()).toBe(trialEndsAt.getTime());
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

      await service.completeActivationPayment(
        'POSACT-21-1731100000000-MONTHLY',
      );

      const saved = tenantSubscriptionsRepository.save.mock.calls[0][0];
      expect(saved.endsAt.getTime()).toBeGreaterThan(
        Date.now() + 27 * 86_400_000,
      );
    });
  });

  describe('renewing a paid term', () => {
    const DAY = 86_400_000;
    const paidSummary = {
      branchId: 21,
      branchName: 'Bole Bites',
      serviceFormat: 'QSR',
      retailTenantId: 31,
      isOwner: true,
      isTenantOwner: false,
      role: 'MANAGER',
      workspaceStatus: 'ACTIVE',
      isTrialWorkspace: false,
      planCode: 'POS_BRANCH_1M',
      subscriptionStatus: TenantSubscriptionStatus.ACTIVE,
      canStartActivation: false,
      canPayNow: false,
    };
    const stubWorkspace = () =>
      retailEntitlementsServiceMock.getBranchWorkspaceStatus.mockResolvedValue({
        tenant: { id: 31, name: 'Bole Retail' },
        branch: { serviceFormat: 'QSR' },
        entitlements: [{ module: RetailModule.POS_CORE }],
      });
    const paidRow = (overrides: Record<string, any> = {}) => ({
      id: 8,
      tenantId: 31,
      branchId: 21,
      planCode: 'POS_BRANCH_1M',
      status: TenantSubscriptionStatus.ACTIVE,
      startsAt: new Date(Date.now() - 25 * DAY),
      endsAt: new Date(Date.now() + 5 * DAY),
      metadata: {
        lastActivationReferenceId: 'POSACT-21-1700000000000-MONTHLY',
        lastActivatedAt: new Date(Date.now() - 25 * DAY).toISOString(),
      },
      ...overrides,
    });

    beforeEach(() => {
      stubWorkspace();
      branchStaffServiceMock.getPosWorkspaceActivationCandidatesForUser.mockResolvedValue(
        [],
      );
      tenantModuleEntitlementsRepository.findOne.mockResolvedValue({
        enabled: true,
      });
    });

    it('lets an owner pay for the next term while the current one is still running', async () => {
      branchStaffServiceMock.getPosBranchSummariesForUser.mockResolvedValue([
        { ...paidSummary, subscriptionEndsAt: new Date(Date.now() + 5 * DAY) },
      ]);
      tenantSubscriptionsRepository.findOne.mockResolvedValue(null);

      const result = await service.startActivationPayment(
        { id: 41, roles: ['POS_MANAGER'] },
        { branchId: 21, ...proof },
      );

      expect(result).toMatchObject({ branchId: 21 });
      expect(paymentClaimsMock.submit).toHaveBeenCalled();
    });

    it('does not take payment for a term that is months from ending', async () => {
      branchStaffServiceMock.getPosBranchSummariesForUser.mockResolvedValue([
        {
          ...paidSummary,
          subscriptionEndsAt: new Date(Date.now() + 200 * DAY),
        },
      ]);

      await expect(
        service.startActivationPayment(
          { id: 41, roles: ['POS_MANAGER'] },
          { branchId: 21, ...proof },
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(paymentClaimsMock.submit).not.toHaveBeenCalled();
    });

    it('refuses a second payment while one is still waiting to be verified', async () => {
      branchStaffServiceMock.getPosBranchSummariesForUser.mockResolvedValue([
        { ...paidSummary, subscriptionEndsAt: new Date(Date.now() + 5 * DAY) },
      ]);
      paymentClaimsMock.assertProofAcceptable.mockRejectedValue(
        new ConflictException('already waiting'),
      );

      await expect(
        service.startActivationPayment(
          { id: 41, roles: ['POS_MANAGER'] },
          { branchId: 21, ...proof },
        ),
      ).rejects.toMatchObject({ status: 409 });
      expect(paymentClaimsMock.submit).not.toHaveBeenCalled();
    });

    it('adds an early renewal after the days already paid for, on a row of its own', async () => {
      const current = paidRow();
      tenantSubscriptionsRepository.findOne.mockResolvedValue(current);
      tenantSubscriptionsRepository.find.mockResolvedValue([current]);
      const reference = `POSACT-21-${Date.now()}-MONTHLY`;

      await service.completeActivationPayment(reference);

      const saved = tenantSubscriptionsRepository.save.mock.calls[0][0];
      expect(saved.id).toBeUndefined();
      expect(saved.startsAt.getTime()).toBe(current.endsAt.getTime());
      expect(saved.endsAt.getTime()).toBeGreaterThan(
        current.endsAt.getTime() + 27 * DAY,
      );
      expect(saved.metadata).toMatchObject({
        lastActivationReferenceId: reference,
        renewsSubscriptionId: 8,
        chainsFromPreviousEnd: true,
      });
      // The term it renews is left exactly as it was paid for.
      expect(current.metadata.lastActivationReferenceId).toBe(
        'POSACT-21-1700000000000-MONTHLY',
      );
    });

    it('emails the owner the receipt for the term the payment bought', async () => {
      const current = paidRow();
      tenantSubscriptionsRepository.findOne.mockResolvedValue(current);
      tenantSubscriptionsRepository.find.mockResolvedValue([current]);
      retailEntitlementsServiceMock.getBranchWorkspaceStatus.mockResolvedValue({
        tenant: { id: 31, name: 'Bole Retail', ownerUserId: 41 },
        branch: { serviceFormat: 'QSR', name: 'Bole Bites', ownerId: 41 },
        entitlements: [{ module: RetailModule.POS_CORE }],
      });
      usersRepositoryMock.findOne.mockResolvedValue({
        id: 41,
        email: 'owner@suuq.test',
      });
      const reference = `POSACT-21-${Date.now()}-MONTHLY`;
      paymentClaimsMock.findByReference.mockResolvedValue({
        id: 512,
        amount: 3900,
        currency: 'ETB',
        channel: 'CBE',
        payerReference: 'FT24123ABCD',
        createdAt: new Date(),
      });

      await service.completeActivationPayment(reference);
      await new Promise((resolve) => setImmediate(resolve));

      expect(
        emailServiceMock.sendSubscriptionReceiptEmail,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'owner@suuq.test',
          receiptNumber: 'RCT-M000512',
          html: expect.stringContaining('Payment receipt'),
        }),
      );
    });

    it('grants the term when the old one has run out but is still stored ACTIVE', async () => {
      // Ended days ago, past its grace, and never relabelled. A payment against
      // it used to be swallowed as a "duplicate"; it must buy a term from today.
      const lapsed = paidRow({ endsAt: new Date(Date.now() - 5 * DAY) });
      tenantSubscriptionsRepository.findOne.mockResolvedValue(lapsed);
      tenantSubscriptionsRepository.find.mockResolvedValue([lapsed]);

      await service.completeActivationPayment(
        `POSACT-21-${Date.now()}-ONE_YEAR`,
      );

      const saved = tenantSubscriptionsRepository.save.mock.calls[0][0];
      expect(saved.status).toBe(TenantSubscriptionStatus.ACTIVE);
      expect(saved.periodMonths).toBe(12);
      expect(saved.startsAt.getTime()).toBeGreaterThan(Date.now() - 60_000);
      // A year is a year, not twelve 30-day blocks.
      expect(saved.endsAt.getTime()).toBeGreaterThan(Date.now() + 364 * DAY);
    });

    it('counts a renewal paid in the grace days from the day the term ended', async () => {
      // Grace keeps the tills open; it is not free time.
      const endedAt = new Date(Date.now() - 3 * 3_600_000);
      const inGrace = paidRow({ endsAt: endedAt });
      tenantSubscriptionsRepository.findOne.mockResolvedValue(inGrace);
      tenantSubscriptionsRepository.find.mockResolvedValue([inGrace]);

      await service.completeActivationPayment(
        `POSACT-21-${Date.now()}-MONTHLY`,
      );

      const saved = tenantSubscriptionsRepository.save.mock.calls[0][0];
      expect(saved.startsAt.getTime()).toBe(endedAt.getTime());
      expect(saved.metadata.chainsFromPreviousEnd).toBe(true);
    });

    it('applies one payment once, however many times it is confirmed', async () => {
      const reference = `POSACT-21-${Date.now()}-MONTHLY`;
      const current = paidRow({
        metadata: {
          lastActivationReferenceId: reference,
          appliedActivationReferences: [reference],
        },
      });
      tenantSubscriptionsRepository.findOne.mockResolvedValue(current);
      tenantSubscriptionsRepository.find.mockResolvedValue([current]);

      await service.completeActivationPayment(reference);

      expect(tenantSubscriptionsRepository.save).not.toHaveBeenCalled();
    });

    it('ignores a replay of a payment older than the last one a legacy row recorded', async () => {
      const current = paidRow();
      tenantSubscriptionsRepository.findOne.mockResolvedValue(current);
      tenantSubscriptionsRepository.find.mockResolvedValue([current]);

      await service.completeActivationPayment(
        'POSACT-21-1600000000000-MONTHLY',
      );

      expect(tenantSubscriptionsRepository.save).not.toHaveBeenCalled();
    });
  });
  describe('a new branch paid for by transfer', () => {
    const pendingRow = (period: string) => ({
      id: 8,
      tenantId: 31,
      status: TenantSubscriptionStatus.ACTIVE,
      metadata: {
        pendingBranchCreation: {
          referenceId: 'POSBRANCH-31-9-1790000000000',
          branchName: 'Smart Retail',
          serviceFormat: 'RETAIL',
          period,
        },
      },
    });

    beforeEach(() => {
      (branchesRepository as any).findOne = jest.fn().mockResolvedValue(null);
      (branchesRepository as any).create = jest.fn((value) => value);
      (branchesRepository as any).save = jest.fn(async (value) => ({
        id: 88,
        ...value,
      }));
      (branchStaffAssignmentsRepository as any).create = jest.fn((v) => v);
      (branchStaffAssignmentsRepository as any).save = jest.fn(async (v) => v);
    });

    const createdTerm = () =>
      tenantSubscriptionsRepository.save.mock.calls
        .map(([row]) => row)
        .find((row) => row.branchId === 88);

    it('gives the new branch the term that was paid for, on a row of its own', async () => {
      tenantSubscriptionsRepository.findOne.mockResolvedValue(
        pendingRow('ONE_YEAR'),
      );

      const result = await service.completeBranchCreationPayment(
        'POSBRANCH-31-9-1790000000000',
      );

      expect(result).toEqual({ branchId: 88, created: true });
      const term = createdTerm();
      expect(term).toMatchObject({
        tenantId: 31,
        branchId: 88,
        planCode: 'POS_BRANCH_1Y',
        status: TenantSubscriptionStatus.ACTIVE,
        amountTotal: 42120,
        periodMonths: 12,
      });
      expect(term.endsAt.getTime()).toBeGreaterThan(
        Date.now() + 364 * 86_400_000,
      );
      expect(term.metadata.lastActivationReferenceId).toBe(
        'POSBRANCH-31-9-1790000000000',
      );
    });

    it('opens a new branch on the 14-day trial when that is what was paid', async () => {
      tenantSubscriptionsRepository.findOne.mockResolvedValue(
        pendingRow('STARTER'),
      );

      await service.completeBranchCreationPayment(
        'POSBRANCH-31-9-1790000000000',
      );

      const term = createdTerm();
      expect(term).toMatchObject({
        planCode: 'POS_BRANCH_STARTER_14D',
        amountTotal: 500,
        periodMonths: null,
      });
      expect(
        Math.round(
          (term.endsAt.getTime() - term.startsAt.getTime()) / 86_400_000,
        ),
      ).toBe(14);
    });
  });

  describe('the paid 14-day trial for a new branch', () => {
    const DAY = 86_400_000;
    const candidate = {
      branchId: 21,
      branchName: 'Bole Flagship',
      serviceFormat: 'RETAIL',
      role: 'MANAGER',
      isOwner: true,
      retailTenantId: 31,
      workspaceStatus: 'PAYMENT_REQUIRED',
      canStartActivation: true,
      canPayNow: true,
    };

    beforeEach(() => {
      branchStaffServiceMock.getPosWorkspaceActivationCandidatesForUser.mockResolvedValue(
        [candidate],
      );
      retailEntitlementsServiceMock.getBranchWorkspaceStatus.mockResolvedValue({
        tenant: { id: 31, name: 'Bole Retail' },
        branch: { id: 21, serviceFormat: 'RETAIL' },
        entitlements: [{ module: RetailModule.POS_CORE }],
        governance: {
          activationReadiness: { canActivate: true, blockers: [] },
        },
      });
      tenantModuleEntitlementsRepository.findOne.mockResolvedValue({
        module: RetailModule.POS_CORE,
        enabled: true,
      });
      tenantSubscriptionsRepository.findOne.mockResolvedValue(null);
    });

    it('asks a new branch for 500 ETB, not a month', async () => {
      const result = await service.startActivationPayment(
        { id: 9, roles: ['POS_MANAGER'] },
        { branchId: 21, subscriptionPeriod: 'STARTER', ...proof },
      );

      expect(paymentClaimsMock.submit).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: 'POS_BRANCH',
          period: 'STARTER',
          periodMonths: null,
          amount: 500,
        }),
      );
      expect(result.referenceId).toMatch(/^POSACT-21-\d+-STARTER$/);
    });

    it('refuses the trial to a branch that has subscribed before', async () => {
      tenantSubscriptionsRepository.find.mockResolvedValue([
        {
          branchId: 21,
          planCode: 'POS_BRANCH_1M',
          metadata: { lastActivationReferenceId: 'POSACT-21-1-MONTHLY' },
        },
      ]);

      await expect(
        service.startActivationPayment(
          { id: 9, roles: ['POS_MANAGER'] },
          { branchId: 21, subscriptionPeriod: 'STARTER', ...proof },
        ),
      ).rejects.toMatchObject({ status: 409 });
      expect(paymentClaimsMock.submit).not.toHaveBeenCalled();
    });

    it('refuses a second trial while another branch never followed its own with a subscription', async () => {
      tenantSubscriptionsRepository.find.mockResolvedValue([
        {
          branchId: 55,
          planCode: 'POS_BRANCH_STARTER_14D',
          metadata: { lastActivationReferenceId: 'POSACT-55-1-STARTER' },
        },
      ]);

      await expect(
        service.startActivationPayment(
          { id: 9, roles: ['POS_MANAGER'] },
          { branchId: 21, subscriptionPeriod: 'STARTER', ...proof },
        ),
      ).rejects.toMatchObject({ status: 409 });
    });

    it('opens the branch for 14 days on approval, shares nothing with a partner, and stays out of the run-rate', async () => {
      const equity = (service as any).equityPartnerService;

      await service.completeActivationPayment(
        `POSACT-21-${Date.now()}-STARTER`,
        'STARTER',
      );

      const saved = tenantSubscriptionsRepository.save.mock.calls[0][0];
      expect(saved).toMatchObject({
        planCode: 'POS_BRANCH_STARTER_14D',
        status: TenantSubscriptionStatus.ACTIVE,
        billingInterval: 'CUSTOM',
        amountTotal: 500,
        periodMonths: null,
        autoRenew: false,
      });
      const length = saved.endsAt.getTime() - saved.startsAt.getTime();
      expect(Math.round(length / DAY)).toBe(14);
      expect(equity.createMonthlyPayoutsForBranch).not.toHaveBeenCalled();
    });

    it('adds the first full term after the trial days when the owner subscribes during the trial', async () => {
      const trialEndsAt = new Date(Date.now() + 9 * DAY);
      const trialRow = {
        id: 8,
        tenantId: 31,
        branchId: 21,
        planCode: 'POS_BRANCH_STARTER_14D',
        status: TenantSubscriptionStatus.ACTIVE,
        startsAt: new Date(Date.now() - 5 * DAY),
        endsAt: trialEndsAt,
        metadata: {
          lastActivationReferenceId: 'POSACT-21-1790000000000-STARTER',
          appliedActivationReferences: ['POSACT-21-1790000000000-STARTER'],
        },
      };
      tenantSubscriptionsRepository.findOne.mockResolvedValue(trialRow);
      tenantSubscriptionsRepository.find.mockResolvedValue([trialRow]);

      await service.completeActivationPayment(
        `POSACT-21-${Date.now()}-MONTHLY`,
      );

      const saved = tenantSubscriptionsRepository.save.mock.calls[0][0];
      expect(saved.planCode).toBe('POS_BRANCH_1M');
      expect(saved.amountTotal).toBe(3900);
      // No trial day is lost by subscribing early.
      expect(saved.startsAt.getTime()).toBe(trialEndsAt.getTime());
    });
  });
});
