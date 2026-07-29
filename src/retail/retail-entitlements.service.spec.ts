import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AuditService } from '../audit/audit.service';
import { BranchStaffAssignment } from '../branch-staff/entities/branch-staff-assignment.entity';
import { Branch } from '../branches/entities/branch.entity';
import {
  Category,
  PosUserFitCategory,
} from '../categories/entities/category.entity';
import { ReplenishmentPolicySubmissionMode } from './dto/upsert-tenant-module-entitlement.dto';
import { User } from '../users/entities/user.entity';
import { RetailEntitlementsService } from './retail-entitlements.service';
import {
  RetailTenant,
  RetailTenantStatus,
} from './entities/retail-tenant.entity';
import {
  RetailModule,
  TenantModuleEntitlement,
} from './entities/tenant-module-entitlement.entity';
import {
  TenantBillingInterval,
  TenantSubscription,
  TenantSubscriptionStatus,
} from './entities/tenant-subscription.entity';

describe('RetailEntitlementsService', () => {
  let service: RetailEntitlementsService;
  let retailTenantsRepository: any;
  let categoriesRepository: any;
  let tenantSubscriptionsRepository: any;
  let tenantModuleEntitlementsRepository: any;
  let branchStaffAssignmentsRepository: any;
  let branchesRepository: any;
  let usersRepository: any;
  let auditService: any;

  beforeEach(async () => {
    retailTenantsRepository = {
      create: jest.fn((value: any) => value),
      save: jest.fn(async (value: any) => value),
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn(),
    };
    categoriesRepository = {
      findOne: jest.fn(),
    };
    tenantSubscriptionsRepository = {
      create: jest.fn((value: any) => value),
      save: jest.fn(async (value: any) => ({ id: 71, ...value })),
      findOne: jest.fn(),
    };
    tenantModuleEntitlementsRepository = {
      create: jest.fn((value: any) => value),
      save: jest.fn(async (value: any) => ({ id: 91, ...value })),
      findOne: jest.fn(),
      find: jest.fn(),
    };
    branchStaffAssignmentsRepository = {
      find: jest.fn().mockResolvedValue([]),
    };
    branchesRepository = {
      findOne: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
      save: jest.fn(async (value: any) => value),
    };
    usersRepository = {
      findOne: jest.fn(),
    };
    auditService = {
      log: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RetailEntitlementsService,
        {
          provide: getRepositoryToken(RetailTenant),
          useValue: retailTenantsRepository,
        },
        {
          provide: getRepositoryToken(Category),
          useValue: categoriesRepository,
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
          provide: getRepositoryToken(BranchStaffAssignment),
          useValue: branchStaffAssignmentsRepository,
        },
        { provide: getRepositoryToken(Branch), useValue: branchesRepository },
        { provide: getRepositoryToken(User), useValue: usersRepository },
        { provide: AuditService, useValue: auditService },
      ],
    }).compile();

    service = module.get(RetailEntitlementsService);
  });

  it('creates a retail tenant after validating the owner user when provided', async () => {
    usersRepository.findOne.mockResolvedValue({ id: 17 });
    retailTenantsRepository.findOne.mockResolvedValue({
      id: 41,
      name: 'Retail HQ',
      status: RetailTenantStatus.ACTIVE,
      branches: [],
      subscriptions: [],
      entitlements: [],
    });

    const result = await service.createTenant({
      name: 'Retail HQ',
      ownerUserId: 17,
      defaultCurrency: 'USD',
    });

    expect(usersRepository.findOne).toHaveBeenCalledWith({ where: { id: 17 } });
    expect(retailTenantsRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Retail HQ', ownerUserId: 17 }),
    );
    expect(result.id).toBe(41);
  });

  it('assigns a branch to a retail tenant', async () => {
    branchesRepository.findOne
      .mockResolvedValueOnce({ id: 8, name: 'Branch 8' })
      .mockResolvedValueOnce({
        id: 8,
        retailTenantId: 5,
        retailTenant: { id: 5 },
      });
    retailTenantsRepository.findOne.mockResolvedValueOnce({ id: 5 });

    const result = await service.assignBranchToTenant(8, 5);

    expect(branchesRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: 8, retailTenantId: 5 }),
    );
    expect(result.retailTenantId).toBe(5);
  });

  it('updates the tenant onboarding profile', async () => {
    categoriesRepository.findOne.mockResolvedValue({
      id: 14,
      slug: 'cafeteria',
      name: 'Cafeteria',
      posSuggestedUserFit: 'FOOD_SERVICE_PRESET_FIT',
      parent: null,
    });
    retailTenantsRepository.findOne
      .mockResolvedValueOnce({
        id: 5,
        branches: [],
        subscriptions: [],
        entitlements: [],
        onboardingProfile: null,
      })
      .mockResolvedValueOnce({
        id: 5,
        branches: [],
        subscriptions: [],
        entitlements: [],
        onboardingProfile: {
          categoryId: 14,
          categorySlug: 'cafeteria',
          categoryName: 'Cafeteria',
          userFit: 'FOOD_SERVICE_PRESET_FIT',
          suggestedUserFit: 'FOOD_SERVICE_PRESET_FIT',
          notes: 'Counter-service rollout',
        },
      });

    const result = await service.updateOnboardingProfile(5, {
      categoryId: 14,
      userFit: PosUserFitCategory.FOOD_SERVICE_PRESET_FIT,
      notes: 'Counter-service rollout',
    });

    expect(retailTenantsRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 5,
        onboardingProfile: {
          categoryId: 14,
          categorySlug: 'cafeteria',
          categoryName: 'Cafeteria',
          userFit: 'FOOD_SERVICE_PRESET_FIT',
          suggestedUserFit: 'FOOD_SERVICE_PRESET_FIT',
          notes: 'Counter-service rollout',
        },
      }),
    );
    expect(result.onboardingProfile).toEqual({
      categoryId: 14,
      categorySlug: 'cafeteria',
      categoryName: 'Cafeteria',
      userFit: 'FOOD_SERVICE_PRESET_FIT',
      suggestedUserFit: 'FOOD_SERVICE_PRESET_FIT',
      notes: 'Counter-service rollout',
    });
  });

  it('upserts a tenant module entitlement', async () => {
    retailTenantsRepository.findOne.mockResolvedValue({
      id: 5,
      branches: [],
      subscriptions: [],
      entitlements: [],
    });
    tenantModuleEntitlementsRepository.findOne.mockResolvedValue(null);

    const result = await service.upsertModuleEntitlement(
      5,
      RetailModule.INVENTORY_AUTOMATION,
      {
        enabled: true,
        reason: 'Included in enterprise plan',
        metadata: {
          replenishmentPolicy: {
            submissionMode: ReplenishmentPolicySubmissionMode.AUTO_SUBMIT,
            preferredSupplierProfileId: 14,
            minimumOrderTotal: 150,
            orderWindow: {
              daysOfWeek: [1, 3, 5],
              startHour: 8,
              endHour: 17,
              timeZone: 'UTC',
            },
          },
        },
      },
    );

    expect(result.module).toBe(RetailModule.INVENTORY_AUTOMATION);
    expect(result.enabled).toBe(true);
    expect(result.metadata).toEqual(
      expect.objectContaining({
        replenishmentPolicy: expect.objectContaining({
          submissionMode: 'AUTO_SUBMIT',
          preferredSupplierProfileId: 14,
          minimumOrderTotal: 150,
          orderWindow: expect.objectContaining({
            daysOfWeek: [1, 3, 5],
            startHour: 8,
            endHour: 17,
            timeZone: 'UTC',
          }),
        }),
      }),
    );
  });

  it('rejects invalid replenishment policy payloads on entitlement upsert', async () => {
    retailTenantsRepository.findOne.mockResolvedValue({
      id: 5,
      branches: [],
      subscriptions: [],
      entitlements: [],
    });
    tenantModuleEntitlementsRepository.findOne.mockResolvedValue(null);

    await expect(
      service.upsertModuleEntitlement(5, RetailModule.INVENTORY_AUTOMATION, {
        enabled: true,
        metadata: {
          replenishmentPolicy: {
            submissionMode: ReplenishmentPolicySubmissionMode.AUTO_SUBMIT,
            minimumOrderTotal: 0,
          },
        },
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('upserts AI analytics entitlement metadata', async () => {
    retailTenantsRepository.findOne.mockResolvedValue({
      id: 5,
      branches: [],
      subscriptions: [],
      entitlements: [],
    });
    tenantModuleEntitlementsRepository.findOne.mockResolvedValue(null);

    const result = await service.upsertModuleEntitlement(
      5,
      RetailModule.AI_ANALYTICS,
      {
        enabled: true,
        metadata: {
          aiAnalyticsPolicy: {
            stalePurchaseOrderHours: 48,
            targetHealthScore: 90,
          },
        },
      },
    );

    expect(result.metadata).toEqual(
      expect.objectContaining({
        aiAnalyticsPolicy: {
          stalePurchaseOrderHours: 48,
          targetHealthScore: 90,
        },
      }),
    );
  });

  it('lists retail plan presets for the admin provisioning flow', () => {
    const result = service.listPlanPresets();

    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'POS_BRANCH_SUBSCRIPTION',
          modules: expect.arrayContaining([
            expect.objectContaining({
              module: RetailModule.AI_ANALYTICS,
            }),
            expect.objectContaining({
              module: RetailModule.ACCOUNTING,
            }),
          ]),
        }),
      ]),
    );
  });

  it.skip('reports a distinct TRIAL activation state — removed feature', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-04-03T00:00:00.000Z'));
    retailTenantsRepository.find.mockResolvedValue([
      {
        id: 5,
        name: 'Bole Retail',
        status: RetailTenantStatus.ACTIVE,
        billingEmail: 'billing@suuq.test',
        owner: { email: 'owner@suuq.test' },
        branches: [
          {
            id: 8,
            name: 'Bole Flagship',
            code: 'BL-01',
          },
        ],
        subscriptions: [
          {
            id: 71,
            tenantId: 5,
            planCode: 'POS_BRANCH',
            status: TenantSubscriptionStatus.TRIAL,
            billingInterval: TenantBillingInterval.MONTHLY,
            amount: 1900,
            currency: 'ETB',
            startsAt: new Date('2026-04-03T00:00:00.000Z'),
            endsAt: new Date('2026-04-18T00:00:00.000Z'),
            autoRenew: false,
            metadata: {
              lastActivationPaymentMethod: 'TRIAL',
            },
          },
        ],
        entitlements: [
          {
            id: 91,
            tenantId: 5,
            module: RetailModule.POS_CORE,
            enabled: true,
            startsAt: null,
            expiresAt: null,
            reason: 'Enabled during POS-S self-serve onboarding',
          },
        ],
      },
    ]);

    const result = await service.listTenants({
      activationStatus: 'TRIAL',
    });

    expect(result).toHaveLength(1);
    expect(result[0].posWorkspaceAudit).toMatchObject({
      provisioningSource: 'POS_SELF_SERVE',
      activationStatus: 'TRIAL',
      latestSubscriptionStatus: TenantSubscriptionStatus.TRIAL,
      branchWorkspaces: [
        expect.objectContaining({
          branchId: 8,
          workspaceStatus: 'TRIAL',
          trialStartedAt: '2026-04-03T00:00:00.000Z',
          trialEndsAt: '2026-04-18T00:00:00.000Z',
          trialDaysRemaining: 15,
        }),
      ],
    });

    jest.useRealTimers();
  });

  it('applies a retail plan preset by creating a subscription and bundled entitlements', async () => {
    retailTenantsRepository.findOne.mockResolvedValue({
      id: 5,
      status: RetailTenantStatus.ACTIVE,
      branches: [],
      subscriptions: [],
      entitlements: [],
    });
    tenantModuleEntitlementsRepository.findOne.mockResolvedValue(null);

    const result = await service.applyPlanPreset(5, {
      presetCode: 'POS_BRANCH_SUBSCRIPTION',
    });

    expect(result.preset.code).toBe('POS_BRANCH_SUBSCRIPTION');
    expect(result.subscription).toEqual(
      expect.objectContaining({
        tenantId: 5,
        planCode: 'POS_BRANCH_SUBSCRIPTION',
      }),
    );
    expect(result.entitlements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ module: RetailModule.POS_CORE }),
        expect.objectContaining({ module: RetailModule.INVENTORY_CORE }),
        expect.objectContaining({ module: RetailModule.INVENTORY_AUTOMATION }),
        expect.objectContaining({ module: RetailModule.AI_ANALYTICS }),
      ]),
    );
  });

  it('rejects unknown retail plan presets', async () => {
    retailTenantsRepository.findOne.mockResolvedValue({
      id: 5,
      status: RetailTenantStatus.ACTIVE,
      branches: [],
      subscriptions: [],
      entitlements: [],
    });

    await expect(
      service.applyPlanPreset(5, {
        presetCode: 'UNKNOWN_PRESET',
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('rejects invalid AI analytics entitlement metadata', async () => {
    retailTenantsRepository.findOne.mockResolvedValue({
      id: 5,
      branches: [],
      subscriptions: [],
      entitlements: [],
    });
    tenantModuleEntitlementsRepository.findOne.mockResolvedValue(null);

    await expect(
      service.upsertModuleEntitlement(5, RetailModule.AI_ANALYTICS, {
        enabled: true,
        metadata: {
          aiAnalyticsPolicy: {
            stalePurchaseOrderHours: 0,
          },
        },
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('allows branch access when subscription and entitlement are active', async () => {
    branchesRepository.findOne.mockResolvedValue({
      id: 8,
      retailTenantId: 5,
      retailTenant: { id: 5 },
    });
    retailTenantsRepository.findOne.mockResolvedValue({
      id: 5,
      status: RetailTenantStatus.ACTIVE,
      branches: [],
      subscriptions: [],
      entitlements: [],
    });
    tenantSubscriptionsRepository.findOne.mockResolvedValue({
      id: 71,
      tenantId: 5,
      status: TenantSubscriptionStatus.ACTIVE,
      billingInterval: TenantBillingInterval.MONTHLY,
    });
    tenantModuleEntitlementsRepository.find.mockResolvedValue([
      {
        tenantId: 5,
        module: RetailModule.POS_CORE,
        enabled: true,
      },
    ]);

    const result = await service.assertBranchHasModules(8, [
      RetailModule.POS_CORE,
    ]);

    expect(result.tenant.id).toBe(5);
    expect(result.branch.id).toBe(8);
  });

  it('blocks branch access when no active entitlement exists', async () => {
    branchesRepository.findOne.mockResolvedValue({
      id: 8,
      retailTenantId: 5,
      retailTenant: { id: 5 },
    });
    retailTenantsRepository.findOne.mockResolvedValue({
      id: 5,
      status: RetailTenantStatus.ACTIVE,
      branches: [],
      subscriptions: [],
      entitlements: [],
    });
    tenantSubscriptionsRepository.findOne.mockResolvedValue({
      id: 71,
      tenantId: 5,
      status: TenantSubscriptionStatus.ACTIVE,
      billingInterval: TenantBillingInterval.MONTHLY,
    });
    tenantModuleEntitlementsRepository.find.mockResolvedValue([]);

    await expect(
      service.assertBranchHasModules(8, [RetailModule.ACCOUNTING]),
    ).rejects.toThrow(ForbiddenException);
  });

  it('reports false when branch lacks an active entitlement', async () => {
    branchesRepository.findOne.mockResolvedValue({
      id: 8,
      retailTenantId: 5,
      retailTenant: { id: 5 },
    });
    retailTenantsRepository.findOne.mockResolvedValue({
      id: 5,
      status: RetailTenantStatus.ACTIVE,
      branches: [],
      subscriptions: [],
      entitlements: [],
    });
    tenantSubscriptionsRepository.findOne.mockResolvedValue({
      id: 71,
      tenantId: 5,
      status: TenantSubscriptionStatus.ACTIVE,
      billingInterval: TenantBillingInterval.MONTHLY,
    });
    tenantModuleEntitlementsRepository.find.mockResolvedValue([]);

    await expect(
      service.hasActiveBranchModules(8, [RetailModule.INVENTORY_AUTOMATION]),
    ).resolves.toBe(false);
  });

  it('returns the active entitlement metadata for a branch module', async () => {
    branchesRepository.findOne.mockResolvedValue({
      id: 8,
      retailTenantId: 5,
      retailTenant: { id: 5 },
    });
    retailTenantsRepository.findOne.mockResolvedValue({
      id: 5,
      status: RetailTenantStatus.ACTIVE,
      branches: [],
      subscriptions: [],
      entitlements: [],
    });
    tenantSubscriptionsRepository.findOne.mockResolvedValue({
      id: 71,
      tenantId: 5,
      status: TenantSubscriptionStatus.ACTIVE,
      billingInterval: TenantBillingInterval.MONTHLY,
    });
    tenantModuleEntitlementsRepository.find.mockResolvedValue([
      {
        tenantId: 5,
        module: RetailModule.POS_CORE,
        enabled: true,
      },
      {
        tenantId: 5,
        module: RetailModule.INVENTORY_AUTOMATION,
        enabled: true,
        metadata: {
          replenishmentPolicy: {
            submissionMode: 'AUTO_SUBMIT',
          },
        },
      },
    ]);

    await expect(
      service.getActiveBranchModuleEntitlement(
        8,
        RetailModule.INVENTORY_AUTOMATION,
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        module: RetailModule.INVENTORY_AUTOMATION,
        metadata: expect.objectContaining({
          replenishmentPolicy: expect.objectContaining({
            submissionMode: 'AUTO_SUBMIT',
          }),
        }),
      }),
    );
  });

  it('rejects tenant creation when the owner user does not exist', async () => {
    usersRepository.findOne.mockResolvedValue(null);

    await expect(
      service.createTenant({ name: 'Retail HQ', ownerUserId: 99 }),
    ).rejects.toThrow(NotFoundException);
  });
  describe('branch-scoped subscription resolution', () => {
    function stubTenantAndBranch(branchId: number) {
      branchesRepository.findOne.mockResolvedValue({
        id: branchId,
        retailTenantId: 5,
        retailTenant: { id: 5 },
      });
      retailTenantsRepository.findOne.mockResolvedValue({
        id: 5,
        status: RetailTenantStatus.ACTIVE,
        branches: [],
        subscriptions: [],
        entitlements: [],
      });
      tenantModuleEntitlementsRepository.find.mockResolvedValue([
        { tenantId: 5, module: RetailModule.POS_CORE, enabled: true },
      ]);
    }

    it("resolves each branch's own subscription on a multi-branch tenant", async () => {
      stubTenantAndBranch(8);
      // Branch 8 is trialing; branch 9's newer paid row must not govern it.
      tenantSubscriptionsRepository.findOne.mockImplementation(
        async ({ where }: any) =>
          where.branchId === 8
            ? {
                id: 71,
                tenantId: 5,
                branchId: 8,
                status: TenantSubscriptionStatus.TRIAL,
                planCode: 'POS_BRANCH_TRIAL_14D',
                endsAt: new Date(Date.now() + 5 * 86_400_000),
              }
            : null,
      );

      const result = await service.getBranchWorkspaceStatus(8);

      expect(result.subscription?.branchId).toBe(8);
      expect(result.workspaceStatus).toBe('ACTIVE'); // live trial opens the branch
      // The lookup is never issued without a branch scope.
      for (const call of tenantSubscriptionsRepository.findOne.mock.calls) {
        expect(call[0].where).toHaveProperty('branchId');
      }
    });

    it('falls back to a legacy tenant-wide row for a branch that has none', async () => {
      stubTenantAndBranch(8);
      const legacyRow = {
        id: 60,
        tenantId: 5,
        branchId: null,
        status: TenantSubscriptionStatus.ACTIVE,
        billingInterval: TenantBillingInterval.MONTHLY,
      };
      tenantSubscriptionsRepository.findOne.mockImplementation(
        async ({ where }: any) => (where.branchId === 8 ? null : legacyRow),
      );

      const result = await service.getBranchWorkspaceStatus(8);

      expect(result.subscription).toMatchObject({ id: 60 });
      expect(result.workspaceStatus).toBe('ACTIVE');
    });

    it('reports PAYMENT_REQUIRED rather than borrowing a sibling row', async () => {
      stubTenantAndBranch(8);
      // Only branch 9 has a row. Neither query matches, so branch 8 has none.
      tenantSubscriptionsRepository.findOne.mockResolvedValue(null);

      const result = await service.getBranchWorkspaceStatus(8);

      expect(result.subscription).toBeNull();
      expect(result.workspaceStatus).toBe('PAYMENT_REQUIRED');
    });
  });
  describe('admin trial visibility', () => {
    const TRIAL_PLAN = 'POS_BRANCH_TRIAL_14D';

    function buildTenant(
      subscriptions: any[],
      branches = [{ id: 8, name: 'Bole Bites', code: 'BB-8' }],
    ) {
      return {
        id: 5,
        name: 'Bole Retail',
        status: RetailTenantStatus.ACTIVE,
        branches,
        subscriptions,
        entitlements: [
          {
            module: RetailModule.POS_CORE,
            enabled: true,
            reason: 'Enabled during POS-S self-serve onboarding',
            metadata: { provisioningSource: 'POS_SELF_SERVE_AUTO_TRIAL' },
          },
        ],
      } as any;
    }

    it('reports a trialing tenant as TRIAL, not as a paying ACTIVATED one', async () => {
      const endsAt = new Date(Date.now() + 6 * 86_400_000);
      retailTenantsRepository.find.mockResolvedValue([
        buildTenant([
          {
            id: 71,
            tenantId: 5,
            branchId: 8,
            planCode: TRIAL_PLAN,
            status: TenantSubscriptionStatus.TRIAL,
            startsAt: new Date(),
            endsAt,
          },
        ]),
      ]);

      const [tenant] = await service.listTenants({});

      expect(tenant.posWorkspaceAudit).toMatchObject({
        activationStatus: 'TRIAL',
        provisioningSource: 'POS_SELF_SERVE_AUTO_TRIAL',
        trialEndsAt: endsAt,
      });
      expect(tenant.posWorkspaceAudit.nextBillingStep).toMatch(
        /Free trial ends/,
      );
      expect(tenant.posWorkspaceAudit.branchWorkspaces[0]).toMatchObject({
        isTrialWorkspace: true,
        isTrialExpired: false,
      });
    });

    it('is excluded by an ACTIVATED filter and matched by a TRIAL one', async () => {
      retailTenantsRepository.find.mockResolvedValue([
        buildTenant([
          {
            id: 71,
            tenantId: 5,
            branchId: 8,
            planCode: TRIAL_PLAN,
            status: TenantSubscriptionStatus.TRIAL,
            startsAt: new Date(),
            endsAt: new Date(Date.now() + 6 * 86_400_000),
          },
        ]),
      ]);

      expect(
        await service.listTenants({ activationStatus: 'ACTIVATED' }),
      ).toHaveLength(0);
      expect(
        await service.listTenants({ activationStatus: 'TRIAL' }),
      ).toHaveLength(1);
    });

    it('reports a lapsed trial as TRIAL_EXPIRED, matching the sign-in gate', async () => {
      retailTenantsRepository.find.mockResolvedValue([
        buildTenant([
          {
            id: 71,
            tenantId: 5,
            branchId: 8,
            planCode: TRIAL_PLAN,
            // Post-sweep the row is EXPIRED; pre-sweep it is still TRIAL. Both
            // must read the same here, or admin and the gate disagree.
            status: TenantSubscriptionStatus.EXPIRED,
            startsAt: new Date(Date.now() - 20 * 86_400_000),
            endsAt: new Date(Date.now() - 6 * 86_400_000),
          },
        ]),
      ]);

      const [tenant] = await service.listTenants({});

      expect(tenant.posWorkspaceAudit.activationStatus).toBe('TRIAL_EXPIRED');
      expect(tenant.posWorkspaceAudit.branchWorkspaces[0].isTrialExpired).toBe(
        true,
      );
      expect(tenant.posWorkspaceAudit.trialEndsAt).toBeNull();
    });

    it('describes each branch by its own subscription on a mixed tenant', async () => {
      retailTenantsRepository.find.mockResolvedValue([
        buildTenant(
          [
            {
              id: 71,
              tenantId: 5,
              branchId: 8,
              planCode: TRIAL_PLAN,
              status: TenantSubscriptionStatus.TRIAL,
              startsAt: new Date(Date.now() - 86_400_000),
              endsAt: new Date(Date.now() + 6 * 86_400_000),
            },
            {
              id: 72,
              tenantId: 5,
              branchId: 9,
              planCode: 'POS_BRANCH_1M',
              status: TenantSubscriptionStatus.ACTIVE,
              startsAt: new Date(),
              endsAt: new Date(Date.now() + 25 * 86_400_000),
            },
          ],
          [
            { id: 8, name: 'Bole Bites', code: 'BB-8' },
            { id: 9, name: 'Piassa Bites', code: 'PB-9' },
          ],
        ),
      ]);

      const [tenant] = await service.listTenants({});
      const [trialBranch, paidBranch] =
        tenant.posWorkspaceAudit.branchWorkspaces;

      expect(trialBranch).toMatchObject({
        branchId: 8,
        isTrialWorkspace: true,
      });
      expect(paidBranch).toMatchObject({
        branchId: 9,
        isTrialWorkspace: false,
        planCode: 'POS_BRANCH_1M',
      });
    });
  });
});
