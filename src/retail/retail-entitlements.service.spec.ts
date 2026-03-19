import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Branch } from '../branches/entities/branch.entity';
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
  let tenantSubscriptionsRepository: any;
  let tenantModuleEntitlementsRepository: any;
  let branchesRepository: any;
  let usersRepository: any;

  beforeEach(async () => {
    retailTenantsRepository = {
      create: jest.fn((value: any) => value),
      save: jest.fn(async (value: any) => value),
      find: jest.fn().mockResolvedValue([]),
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
    branchesRepository = {
      findOne: jest.fn(),
      save: jest.fn(async (value: any) => value),
    };
    usersRepository = {
      findOne: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RetailEntitlementsService,
        {
          provide: getRepositoryToken(RetailTenant),
          useValue: retailTenantsRepository,
        },
        {
          provide: getRepositoryToken(TenantSubscription),
          useValue: tenantSubscriptionsRepository,
        },
        {
          provide: getRepositoryToken(TenantModuleEntitlement),
          useValue: tenantModuleEntitlementsRepository,
        },
        { provide: getRepositoryToken(Branch), useValue: branchesRepository },
        { provide: getRepositoryToken(User), useValue: usersRepository },
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
            submissionMode: 'AUTO_SUBMIT',
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
            submissionMode: 'AUTO_SUBMIT',
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

  it('upserts HR attendance entitlement metadata', async () => {
    retailTenantsRepository.findOne.mockResolvedValue({
      id: 5,
      branches: [],
      subscriptions: [],
      entitlements: [],
    });
    tenantModuleEntitlementsRepository.findOne.mockResolvedValue(null);

    const result = await service.upsertModuleEntitlement(
      5,
      RetailModule.HR_ATTENDANCE,
      {
        enabled: true,
        metadata: {
          hrAttendancePolicy: {
            shiftStartHour: 8,
            shiftEndHour: 17,
            gracePeriodMinutes: 15,
            overtimeThresholdHours: 9,
            timeZone: 'Africa/Addis_Ababa',
          },
        },
      },
    );

    expect(result.metadata).toEqual(
      expect.objectContaining({
        hrAttendancePolicy: {
          shiftStartHour: 8,
          shiftEndHour: 17,
          gracePeriodMinutes: 15,
          overtimeThresholdHours: 9,
          timeZone: 'Africa/Addis_Ababa',
        },
      }),
    );
  });

  it('rejects invalid HR attendance policy payloads on entitlement upsert', async () => {
    retailTenantsRepository.findOne.mockResolvedValue({
      id: 5,
      branches: [],
      subscriptions: [],
      entitlements: [],
    });
    tenantModuleEntitlementsRepository.findOne.mockResolvedValue(null);

    await expect(
      service.upsertModuleEntitlement(5, RetailModule.HR_ATTENDANCE, {
        enabled: true,
        metadata: {
          hrAttendancePolicy: {
            gracePeriodMinutes: 181,
          },
        },
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('lists retail plan presets for the admin provisioning flow', () => {
    const result = service.listPlanPresets();

    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'RETAIL_INTELLIGENCE',
          modules: expect.arrayContaining([
            expect.objectContaining({
              module: RetailModule.AI_ANALYTICS,
            }),
          ]),
        }),
        expect.objectContaining({
          code: 'RETAIL_ENTERPRISE',
          modules: expect.arrayContaining([
            expect.objectContaining({
              module: RetailModule.ACCOUNTING,
            }),
          ]),
        }),
      ]),
    );
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
      presetCode: 'RETAIL_INTELLIGENCE',
    });

    expect(result.preset.code).toBe('RETAIL_INTELLIGENCE');
    expect(result.subscription).toEqual(
      expect.objectContaining({
        tenantId: 5,
        planCode: 'RETAIL_INTELLIGENCE',
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
});
