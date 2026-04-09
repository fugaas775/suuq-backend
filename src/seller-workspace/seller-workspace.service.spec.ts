import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BranchStaffService } from '../branch-staff/branch-staff.service';
import {
  Order,
  PaymentMethod,
  PaymentStatus,
  OrderStatus,
} from '../orders/entities/order.entity';
import { Product } from '../products/entities/product.entity';
import {
  PosCheckout,
  PosCheckoutStatus,
  PosCheckoutTransactionType,
} from '../pos-sync/entities/pos-checkout.entity';
import {
  PosRegisterSession,
  PosRegisterSessionStatus,
} from '../pos-sync/entities/pos-register-session.entity';
import {
  PosSyncJob,
  PosSyncStatus,
  PosSyncType,
} from '../pos-sync/entities/pos-sync-job.entity';
import {
  PurchaseOrder,
  PurchaseOrderStatus,
} from '../purchase-orders/entities/purchase-order.entity';
import { RetailTenant } from '../retail/entities/retail-tenant.entity';
import {
  TenantBillingInterval,
  TenantSubscription,
  TenantSubscriptionStatus,
} from '../retail/entities/tenant-subscription.entity';
import { User, SubscriptionTier } from '../users/entities/user.entity';
import { VendorStaffService } from '../vendor/vendor-staff.service';
import { SellerWorkspaceBillingStatus } from './entities/seller-workspace.entity';
import { SellerPlanCode } from './dto/seller-workspace-response.dto';
import { SellerWorkspaceService } from './seller-workspace.service';
import { SellerWorkspace } from './entities/seller-workspace.entity';

