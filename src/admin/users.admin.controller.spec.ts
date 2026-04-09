import { Test, TestingModule } from '@nestjs/testing';
import { plainToInstance } from 'class-transformer';
import { SubscriptionAnalyticsService } from '../metrics/subscription-analytics.service';
import { BranchStaffRole } from '../branch-staff/entities/branch-staff-assignment.entity';
import { BranchStaffService } from '../branch-staff/branch-staff.service';
import { SellerWorkspaceService } from '../seller-workspace/seller-workspace.service';
import { UsersService } from '../users/users.service';
import { AdminUsersController } from './users.admin.controller';

describe('AdminUsersController', () => {
  let controller: AdminUsersController;
  let usersService: {
    findActiveProUsers: jest.Mock;
    findAllSubscriptionRequests: jest.Mock;
    extendSubscription: jest.Mock;
    findAll: jest.Mock;
  };
  let branchStaffService: {
    getAdminPosAccessForUser: jest.Mock;
  };
  let sellerWorkspaceService: {
    getOverview: jest.Mock;
  };

  beforeEach(async () => {
    usersService = {
      findActiveProUsers: jest
        .fn()
        .mockResolvedValue({ data: [], total: 0, page: 1, pages: 0 }),
      findAllSubscriptionRequests: jest
        .fn()
        .mockResolvedValue({ data: [], total: 0, page: 1, pages: 0 }),
      extendSubscription: jest.fn(),
      findAll: jest.fn().mockResolvedValue({
        users: [
          {
            id: 7,
            email: 'vendor@suuq.test',
            displayName: 'Vendor',
            phoneNumber: '+251911000111',
            roles: ['VENDOR'],
          },
          {
            id: 8,
            email: 'pos@suuq.test',
            displayName: 'POS Operator',
            phoneNumber: '+251911000222',
            roles: ['POS_OPERATOR'],
          },
        ],
        total: 2,
        page: 2,
        pageSize: 50,
      }),
    };
    branchStaffService = {
      getAdminPosAccessForUser: jest.fn().mockResolvedValue({
        branchAssignments: [
          {
            branchId: 8,
            branchName: 'Airport',
            branchCode: 'BR-8',
            role: BranchStaffRole.OPERATOR,
            permissions: ['OPEN_REGISTER'],
            isOwner: false,
            retailTenantId: 21,
            retailTenantName: 'Airport Retail',
            modules: ['POS_CORE'],
            joinedAt: new Date('2026-01-03T00:00:00.000Z'),
          },
        ],
        workspaceActivationCandidates: [],
      }),
    };
    sellerWorkspaceService = {
      getOverview: jest.fn().mockResolvedValue({
        workspace: {
          billingStatus: 'ACTIVE',
          status: 'ACTIVE',
        },
        windowHours: 24,
        storeCount: 1,
        branchCount: 1,
        orderCount: 12,
        grossSales: 5400,
        purchaseOrderCount: 3,
        openPurchaseOrderCount: 1,
        checkoutCount: 5,
        failedCheckoutCount: 0,
        syncJobCount: 9,
        failedSyncJobCount: 1,
        catalogProductCount: 18,
        registerSessionCount: 2,
        currentPlanCode: 'GROWTH',
        recommendedPlanCode: 'GROWTH',
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminUsersController],
      providers: [
        { provide: UsersService, useValue: usersService },
        { provide: BranchStaffService, useValue: branchStaffService },
        { provide: SellerWorkspaceService, useValue: sellerWorkspaceService },
        {
          provide: SubscriptionAnalyticsService,
          useValue: { getAnalytics: jest.fn() },
        },
      ],
    }).compile();

    controller = module.get(AdminUsersController);
  });

  it('forwards validated active subscription pagination', async () => {
    await controller.getActiveSubscriptions({ page: 2, limit: 25 });

    expect(usersService.findActiveProUsers).toHaveBeenCalledWith(2, 25);
  });

  it('forwards validated subscription request filters', async () => {
    await controller.listSubscriptionRequests({
      page: 3,
      limit: 15,
      status: 'APPROVED' as any,
    });

    expect(usersService.findAllSubscriptionRequests).toHaveBeenCalledWith(
      3,
      15,
      'APPROVED',
    );
  });

  it('returns user list metadata only when validated meta=1 is supplied', async () => {
    const result = await controller.list(
      plainToInstance(Object, {
        page: 2,
        limit: 50,
        meta: '1',
        q: 'vendor',
      }) as any,
    );

    expect(usersService.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        page: 2,
        limit: 50,
        pageSize: 50,
        q: 'vendor',
        meta: '1',
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        data: [
          expect.objectContaining({
            id: 7,
            sellerWorkspaceSummary: expect.objectContaining({
              currentPlanCode: 'GROWTH',
              billingStatus: 'ACTIVE',
            }),
          }),
          expect.objectContaining({
            id: 8,
            posBranchAssignments: [expect.objectContaining({ branchId: 8 })],
            sellerWorkspaceSummary: expect.objectContaining({
              branchCount: 1,
              currentPlanCode: 'GROWTH',
            }),
          }),
        ],
        meta: { total: 2, page: 2, pageSize: 50 },
      }),
    );
    expect(branchStaffService.getAdminPosAccessForUser).toHaveBeenCalledTimes(
      1,
    );
    expect(branchStaffService.getAdminPosAccessForUser).toHaveBeenCalledWith(8);
    expect(sellerWorkspaceService.getOverview).toHaveBeenCalledTimes(2);
    expect(sellerWorkspaceService.getOverview).toHaveBeenNthCalledWith(1, 7);
    expect(sellerWorkspaceService.getOverview).toHaveBeenNthCalledWith(2, 8);
  });
});
