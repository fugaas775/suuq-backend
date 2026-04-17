import { Test, TestingModule } from '@nestjs/testing';
import { AdminController } from './admin.controller';
import { UsersService } from '../users/users.service';
import { OrdersService } from '../orders/orders.service';
import { CurrencyService } from '../common/services/currency.service';
import { ProductsService } from '../products/products.service';
import { DelivererService } from '../deliverer/deliverer.service';
import { BranchStaffService } from '../branch-staff/branch-staff.service';
import { BranchStaffRole } from '../branch-staff/entities/branch-staff-assignment.entity';
import { AuditService } from '../audit/audit.service';
import { SellerWorkspaceService } from '../seller-workspace/seller-workspace.service';

describe('AdminController', () => {
  let controller: AdminController;
  let usersService: {
    findById: jest.Mock;
    normalizeVerificationDocuments: jest.Mock;
  };
  let productsService: { countByVendor: jest.Mock };
  let branchStaffService: {
    getAdminPosAccessForUser: jest.Mock;
    assign: jest.Mock;
    unassign: jest.Mock;
  };
  let auditService: {
    log: jest.Mock;
    listForTargetPaged: jest.Mock;
    listForTargetCursor: jest.Mock;
  };
  let sellerWorkspaceService: {
    getProfile: jest.Mock;
    getOverview: jest.Mock;
  };

  beforeEach(async () => {
    usersService = {
      findById: jest.fn().mockResolvedValue({
        id: 41,
        email: 'cashier@suuq.test',
        roles: ['POS_OPERATOR'],
        isActive: true,
        verificationStatus: 'APPROVED',
        verificationMethod: 'MANUAL',
        verificationDocuments: [],
        verified: true,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-02T00:00:00.000Z'),
      }),
      normalizeVerificationDocuments: jest.fn().mockReturnValue([]),
    };
    productsService = {
      countByVendor: jest.fn().mockResolvedValue(0),
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
      assign: jest.fn().mockResolvedValue({
        id: 91,
        branchId: 8,
        userId: 41,
        role: BranchStaffRole.OPERATOR,
        permissions: ['OPEN_REGISTER'],
        isActive: true,
        createdAt: new Date('2026-01-03T00:00:00.000Z'),
        updatedAt: new Date('2026-01-03T00:00:00.000Z'),
      }),
      unassign: jest.fn().mockResolvedValue({
        id: 91,
        branchId: 8,
        userId: 41,
        role: BranchStaffRole.OPERATOR,
        permissions: ['OPEN_REGISTER'],
        isActive: false,
        createdAt: new Date('2026-01-03T00:00:00.000Z'),
        updatedAt: new Date('2026-01-04T00:00:00.000Z'),
      }),
    };
    auditService = {
      log: jest.fn().mockResolvedValue({ id: 501 }),
      listForTargetPaged: jest.fn().mockResolvedValue({
        items: [
          {
            id: 501,
            action: 'user.pos.assignment.create',
            reason: null,
            actorId: 9,
            actorEmail: 'admin@suuq.test',
            meta: { branchId: 8, role: BranchStaffRole.OPERATOR },
            createdAt: new Date('2026-01-04T00:00:00.000Z'),
          },
        ],
        total: 1,
        page: 1,
        perPage: 20,
        totalPages: 1,
      }),
      listForTargetCursor: jest.fn(),
    };
    sellerWorkspaceService = {
      getProfile: jest.fn().mockResolvedValue({
        workspace: {
          id: 7,
          ownerUserId: 41,
          primaryVendorId: 41,
          primaryRetailTenantId: 21,
          selectedPlanCode: 'GROWTH',
          billingStatus: 'ACTIVE',
          status: 'ACTIVE',
        },
        user: {
          id: 41,
          email: 'cashier@suuq.test',
          roles: ['POS_OPERATOR'],
          displayName: 'Airport Seller',
          avatarUrl: null,
          storeName: 'Airport Retail',
        },
        stores: [
          {
            vendorId: 41,
            storeName: 'Airport Retail',
            permissions: ['MANAGE_PRODUCTS'],
            title: 'Owner',
            joinedAt: new Date('2026-01-01T00:00:00.000Z'),
          },
        ],
        branches: [
          {
            branchId: 8,
            branchName: 'Airport',
            branchCode: 'BR-8',
            role: 'OPERATOR',
            permissions: ['OPEN_REGISTER'],
            isOwner: false,
            retailTenantId: 21,
            retailTenantName: 'Airport Retail',
            modules: ['POS_CORE'],
            joinedAt: new Date('2026-01-03T00:00:00.000Z'),
          },
        ],
        subscriptions: [
          {
            tenantId: 21,
            tenantName: 'Airport Retail',
            status: 'ACTIVE',
            planCode: 'POS_GROWTH',
            billingInterval: 'MONTHLY',
            amount: 1900,
            currency: 'ETB',
            startsAt: new Date('2026-01-01T00:00:00.000Z'),
            endsAt: null,
            autoRenew: true,
          },
        ],
        currentPlanCode: 'GROWTH',
        recommendedPlanCode: 'GROWTH',
        channels: [
          {
            key: 'vendor',
            label: 'Vendor',
            connected: true,
            detail: 'Store connected',
          },
          {
            key: 'pos',
            label: 'POS',
            connected: true,
            detail: 'Branch connected',
          },
        ],
        onboarding: [
          {
            key: 'identity',
            label: 'Identity',
            completed: true,
            detail: 'Business identity complete',
          },
        ],
      }),
      getOverview: jest.fn().mockResolvedValue({
        workspace: {
          id: 7,
          ownerUserId: 41,
          primaryVendorId: 41,
          primaryRetailTenantId: 21,
          selectedPlanCode: 'GROWTH',
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
        channels: [
          {
            key: 'vendor',
            label: 'Vendor',
            connected: true,
            detail: 'Store connected',
          },
          {
            key: 'pos',
            label: 'POS',
            connected: true,
            detail: 'Branch connected',
          },
        ],
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminController],
      providers: [
        { provide: UsersService, useValue: usersService },
        { provide: OrdersService, useValue: {} },
        { provide: CurrencyService, useValue: {} },
        { provide: ProductsService, useValue: productsService },
        { provide: DelivererService, useValue: {} },
        { provide: BranchStaffService, useValue: branchStaffService },
        { provide: AuditService, useValue: auditService },
        { provide: SellerWorkspaceService, useValue: sellerWorkspaceService },
      ],
    }).compile();

    controller = module.get(AdminController);
  });

  it('enriches admin user detail with authoritative POS assignment context', async () => {
    const result = await controller.getUser(41);

    expect(branchStaffService.getAdminPosAccessForUser).toHaveBeenCalledWith(
      41,
    );
    expect(result).toEqual(
      expect.objectContaining({
        id: 41,
        sellerWorkspaceSummary: expect.objectContaining({
          currentPlanCode: 'GROWTH',
          billingStatus: 'ACTIVE',
        }),
        posBranchAssignments: [
          expect.objectContaining({
            branchId: 8,
            retailTenantId: 21,
          }),
        ],
        posWorkspaceActivationCandidates: [],
      }),
    );
  });

  it('assigns a POS user to a branch through the admin route', async () => {
    const result = await controller.assignUserPosBranch(
      41,
      {
        branchId: 8,
        role: BranchStaffRole.OPERATOR,
        permissions: ['OPEN_REGISTER'],
      },
      { user: { id: 9, email: 'admin@suuq.test' } },
    );

    expect(branchStaffService.assign).toHaveBeenCalledWith(
      8,
      {
        userId: 41,
        role: BranchStaffRole.OPERATOR,
        permissions: ['OPEN_REGISTER'],
      },
      {
        id: 9,
        email: 'admin@suuq.test',
      },
    );
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'user.pos.assignment.create',
        targetType: 'user',
        targetId: 41,
        actorId: 9,
        meta: expect.objectContaining({
          branchId: 8,
          branchName: 'Airport',
          retailTenantId: 21,
          retailTenantName: 'Airport Retail',
        }),
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        assignment: expect.objectContaining({
          branchId: 8,
          userId: 41,
        }),
        branchAssignments: [expect.objectContaining({ branchId: 8 })],
      }),
    );
  });

  it('removes a POS user branch assignment through the admin route', async () => {
    const result = await controller.unassignUserPosBranch(41, 8, {
      user: { id: 9, email: 'admin@suuq.test' },
    });

    expect(branchStaffService.unassign).toHaveBeenCalledWith(8, 41, {
      id: 9,
      email: 'admin@suuq.test',
    });
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'user.pos.assignment.remove',
        targetType: 'user',
        targetId: 41,
        actorId: 9,
        meta: expect.objectContaining({
          branchId: 8,
          branchName: 'Airport',
          retailTenantId: 21,
          retailTenantName: 'Airport Retail',
        }),
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        assignment: expect.objectContaining({
          branchId: 8,
          userId: 41,
          isActive: false,
        }),
        branchAssignments: [expect.objectContaining({ branchId: 8 })],
      }),
    );
  });

  it('returns user audit entries with POS access action labels', async () => {
    const result = await controller.getUserAudit(41, { page: 1, limit: 20 });

    expect(auditService.listForTargetPaged).toHaveBeenCalledWith('user', 41, {
      page: 1,
      limit: 20,
      filters: {
        actions: undefined,
        actorEmail: undefined,
        actorId: undefined,
        from: undefined,
        to: undefined,
      },
    });
    expect(result).toEqual(
      expect.objectContaining({
        items: [
          expect.objectContaining({
            action: 'user.pos.assignment.create',
            actionLabel: 'Assigned POS branch access',
          }),
        ],
      }),
    );
  });

  it('returns shared seller workspace profile for admin inspection', async () => {
    const result = await controller.getUserSellerWorkspace(41, {
      windowHours: 72,
    });

    expect(sellerWorkspaceService.getProfile).toHaveBeenCalledWith(41, 72);
    expect(result).toEqual(
      expect.objectContaining({
        currentPlanCode: 'GROWTH',
        stores: [expect.objectContaining({ vendorId: 41 })],
        branches: [expect.objectContaining({ branchId: 8 })],
      }),
    );
  });

  it('returns shared seller workspace overview for admin inspection', async () => {
    const result = await controller.getUserSellerWorkspaceOverview(41, {
      windowHours: 72,
    });

    expect(sellerWorkspaceService.getOverview).toHaveBeenCalledWith(41, 72);
    expect(result).toEqual(
      expect.objectContaining({
        currentPlanCode: 'GROWTH',
        storeCount: 1,
        branchCount: 1,
      }),
    );
  });
});
