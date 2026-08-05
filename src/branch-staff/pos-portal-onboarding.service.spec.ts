import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Branch } from '../branches/entities/branch.entity';
import { RetailEntitlementsService } from '../retail/retail-entitlements.service';
import { EquityPartnerService } from '../retail/equity-partner.service';
import { RetailModule } from '../retail/entities/tenant-module-entitlement.entity';
import { User } from '../users/entities/user.entity';
import { SellerWorkspace } from '../seller-workspace/entities/seller-workspace.entity';
import { BranchStaffService } from './branch-staff.service';
import { PosPortalOnboardingService } from './pos-portal-onboarding.service';
import {
  BranchStaffAssignment,
  BranchStaffRole,
} from './entities/branch-staff-assignment.entity';
import { SelfServePosWorkspaceServiceFormat } from './dto/create-pos-workspace.dto';

describe('PosPortalOnboardingService', () => {
  let service: PosPortalOnboardingService;

  const branchesRepository = {
    create: jest.fn((value) => value),
    save: jest.fn(async (value) => ({ id: 21, code: 'BL-21', ...value })),
  };

  const assignmentsRepository = {
    create: jest.fn((value) => value),
    save: jest.fn(async (value) => value),
  };

  const retailEntitlementsService = {
    createTenant: jest.fn(async (value) => ({ id: 31, ...value })),
    updateOnboardingProfile: jest.fn(async (tenantId, dto) => ({
      id: tenantId,
      onboardingProfile: {
        categoryId: dto.categoryId ?? null,
        categorySlug: 'cafeteria',
        categoryName: 'Cafeteria',
        userFit: dto.userFit ?? null,
        suggestedUserFit: 'FOOD_SERVICE_PRESET_FIT',
        notes: null,
      },
    })),
    upsertModuleEntitlement: jest.fn(async () => undefined),
    startPosSelfServeTrial: jest.fn(async () => ({ id: 71 })),
  };

  const equityPartnerService = {
    findActivePartnerByReferralCode: jest.fn(async () => null),
    recordReferralFromActivation: jest.fn(async () => null),
  };

  const branchStaffService = {
    getPosBranchSummariesForUser: jest.fn(),
    getPosWorkspaceActivationCandidatesForUser: jest.fn(),
    getPosWorkspacePricing: jest.fn(() => ({
      amount: 1900,
      currency: 'ETB',
      billingInterval: 'MONTHLY',
      paymentMethod: 'EBIRR',
      subscriptionOptions: [
        {
          period: 'SIX_MONTHS',
          months: 6,
          amount: 11400,
          currency: 'ETB',
          label: '6 months',
          planCode: 'POS_BRANCH_6M',
        },
        {
          period: 'ONE_YEAR',
          months: 12,
          amount: 22800,
          currency: 'ETB',
          label: '1 year',
          planCode: 'POS_BRANCH_1Y',
        },
      ],
    })),
  };

  beforeEach(async () => {
    delete process.env.POS_HOSPITALITY_SERVICE_FORMATS_ENABLED;
    delete process.env.POS_FIRST_BRANCH_TRIAL_ENABLED;
    jest.resetAllMocks();
    equityPartnerService.findActivePartnerByReferralCode.mockResolvedValue(
      null,
    );
    equityPartnerService.recordReferralFromActivation.mockResolvedValue(null);
    branchesRepository.create.mockImplementation((value) => value);
    branchesRepository.save.mockImplementation(async (value) => ({
      id: 21,
      code: 'BL-21',
      ...value,
    }));
    assignmentsRepository.create.mockImplementation((value) => value);
    assignmentsRepository.save.mockImplementation(async (value) => value);
    retailEntitlementsService.createTenant.mockImplementation(
      async (value) => ({ id: 31, ...value }),
    );
    retailEntitlementsService.updateOnboardingProfile.mockImplementation(
      async (tenantId, dto) => ({
        id: tenantId,
        onboardingProfile: {
          categoryId: dto.categoryId ?? null,
          categorySlug: 'cafeteria',
          categoryName: 'Cafeteria',
          userFit: dto.userFit ?? null,
          suggestedUserFit: 'FOOD_SERVICE_PRESET_FIT',
          notes: null,
        },
      }),
    );
    retailEntitlementsService.upsertModuleEntitlement.mockResolvedValue(
      undefined,
    );
    retailEntitlementsService.startPosSelfServeTrial.mockResolvedValue({
      id: 71,
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PosPortalOnboardingService,
        { provide: getRepositoryToken(Branch), useValue: branchesRepository },
        {
          provide: getRepositoryToken(BranchStaffAssignment),
          useValue: assignmentsRepository,
        },
        {
          provide: RetailEntitlementsService,
          useValue: retailEntitlementsService,
        },
        { provide: BranchStaffService, useValue: branchStaffService },
        { provide: EquityPartnerService, useValue: equityPartnerService },
        { provide: getRepositoryToken(User), useValue: { update: jest.fn() } },
        {
          provide: getRepositoryToken(SellerWorkspace),
          useValue: { create: jest.fn(), findOne: jest.fn(), save: jest.fn() },
        },
      ],
    }).compile();

    service = module.get(PosPortalOnboardingService);
  });

  it('defaults the first self-serve workspace to retail', async () => {
    branchStaffService.getPosBranchSummariesForUser.mockResolvedValue([]);
    branchStaffService.getPosWorkspaceActivationCandidatesForUser
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          branchId: 21,
          branchName: 'Main Branch',
          branchCode: 'BL-21',
          workspaceStatus: 'PAYMENT_REQUIRED',
        },
      ]);

    const result = await service.createWorkspaceForUser(
      { id: 9, email: 'seller@suuq.test', roles: ['VENDOR'] } as User,
      {
        businessName: 'Bole Bites',
        branchName: 'Main Branch',
        categoryId: 14,
        defaultCurrency: 'ETB',
      },
    );

    expect(branchesRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Main Branch',
        serviceFormat: 'RETAIL',
        retailTenantId: 31,
      }),
    );
    expect(assignmentsRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        branchId: 21,
        userId: 9,
        role: BranchStaffRole.MANAGER,
      }),
    );
    expect(
      retailEntitlementsService.upsertModuleEntitlement,
    ).toHaveBeenCalledWith(
      31,
      RetailModule.POS_CORE,
      expect.objectContaining({
        enabled: true,
        // No pinned allow-list: the tenant tracks the live rollout defaults.
        metadata: { provisioningSource: 'POS_SELF_SERVE_AUTO_TRIAL' },
      }),
    );
    expect(
      retailEntitlementsService.updateOnboardingProfile,
    ).toHaveBeenCalledWith(
      31,
      expect.objectContaining({ categoryId: 14 }),
      expect.objectContaining({ id: 9, email: 'seller@suuq.test' }),
    );
    expect(result.workspace).toMatchObject({
      branchId: 21,
      branchName: 'Main Branch',
    });
    expect(result.onboardingProfile).toMatchObject({
      categoryId: 14,
      categorySlug: 'cafeteria',
      categoryName: 'Cafeteria',
    });
  });

  it('rejects hospitality-first onboarding until rollout is enabled', async () => {
    const oldVal = process.env.POS_HOSPITALITY_SERVICE_FORMATS_ENABLED;
    process.env.POS_HOSPITALITY_SERVICE_FORMATS_ENABLED = 'false';
    branchStaffService.getPosBranchSummariesForUser.mockResolvedValue([]);
    branchStaffService.getPosWorkspaceActivationCandidatesForUser.mockResolvedValue(
      [],
    );

    await expect(
      service.createWorkspaceForUser(
        { id: 9, email: 'seller@suuq.test', roles: ['VENDOR'] } as User,
        {
          businessName: 'Bole Bites',
          branchName: 'Main Branch',
          serviceFormat: SelfServePosWorkspaceServiceFormat.HOTEL,
          categoryId: 14,
          defaultCurrency: 'ETB',
        },
      ),
    ).rejects.toThrow(
      'POS self-serve onboarding only supports RETAIL until hospitality rollout is enabled for this tenant.',
    );
    process.env.POS_HOSPITALITY_SERVICE_FORMATS_ENABLED = oldVal;
  });

  it('allows hospitality-first onboarding when rollout is enabled', async () => {
    process.env.POS_HOSPITALITY_SERVICE_FORMATS_ENABLED = 'true';
    branchStaffService.getPosBranchSummariesForUser.mockResolvedValue([]);
    branchStaffService.getPosWorkspaceActivationCandidatesForUser
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          branchId: 21,
          branchName: 'Main Branch',
          branchCode: 'BL-21',
          workspaceStatus: 'PAYMENT_REQUIRED',
        },
      ]);

    await service.createWorkspaceForUser(
      { id: 9, email: 'seller@suuq.test', roles: ['VENDOR'] } as User,
      {
        businessName: 'Bole Bites',
        branchName: 'Main Branch',
        serviceFormat: SelfServePosWorkspaceServiceFormat.HOTEL,
        categoryId: 14,
        defaultCurrency: 'ETB',
      },
    );

    expect(branchesRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Main Branch',
        serviceFormat: 'HOTEL',
      }),
    );
    expect(
      retailEntitlementsService.upsertModuleEntitlement,
    ).toHaveBeenCalledWith(
      31,
      RetailModule.POS_CORE,
      expect.objectContaining({
        enabled: true,
        // No pinned allow-list: the tenant tracks the live rollout defaults.
        metadata: { provisioningSource: 'POS_SELF_SERVE_AUTO_TRIAL' },
      }),
    );
  });

  it('does not require a primary retail category before creating the first workspace', async () => {
    branchStaffService.getPosBranchSummariesForUser.mockResolvedValue([]);
    branchStaffService.getPosWorkspaceActivationCandidatesForUser
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          branchId: 21,
          branchName: 'Main Branch',
          branchCode: 'BL-21',
          workspaceStatus: 'PAYMENT_REQUIRED',
        },
      ]);

    const result = await service.createWorkspaceForUser(
      { id: 9, email: 'seller@suuq.test', roles: ['VENDOR'] } as User,
      {
        businessName: 'Bole Bites',
        branchName: 'Main Branch',
        defaultCurrency: 'ETB',
      },
    );

    expect(
      retailEntitlementsService.updateOnboardingProfile,
    ).not.toHaveBeenCalled();
    expect(result.onboardingProfile).toBeNull();
    expect(result.workspace).toMatchObject({
      branchId: 21,
      branchName: 'Main Branch',
    });
  });

  describe('the free trial on a first branch', () => {
    const OWNER = {
      id: 9,
      email: 'seller@suuq.test',
      roles: ['VENDOR'],
    } as unknown as User;

    function expectFirstBranch() {
      // The guard reads both lists; only the second call sees the new branch.
      branchStaffService.getPosBranchSummariesForUser
        .mockResolvedValueOnce([])
        .mockResolvedValue([
          {
            branchId: 21,
            branchName: 'Bole Bites',
            branchCode: 'BL-21',
            workspaceStatus: 'ACTIVE',
          },
        ]);
      branchStaffService.getPosWorkspaceActivationCandidatesForUser.mockResolvedValue(
        [],
      );
    }

    it('opens the workspace free for six months instead of demanding payment', async () => {
      process.env.POS_FIRST_BRANCH_TRIAL_ENABLED = '1';
      expectFirstBranch();
      retailEntitlementsService.startPosSelfServeTrial.mockResolvedValue({
        id: 71,
        planCode: 'POS_BRANCH_TRIAL_6M',
        endsAt: new Date('2027-02-05T09:00:00.000Z'),
      });

      const result = await service.createWorkspaceForUser(OWNER, {
        businessName: 'Bole Bites',
      });

      expect(
        retailEntitlementsService.startPosSelfServeTrial,
      ).toHaveBeenCalledWith(31, 21);
      expect(result.onboardingState).toBe('BRANCH_WORKSPACE_TRIAL_ACTIVE');
      expect(result.trial).toMatchObject({
        planCode: 'POS_BRANCH_TRIAL_6M',
        months: 6,
        endsAt: '2027-02-05T09:00:00.000Z',
      });
    });

    it('reports the workspace ACTIVE, not PAYMENT_REQUIRED', async () => {
      // The trap: a branch on a live trial is not an "activation candidate"
      // (that query only returns branches that still owe money), so reading the
      // status from that list reports PAYMENT_REQUIRED for a workspace that is
      // already open — and the client would send the owner off to pay.
      process.env.POS_FIRST_BRANCH_TRIAL_ENABLED = '1';
      expectFirstBranch();

      const result = await service.createWorkspaceForUser(OWNER, {
        businessName: 'Bole Bites',
      });

      expect(result.activationCandidates).toEqual([]);
      expect(result.workspace.workspaceStatus).toBe('ACTIVE');
    });

    it('still asks for payment while the flag is off', async () => {
      branchStaffService.getPosBranchSummariesForUser.mockResolvedValue([]);
      branchStaffService.getPosWorkspaceActivationCandidatesForUser
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          { branchId: 21, workspaceStatus: 'PAYMENT_REQUIRED' },
        ]);

      const result = await service.createWorkspaceForUser(OWNER, {
        businessName: 'Bole Bites',
      });

      expect(
        retailEntitlementsService.startPosSelfServeTrial,
      ).not.toHaveBeenCalled();
      expect(result.onboardingState).toBe(
        'BRANCH_WORKSPACE_ACTIVATION_REQUIRED',
      );
      expect(result.trial).toBeNull();
      expect(result.workspace.workspaceStatus).toBe('PAYMENT_REQUIRED');
    });

    it('names the branch after the business when only one name is given', async () => {
      process.env.POS_FIRST_BRANCH_TRIAL_ENABLED = '1';
      expectFirstBranch();

      await service.createWorkspaceForUser(OWNER, {
        businessName: 'Bole Bites',
      });

      expect(branchesRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Bole Bites' }),
      );
    });

    it('records the format choice as the business-type confirmation', async () => {
      // The owner was asked on the way in and answered — Seller HQ must not
      // open by asking the same question again.
      process.env.POS_FIRST_BRANCH_TRIAL_ENABLED = '1';
      expectFirstBranch();

      await service.createWorkspaceForUser(OWNER, {
        businessName: 'Bole Bites',
        serviceFormat: SelfServePosWorkspaceServiceFormat.RETAIL,
      });

      const created = branchesRepository.create.mock.calls[0][0];
      expect(created.serviceFormat).toBe('RETAIL');
      expect(created.homeConfig.firstRun.businessTypeConfirmedAt).toBeTruthy();
      // No widgets key — this branch has never chosen a Home layout.
      expect(created.homeConfig.widgets).toBeUndefined();
    });

    it('keeps the referring partner on record for the conversion six months out', async () => {
      process.env.POS_FIRST_BRANCH_TRIAL_ENABLED = '1';
      expectFirstBranch();
      equityPartnerService.findActivePartnerByReferralCode.mockResolvedValue({
        id: 4,
      });

      await service.createWorkspaceForUser(OWNER, {
        businessName: 'Bole Bites',
        referralCode: 'PART-9X2A',
      });
      await new Promise((resolve) => setImmediate(resolve));

      expect(
        equityPartnerService.findActivePartnerByReferralCode,
      ).toHaveBeenCalledWith('PART-9X2A');
      expect(
        equityPartnerService.recordReferralFromActivation,
      ).toHaveBeenCalledWith(4, 21, 31);
    });

    it('does not lose the workspace over a bad referral code', async () => {
      process.env.POS_FIRST_BRANCH_TRIAL_ENABLED = '1';
      expectFirstBranch();
      equityPartnerService.findActivePartnerByReferralCode.mockRejectedValue(
        new Error('partner lookup down'),
      );

      const result = await service.createWorkspaceForUser(OWNER, {
        businessName: 'Bole Bites',
        referralCode: 'PART-DEAD',
      });
      await new Promise((resolve) => setImmediate(resolve));

      expect(result.workspace.branchId).toBe(21);
    });
  });

  describe('createTrialWorkspaceForNewUser', () => {
    it('provisions a QSR branch on a free trial so a new signup can open POS immediately', async () => {
      branchStaffService.getPosBranchSummariesForUser.mockResolvedValue([]);
      branchStaffService.getPosWorkspaceActivationCandidatesForUser.mockResolvedValue(
        [],
      );

      const user = {
        id: 9,
        email: 'newowner@gmail.com',
        roles: ['VENDOR'],
        displayName: 'Abdi',
      } as unknown as User;

      const result = await service.createTrialWorkspaceForNewUser(user);

      expect(result).toEqual({ tenantId: 31, branchId: 21 });
      expect(branchesRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Abdi',
          serviceFormat: 'QSR',
          ownerId: 9,
          retailTenantId: 31,
        }),
      );
      expect(assignmentsRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          branchId: 21,
          userId: 9,
          role: BranchStaffRole.MANAGER,
        }),
      );
      // Without the trial the workspace resolves to PAYMENT_REQUIRED and the
      // branch drops straight back out of the session.
      expect(
        retailEntitlementsService.startPosSelfServeTrial,
      ).toHaveBeenCalledWith(31, 21);
      // The caller resolves branch access from this user object immediately.
      expect(user.roles).toContain('POS_MANAGER');
    });

    it('names the workspace from the email when the account has no display name', async () => {
      branchStaffService.getPosBranchSummariesForUser.mockResolvedValue([]);
      branchStaffService.getPosWorkspaceActivationCandidatesForUser.mockResolvedValue(
        [],
      );

      await service.createTrialWorkspaceForNewUser({
        id: 9,
        email: 'bolebites@gmail.com',
        roles: [],
      } as unknown as User);

      expect(branchesRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'bolebites' }),
      );
    });

    // The branch is QSR because the provisioner must pick something, not because
    // we know the business sells food. Naming it "<X>'s Kitchen" told every
    // non-food owner they were in the wrong workspace — keep the name neutral.
    it('does not bake the provisional QSR format into the workspace name', async () => {
      branchStaffService.getPosBranchSummariesForUser.mockResolvedValue([]);
      branchStaffService.getPosWorkspaceActivationCandidatesForUser.mockResolvedValue(
        [],
      );

      await service.createTrialWorkspaceForNewUser({
        id: 9,
        email: 'asalprinting401@gmail.com',
        roles: [],
        displayName: 'Asal Printing',
      } as unknown as User);

      const calls = branchesRepository.save.mock.calls;
      const [savedBranch] = calls[calls.length - 1] as [{ name: string }];
      expect(savedBranch.name).toBe('Asal Printing');
      expect(savedBranch.name).not.toMatch(/kitchen|QSR/i);
    });

    it('refuses to provision over an existing branch', async () => {
      branchStaffService.getPosBranchSummariesForUser.mockResolvedValue([
        { branchId: 4 },
      ]);
      branchStaffService.getPosWorkspaceActivationCandidatesForUser.mockResolvedValue(
        [],
      );

      await expect(
        service.createTrialWorkspaceForNewUser({
          id: 9,
          email: 'owner@gmail.com',
          roles: [],
        } as unknown as User),
      ).resolves.toBeNull();
      expect(retailEntitlementsService.createTenant).not.toHaveBeenCalled();
    });

    it('refuses to provision while an activation is already pending', async () => {
      branchStaffService.getPosBranchSummariesForUser.mockResolvedValue([]);
      branchStaffService.getPosWorkspaceActivationCandidatesForUser.mockResolvedValue(
        [{ branchId: 7 }],
      );

      await expect(
        service.createTrialWorkspaceForNewUser({
          id: 9,
          email: 'owner@gmail.com',
          roles: [],
        } as unknown as User),
      ).resolves.toBeNull();
      expect(retailEntitlementsService.createTenant).not.toHaveBeenCalled();
    });
  });
});
