import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { PassportModule } from '@nestjs/passport';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { RolesGuard } from '../auth/roles.guard';
import { JwtStrategy } from '../auth/jwt.strategy';
import { UserRole } from '../auth/roles.enum';
import { AuditService } from '../audit/audit.service';
import { SubscriptionAnalyticsService } from '../metrics/subscription-analytics.service';
import { RolesService } from '../roles/roles.service';
import { BranchStaffService } from '../branch-staff/branch-staff.service';
import { SellerWorkspaceService } from '../seller-workspace/seller-workspace.service';
import { UsersService } from '../users/users.service';
import { VendorService } from '../vendor/vendor.service';
import { OrdersService } from '../orders/orders.service';
import { CurrencyService } from '../common/services/currency.service';
import { ProductsService } from '../products/products.service';
import { DelivererService } from '../deliverer/deliverer.service';
import { AdminController } from './admin.controller';
import { AdminRolesController } from './roles.admin.controller';
import { AdminUsersController } from './users.admin.controller';
import { AdminVendorsController } from './vendors.admin.controller';

describe('LICENSE_REVIEWER access (jwt)', () => {
  let app: INestApplication;

  const jwtSecret = 'license-reviewer-test-secret';
  const signToken = (roles: UserRole[]) =>
    jwt.sign(
      {
        sub: 2073,
        email: 'nabil23@gmail.com',
        roles,
      },
      jwtSecret,
      { expiresIn: '1h' },
    );

  const reviewerToken = signToken([UserRole.LICENSE_REVIEWER]);

  const vendorService = {
    findPublicVendors: jest.fn().mockResolvedValue({
      items: [{ id: 7, displayName: 'Acme Supply' }],
      total: 1,
      currentPage: 1,
      totalPages: 1,
    }),
    getAdminVendorDetail: jest.fn().mockResolvedValue({
      profile: { id: 7, verificationStatus: 'PENDING' },
      stats: {
        productCount: 0,
        orderCount: 0,
        salesLast30Total: 0,
        salesGraphLast30: [],
      },
      recentOrders: [],
    }),
    setVendorVerificationStatus: jest.fn().mockResolvedValue({
      verificationStatus: 'APPROVED',
    }),
    setVendorActiveState: jest.fn().mockResolvedValue({ isActive: false }),
  };

  const usersService = {
    confirmTelebirrAccount: jest.fn().mockResolvedValue({
      telebirrVerified: true,
      telebirrAccount: '24800123',
    }),
    findAll: jest.fn().mockResolvedValue({
      users: [
        {
          id: 7,
          email: 'vendor@suuq.test',
          displayName: 'Vendor',
          roles: [UserRole.VENDOR],
        },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
    }),
    findById: jest.fn().mockResolvedValue({
      id: 7,
      email: 'vendor@suuq.test',
      displayName: 'Vendor',
      roles: [UserRole.VENDOR],
      isActive: true,
      verificationStatus: 'PENDING',
      verificationDocuments: [
        { url: 'https://cdn.suuq.test/license.pdf', name: 'license.pdf' },
      ],
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    }),
    normalizeVerificationDocuments: jest
      .fn()
      .mockReturnValue([
        { url: 'https://cdn.suuq.test/license.pdf', name: 'license.pdf' },
      ]),
    findActiveProUsers: jest.fn(),
    findAllSubscriptionRequests: jest.fn(),
    extendSubscription: jest.fn(),
  };

  const auditService = {
    listForTargetPaged: jest.fn().mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      perPage: 20,
      totalPages: 0,
    }),
    listForTargetCursor: jest.fn().mockResolvedValue({
      items: [],
      nextCursor: null,
    }),
    log: jest.fn(),
  };

  const rolesService = {
    listRequests: jest.fn().mockResolvedValue([]),
    approveRequest: jest.fn(),
    approveForUser: jest.fn(),
    rejectRequest: jest.fn(),
    rejectForUser: jest.fn(),
  };

  const subscriptionAnalytics = {
    getAnalytics: jest.fn().mockResolvedValue({ total: 0 }),
  };

  const branchStaffService = {
    getAdminPosAccessForUser: jest.fn().mockResolvedValue({
      branchAssignments: [],
      workspaceActivationCandidates: [],
    }),
  };

  const sellerWorkspaceService = {
    findUserIdsByBillingStatus: jest.fn(),
    getOverview: jest.fn().mockResolvedValue({
      workspace: {
        billingStatus: 'ACTIVE',
        status: 'ACTIVE',
      },
      windowHours: 24,
      storeCount: 1,
      branchCount: 1,
      orderCount: 1,
      grossSales: 100,
      purchaseOrderCount: 0,
      openPurchaseOrderCount: 0,
      checkoutCount: 0,
      failedCheckoutCount: 0,
      syncJobCount: 0,
      failedSyncJobCount: 0,
      catalogProductCount: 1,
      registerSessionCount: 0,
      currentPlanCode: 'FREE',
      recommendedPlanCode: 'FREE',
    }),
  };

  const productsService = {
    countByVendor: jest.fn().mockResolvedValue(1),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [PassportModule.register({ defaultStrategy: 'jwt' })],
      controllers: [
        AdminController,
        AdminVendorsController,
        AdminUsersController,
        AdminRolesController,
      ],
      providers: [
        JwtStrategy,
        RolesGuard,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) =>
              key === 'JWT_SECRET' ? jwtSecret : undefined,
          },
        },
        { provide: VendorService, useValue: vendorService },
        { provide: UsersService, useValue: usersService },
        { provide: AuditService, useValue: auditService },
        { provide: RolesService, useValue: rolesService },
        {
          provide: SubscriptionAnalyticsService,
          useValue: subscriptionAnalytics,
        },
        { provide: OrdersService, useValue: {} },
        { provide: CurrencyService, useValue: {} },
        { provide: ProductsService, useValue: productsService },
        { provide: DelivererService, useValue: {} },
        { provide: BranchStaffService, useValue: branchStaffService },
        { provide: SellerWorkspaceService, useValue: sellerWorkspaceService },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects missing bearer tokens on allowed endpoints', async () => {
    await request(app.getHttpServer()).get('/api/admin/vendors').expect(401);
  });

  it('allows LICENSE_REVIEWER to read vendors, read users, and update vendor verification', async () => {
    await request(app.getHttpServer())
      .get('/api/admin/vendors')
      .set('Authorization', `Bearer ${reviewerToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .get('/api/admin/vendors/review-queue')
      .set('Authorization', `Bearer ${reviewerToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .get('/api/admin/vendors/review-queue/summary')
      .set('Authorization', `Bearer ${reviewerToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .get('/api/admin/users')
      .set('Authorization', `Bearer ${reviewerToken}`)
      .expect(200);

    const userDetail = await request(app.getHttpServer())
      .get('/api/admin/users/7')
      .set('Authorization', `Bearer ${reviewerToken}`)
      .expect(200);

    expect(userDetail.body).toEqual(
      expect.objectContaining({
        id: 7,
        verificationDocuments: [
          {
            url: 'https://cdn.suuq.test/license.pdf',
            name: 'license.pdf',
          },
        ],
      }),
    );

    const response = await request(app.getHttpServer())
      .patch('/api/admin/vendors/7/verification')
      .set('Authorization', `Bearer ${reviewerToken}`)
      .send({ status: 'APPROVED', reason: 'License valid' })
      .expect(200);

    expect(response.body).toEqual({
      ok: true,
      vendorId: 7,
      status: 'APPROVED',
    });
    expect(vendorService.setVendorVerificationStatus).toHaveBeenCalledWith(
      7,
      'APPROVED',
      'License valid',
    );
  });

  it('forbids LICENSE_REVIEWER from broader admin endpoints', async () => {
    await request(app.getHttpServer())
      .patch('/api/admin/vendors/7/active')
      .set('Authorization', `Bearer ${reviewerToken}`)
      .send({ isActive: false })
      .expect(403);

    await request(app.getHttpServer())
      .get('/api/admin/users/subscription/analytics')
      .set('Authorization', `Bearer ${reviewerToken}`)
      .expect(403);

    await request(app.getHttpServer())
      .get('/api/admin/roles/requests')
      .set('Authorization', `Bearer ${reviewerToken}`)
      .expect(403);

    await request(app.getHttpServer())
      .get('/api/admin/users/7/pos-access')
      .set('Authorization', `Bearer ${reviewerToken}`)
      .expect(403);

    await request(app.getHttpServer())
      .post('/api/admin/users/7/pos-assignments')
      .set('Authorization', `Bearer ${reviewerToken}`)
      .send({ branchId: 8, role: 'OPERATOR', permissions: [] })
      .expect(403);

    await request(app.getHttpServer())
      .get('/api/admin/analytics/pro')
      .set('Authorization', `Bearer ${reviewerToken}`)
      .expect(404);
  });
});
