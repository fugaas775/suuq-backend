import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Branch } from '../branches/entities/branch.entity';
import { RetailEntitlementsService } from '../retail/retail-entitlements.service';
import { RetailModule } from '../retail/entities/tenant-module-entitlement.entity';
import { User } from '../users/entities/user.entity';
import { BranchStaffService } from './branch-staff.service';
import { PosPortalOnboardingService } from './pos-portal-onboarding.service';
import {
  BranchStaffAssignment,
  BranchStaffRole,
} from './entities/branch-staff-assignment.entity';

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
  };

  const branchStaffService = {
    getPosBranchSummariesForUser: jest.fn(),
    getPosWorkspaceActivationCandidatesForUser: jest.fn(),
    getPosWorkspacePricing: jest.fn(() => ({
      amount: 1900,
      currency: 'ETB',
      billingInterval: 'MONTHLY',
      paymentMethod: 'EBIRR',
    })),
  };

  beforeEach(async () => {
    delete process.env.POS_HOSPITALITY_SERVICE_FORMATS_ENABLED;
    jest.resetAllMocks();
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
        metadata: {
          allowedSelfServeServiceFormats: ['RETAIL'],
        },
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
          serviceFormat: 'QSR',
          categoryId: 14,
          defaultCurrency: 'ETB',
        },
      ),
    ).rejects.toThrow(
      'POS self-serve onboarding only supports RETAIL until hospitality rollout is enabled for this tenant.',
    );
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
        serviceFormat: 'FSR',
        categoryId: 14,
        defaultCurrency: 'ETB',
      },
    );

    expect(branchesRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Main Branch',
        serviceFormat: 'FSR',
      }),
    );
    expect(
      retailEntitlementsService.upsertModuleEntitlement,
    ).toHaveBeenCalledWith(
      31,
      RetailModule.POS_CORE,
      expect.objectContaining({
        enabled: true,
        metadata: {
          allowedSelfServeServiceFormats: ['RETAIL', 'QSR', 'FSR'],
        },
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
});