describe('SellerWorkspaceService', () => {
  let service: SellerWorkspaceService;
  let usersRepository: { findOne: jest.Mock };
  let ordersRepository: { createQueryBuilder: jest.Mock };
  let purchaseOrdersRepository: { find: jest.Mock };
  let posCheckoutsRepository: { createQueryBuilder: jest.Mock };
  let posSyncJobsRepository: { createQueryBuilder: jest.Mock };
  let retailTenantsRepository: { find: jest.Mock };
  let tenantSubscriptionsRepository: { find: jest.Mock };
  let productsRepository: { createQueryBuilder: jest.Mock };
  let posRegisterSessionsRepository: { count: jest.Mock };
  let sellerWorkspacesRepository: {
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let vendorStaffService: { getStoreSummariesForUser: jest.Mock };
  let branchStaffService: {
    getPosBranchSummariesForUser: jest.Mock;
    getPosWorkspaceActivationCandidatesForUser: jest.Mock;
    getPosWorkspacePricing: jest.Mock;
  };

  beforeEach(async () => {
    usersRepository = { findOne: jest.fn() };
    ordersRepository = { createQueryBuilder: jest.fn() };
    purchaseOrdersRepository = { find: jest.fn() };
    posCheckoutsRepository = { createQueryBuilder: jest.fn() };
    posSyncJobsRepository = { createQueryBuilder: jest.fn() };
    retailTenantsRepository = { find: jest.fn() };
    tenantSubscriptionsRepository = { find: jest.fn() };
    productsRepository = { createQueryBuilder: jest.fn() };
    posRegisterSessionsRepository = { count: jest.fn() };
    sellerWorkspacesRepository = {
      findOne: jest.fn(),
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => ({
        id: value.id ?? 901,
        createdAt: value.createdAt ?? new Date('2026-03-01T00:00:00.000Z'),
        updatedAt: new Date('2026-03-05T00:00:00.000Z'),
        ...value,
      })),
    };
    vendorStaffService = { getStoreSummariesForUser: jest.fn() };
    branchStaffService = {
      getPosBranchSummariesForUser: jest.fn(),
      getPosWorkspaceActivationCandidatesForUser: jest.fn(),
      getPosWorkspacePricing: jest.fn(() => ({
        amount: 1900,
        currency: 'ETB',
        billingInterval: TenantBillingInterval.MONTHLY,
        paymentMethod: 'EBIRR',
      })),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SellerWorkspaceService,
        { provide: getRepositoryToken(User), useValue: usersRepository },
        { provide: getRepositoryToken(Order), useValue: ordersRepository },
        {
          provide: getRepositoryToken(PurchaseOrder),
          useValue: purchaseOrdersRepository,
        },
        {
          provide: getRepositoryToken(PosCheckout),
          useValue: posCheckoutsRepository,
        },
        {
          provide: getRepositoryToken(PosSyncJob),
          useValue: posSyncJobsRepository,
        },
        {
          provide: getRepositoryToken(RetailTenant),
          useValue: retailTenantsRepository,
        },
        {
          provide: getRepositoryToken(TenantSubscription),
          useValue: tenantSubscriptionsRepository,
        },
        { provide: getRepositoryToken(Product), useValue: productsRepository },
        {
          provide: getRepositoryToken(PosRegisterSession),
          useValue: posRegisterSessionsRepository,
        },
        {
          provide: getRepositoryToken(SellerWorkspace),
          useValue: sellerWorkspacesRepository,
        },
        { provide: VendorStaffService, useValue: vendorStaffService },
        { provide: BranchStaffService, useValue: branchStaffService },
      ],
    }).compile();

    service = module.get(SellerWorkspaceService);
  });

  it('aggregates seller workspace profile and recommends the growth plan', async () => {
    sellerWorkspacesRepository.findOne.mockResolvedValue({
      id: 901,
      ownerUserId: 41,
      primaryVendorId: 41,
      primaryRetailTenantId: 13,
      selectedPlanCode: 'GROWTH',
      billingStatus: SellerWorkspaceBillingStatus.ACTIVE,
      status: 'ACTIVE',
      onboardingState: null,
      channelState: null,
      metadata: null,
      planSelectedAt: new Date('2026-03-01T00:00:00.000Z'),
      createdAt: new Date('2026-03-01T00:00:00.000Z'),
      updatedAt: new Date('2026-03-02T00:00:00.000Z'),
    });
    usersRepository.findOne.mockResolvedValue({
      id: 41,
      email: 'seller@suuq.test',
      roles: ['VENDOR', 'POS_MANAGER'],
      displayName: 'Seller User',
      avatarUrl: null,
      storeName: 'Seller Store',
      subscriptionTier: SubscriptionTier.PRO,
    } as User);
    vendorStaffService.getStoreSummariesForUser.mockResolvedValue([
      {
        vendorId: 41,
        storeName: 'Seller Store',
        permissions: ['MANAGE_PRODUCTS'],
        title: 'Owner',
        joinedAt: new Date('2026-03-01T00:00:00.000Z'),
      },
    ]);
    branchStaffService.getPosBranchSummariesForUser.mockResolvedValue([
      {
        branchId: 7,
        branchName: 'HQ',
        branchCode: 'HQ-7',
        role: 'MANAGER',
        permissions: ['OPEN_REGISTER'],
        isOwner: true,
        retailTenantId: 13,
        retailTenantName: 'Seller Tenant',
        modules: ['POS_CORE'],
        joinedAt: new Date('2026-03-01T00:00:00.000Z'),
      },
      {
        branchId: 8,
        branchName: 'Airport',
        branchCode: 'AIR-8',
        role: 'MANAGER',
        permissions: ['OPEN_REGISTER'],
        isOwner: true,
        retailTenantId: 13,
        retailTenantName: 'Seller Tenant',
        modules: ['POS_CORE'],
        joinedAt: new Date('2026-03-02T00:00:00.000Z'),
      },
    ]);
    ordersRepository.createQueryBuilder.mockReturnValue({
      distinct: jest.fn().mockReturnThis(),
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([
        {
          id: 501,
          total: 150000,
          paymentMethod: PaymentMethod.COD,
          paymentStatus: PaymentStatus.PAID,
          status: OrderStatus.DELIVERED,
          items: [],
        },
        {
          id: 502,
          total: 120000,
          paymentMethod: PaymentMethod.COD,
          paymentStatus: PaymentStatus.PAID,
          status: OrderStatus.DELIVERED,
          items: [],
        },
      ]),
    });
    purchaseOrdersRepository.find.mockResolvedValue([
      {
        id: 61,
        branchId: 7,
        status: PurchaseOrderStatus.SUBMITTED,
        createdAt: new Date(),
        items: [],
      },
      {
        id: 62,
        branchId: 8,
        status: PurchaseOrderStatus.RECEIVED,
        createdAt: new Date(),
        items: [],
      },
    ] as PurchaseOrder[]);
    posCheckoutsRepository.createQueryBuilder.mockReturnValue({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([
        {
          id: 71,
          status: PosCheckoutStatus.PROCESSED,
          transactionType: PosCheckoutTransactionType.SALE,
        },
        {
          id: 72,
          status: PosCheckoutStatus.FAILED,
          transactionType: PosCheckoutTransactionType.SALE,
        },
      ] as PosCheckout[]),
    });
    posSyncJobsRepository.createQueryBuilder.mockReturnValue({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([
        {
          id: 81,
          status: PosSyncStatus.PROCESSED,
          syncType: PosSyncType.SALES_SUMMARY,
        },
        {
          id: 82,
          status: PosSyncStatus.FAILED,
          syncType: PosSyncType.STOCK_DELTA,
        },
      ] as PosSyncJob[]),
    });
    tenantSubscriptionsRepository.find.mockResolvedValue([
      {
        tenantId: 13,
        planCode: 'GROWTH',
        status: TenantSubscriptionStatus.ACTIVE,
        billingInterval: TenantBillingInterval.MONTHLY,
        amount: 99,
        currency: 'USD',
        startsAt: new Date('2026-03-01T00:00:00.000Z'),
        endsAt: null,
        autoRenew: true,
        metadata: null,
      },
    ] as TenantSubscription[]);
    retailTenantsRepository.find.mockResolvedValue([
      {
        id: 13,
        name: 'Seller Tenant',
        onboardingProfile: {
          categoryId: 14,
          categorySlug: 'cafeteria',
          categoryName: 'Cafeteria',
          userFit: 'FOOD_SERVICE_PRESET_FIT',
          suggestedUserFit: 'FOOD_SERVICE_PRESET_FIT',
          notes: 'Counter-service rollout',
        },
      },
    ]);
    productsRepository.createQueryBuilder.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue({ count: '12' }),
    });
    posRegisterSessionsRepository.count.mockResolvedValue(3);

    const result = await service.getProfile(41, 24);

    expect(result.currentPlanCode).toBe(SellerPlanCode.GROWTH);
    expect(result.recommendedPlanCode).toBe(SellerPlanCode.GROWTH);
    expect(result.workspace.selectedPlanCode).toBe(SellerPlanCode.GROWTH);
    expect(result.subscriptions).toHaveLength(1);
    expect(result.primaryRetailContext?.onboardingProfile?.categoryName).toBe(
      'Cafeteria',
    );
    expect(
      result.primaryRetailContext?.onboardingProfile?.suggestedUserFit,
    ).toBe('FOOD_SERVICE_PRESET_FIT');
    expect(result.onboarding.every((step) => step.completed)).toBe(true);
    expect(
      result.channels.find((channel) => channel.key === 'POS_S')?.connected,
    ).toBe(true);
  });

  it('bootstraps persisted seller workspace state from accessible store and tenant links', async () => {
    sellerWorkspacesRepository.findOne.mockResolvedValue(null);
    usersRepository.findOne.mockResolvedValue({
      id: 41,
      email: 'seller@suuq.test',
      roles: ['VENDOR', 'POS_MANAGER'],
      subscriptionTier: SubscriptionTier.FREE,
    } as User);
    vendorStaffService.getStoreSummariesForUser.mockResolvedValue([
      {
        vendorId: 41,
        storeName: 'Seller Store',
        permissions: ['MANAGE_PRODUCTS'],
        title: 'Owner',
        joinedAt: new Date('2026-03-01T00:00:00.000Z'),
      },
    ]);
    branchStaffService.getPosBranchSummariesForUser.mockResolvedValue([
      {
        branchId: 7,
        branchName: 'HQ',
        branchCode: 'HQ-7',
        role: 'MANAGER',
        permissions: ['OPEN_REGISTER'],
        isOwner: true,
        retailTenantId: 13,
        retailTenantName: 'Seller Tenant',
        modules: ['POS_CORE'],
        joinedAt: new Date('2026-03-01T00:00:00.000Z'),
      },
    ]);
    tenantSubscriptionsRepository.find.mockResolvedValue([]);

    const result = await service.bootstrapWorkspace(41, {
      selectedPlanCode: SellerPlanCode.STARTER,
      metadata: { source: 'spec' },
    });

    expect(result.ownerUserId).toBe(41);
    expect(result.primaryVendorId).toBe(41);
    expect(result.primaryRetailTenantId).toBe(13);
    expect(result.selectedPlanCode).toBe(SellerPlanCode.STARTER);
    expect(result.billingStatus).toBe(
      SellerWorkspaceBillingStatus.PLAN_SELECTED,
    );
    expect(sellerWorkspacesRepository.save).toHaveBeenCalled();
  });

  it('updates onboarding and channel state on the persisted workspace', async () => {
    const persistedWorkspace = {
      id: 901,
      ownerUserId: 41,
      primaryVendorId: 41,
      primaryRetailTenantId: 13,
      selectedPlanCode: 'STARTER',
      billingStatus: SellerWorkspaceBillingStatus.PLAN_SELECTED,
      status: 'ACTIVE',
      onboardingState: null,
      channelState: null,
      metadata: null,
      planSelectedAt: new Date('2026-03-01T00:00:00.000Z'),
      createdAt: new Date('2026-03-01T00:00:00.000Z'),
      updatedAt: new Date('2026-03-02T00:00:00.000Z'),
    };
    sellerWorkspacesRepository.findOne.mockResolvedValue(persistedWorkspace);
    usersRepository.findOne.mockResolvedValue({
      id: 41,
      email: 'seller@suuq.test',
      roles: ['VENDOR', 'POS_MANAGER'],
      subscriptionTier: SubscriptionTier.FREE,
    } as User);
    vendorStaffService.getStoreSummariesForUser.mockResolvedValue([
      {
        vendorId: 41,
        storeName: 'Seller Store',
        permissions: ['MANAGE_PRODUCTS'],
        title: 'Owner',
        joinedAt: new Date('2026-03-01T00:00:00.000Z'),
      },
    ]);
    branchStaffService.getPosBranchSummariesForUser.mockResolvedValue([
      {
        branchId: 7,
        branchName: 'HQ',
        branchCode: 'HQ-7',
        role: 'MANAGER',
        permissions: ['OPEN_REGISTER'],
        isOwner: true,
        retailTenantId: 13,
        retailTenantName: 'Seller Tenant',
        modules: ['POS_CORE'],
        joinedAt: new Date('2026-03-01T00:00:00.000Z'),
      },
    ]);
    tenantSubscriptionsRepository.find.mockResolvedValue([]);

    const onboarding = await service.updateOnboardingStep(41, {
      stepKey: 'catalog',
      completed: true,
      detail: 'Imported initial products',
    });
    const channel = await service.updateChannelState(41, 'suuq_s', {
      connected: true,
      requested: true,
      detail: 'Consumer app linked',
    });

    expect(onboarding.onboardingState?.catalog?.completed).toBe(true);
    expect(onboarding.onboardingState?.catalog?.detail).toBe(
      'Imported initial products',
    );
    expect(channel.channelState?.SUUQ_S?.connected).toBe(true);
    expect(channel.channelState?.SUUQ_S?.requested).toBe(true);
  });

  it('rejects users without seller store or POS workspace access', async () => {
    usersRepository.findOne.mockResolvedValue({
      id: 88,
      email: 'no-access@suuq.test',
      roles: ['CUSTOMER'],
      subscriptionTier: SubscriptionTier.FREE,
    } as User);
    sellerWorkspacesRepository.findOne.mockResolvedValue(null);
    vendorStaffService.getStoreSummariesForUser.mockResolvedValue([]);
    branchStaffService.getPosBranchSummariesForUser.mockResolvedValue([]);

    await expect(service.getOverview(88, 24)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('returns active and activation-required branch workspaces for seller HQ', async () => {
    usersRepository.findOne.mockResolvedValue({
      id: 41,
      email: 'seller@suuq.test',
      roles: ['VENDOR', 'POS_MANAGER'],
      subscriptionTier: SubscriptionTier.PRO,
    } as User);
    branchStaffService.getPosBranchSummariesForUser.mockResolvedValue([
      {
        branchId: 7,
        branchName: 'HQ',
        branchCode: 'HQ-7',
        role: 'MANAGER',
        permissions: ['OPEN_REGISTER'],
        isOwner: true,
        retailTenantId: 13,
        retailTenantName: 'Seller Tenant',
        modules: ['POS_CORE'],
        workspaceStatus: 'ACTIVE',
        subscriptionStatus: TenantSubscriptionStatus.ACTIVE,
        planCode: 'POS_BRANCH',
        canStartTrial: false,
        canStartActivation: false,
        canOpenNow: true,
        trialStartedAt: null,
        trialEndsAt: null,
        trialDaysRemaining: null,
        joinedAt: new Date('2026-03-01T00:00:00.000Z'),
      },
    ]);
    branchStaffService.getPosWorkspaceActivationCandidatesForUser.mockResolvedValue(
      [
        {
          branchId: 8,
          branchName: 'Airport',
          branchCode: 'AIR-8',
          role: 'MANAGER',
          isOwner: true,
          retailTenantId: 14,
          retailTenantName: 'Airport Tenant',
          workspaceStatus: 'PAYMENT_REQUIRED',
          subscriptionStatus: null,
          planCode: null,
          canStartTrial: true,
          canStartActivation: true,
          canOpenNow: false,
          trialStartedAt: null,
          trialEndsAt: null,
          trialDaysRemaining: null,
          pricing: {
            amount: 1900,
            currency: 'ETB',
            billingInterval: TenantBillingInterval.MONTHLY,
            paymentMethod: 'EBIRR',
          },
        },
      ],
    );
    tenantSubscriptionsRepository.find.mockResolvedValue([
      {
        tenantId: 13,
        planCode: 'POS_BRANCH',
        status: TenantSubscriptionStatus.ACTIVE,
        billingInterval: TenantBillingInterval.MONTHLY,
        amount: 1900,
        currency: 'ETB',
        startsAt: new Date('2026-03-01T00:00:00.000Z'),
        endsAt: null,
        autoRenew: true,
      },
    ]);

    const result = await service.getBranchWorkspaces(41);

    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toMatchObject({
      branchId: 7,
      workspaceStatus: 'ACTIVE',
      canOpenNow: true,
    });
    expect(result.items[1]).toMatchObject({
      branchId: 8,
      workspaceStatus: 'PAYMENT_REQUIRED',
      canStartTrial: true,
      canStartActivation: true,
      pricing: expect.objectContaining({
        amount: 1900,
        paymentMethod: 'EBIRR',
      }),
    });
  });
});
