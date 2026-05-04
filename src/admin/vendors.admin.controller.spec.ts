import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { UserRole } from '../auth/roles.enum';
import { AuditService } from '../audit/audit.service';
import { ROLES_KEY } from '../common/decorators/roles.decorator';
import { UsersService } from '../users/users.service';
import { VendorService } from '../vendor/vendor.service';
import { AdminVendorsController } from './vendors.admin.controller';

describe('AdminVendorsController', () => {
  let controller: AdminVendorsController;
  let vendorService: {
    findPublicVendors: jest.Mock;
    getAdminVendorDetail: jest.Mock;
    setVendorVerificationStatus: jest.Mock;
    setVendorActiveState: jest.Mock;
  };
  let usersService: {
    confirmTelebirrAccount: jest.Mock;
    findById: jest.Mock;
    normalizeVerificationDocuments: jest.Mock;
  };
  let auditService: {
    listForTargetCursor: jest.Mock;
    listForTargetPaged: jest.Mock;
    log: jest.Mock;
  };

  beforeEach(async () => {
    vendorService = {
      findPublicVendors: jest.fn().mockResolvedValue({
        items: [{ id: 7, displayName: 'Acme Supply' }],
        total: 1,
        currentPage: 2,
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
      setVendorActiveState: jest.fn().mockResolvedValue({
        isActive: false,
      }),
    };

    usersService = {
      confirmTelebirrAccount: jest.fn().mockResolvedValue({
        telebirrVerified: true,
        telebirrAccount: '24800123',
      }),
      findById: jest.fn().mockResolvedValue({
        id: 7,
        verificationDocuments: [
          { url: 'https://cdn.suuq.test/license.pdf', name: 'license.pdf' },
        ],
        businessLicenseInfo: { licenseNumber: 'BL-77' },
      }),
      normalizeVerificationDocuments: jest
        .fn()
        .mockReturnValue([
          { url: 'https://cdn.suuq.test/license.pdf', name: 'license.pdf' },
        ]),
    };

    auditService = {
      listForTargetCursor: jest.fn(),
      listForTargetPaged: jest.fn(),
      log: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminVendorsController],
      providers: [
        { provide: VendorService, useValue: vendorService },
        { provide: UsersService, useValue: usersService },
        {
          provide: AuditService,
          useValue: auditService,
        },
      ],
    }).compile();

    controller = module.get(AdminVendorsController);
  });

  it('confirms telebirr status and writes an audit record', async () => {
    const req = { user: { id: 9, email: 'admin@example.com' } };

    const result = await controller.confirmTelebirr(7, 'APPROVED', req);

    expect(usersService.confirmTelebirrAccount).toHaveBeenCalledWith(
      7,
      'APPROVED',
    );
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'vendor.telebirr.verification',
        targetType: 'vendor',
        targetId: 7,
        actorId: 9,
        actorEmail: 'admin@example.com',
        meta: { status: 'APPROVED', telebirrAccount: '24800123' },
      }),
    );
    expect(result).toEqual({ ok: true, telebirrVerified: true });
  });

  it('forwards validated vendor list filters', async () => {
    await controller.list({
      page: 2,
      limit: 50,
      q: 'acme',
      search: 'supply',
      vendorId: 7,
      sort: 'verifiedAt',
      verificationStatus: 'APPROVED',
      certificationStatus: 'certified',
      country: 'ET',
      region: 'Addis',
      city: 'Bole',
      subscriptionTier: 'pro',
      minSales: 100,
      minRating: 4.5,
      meta: '1',
    });

    expect(vendorService.findPublicVendors).toHaveBeenCalledWith(
      expect.objectContaining({
        page: 2,
        limit: 50,
        search: '7',
        sort: 'verifiedAt',
        verificationStatus: 'APPROVED',
        certificationStatus: 'certified',
        country: 'ET',
        region: 'Addis',
        city: 'Bole',
        subscriptionTier: 'pro',
        minSales: 100,
        minRating: 4.5,
      }),
    );
  });

  it('forwards validated vendor search filters', async () => {
    await controller.search({
      q: 'acme',
      certificationStatus: 'certified',
      subscriptionTier: 'pro',
      limit: 25,
      meta: '1',
    });

    expect(vendorService.findPublicVendors).toHaveBeenCalledWith(
      expect.objectContaining({
        page: 1,
        limit: 25,
        search: 'acme',
        certificationStatus: 'certified',
        subscriptionTier: 'pro',
        sort: 'recent',
      }),
    );
  });

  it('allows LICENSE_REVIEWER on vendor review endpoints only', () => {
    const listRoles = Reflect.getMetadata(ROLES_KEY, controller.list);
    const searchRoles = Reflect.getMetadata(ROLES_KEY, controller.search);
    const reviewQueueSummaryRoles = Reflect.getMetadata(
      ROLES_KEY,
      controller.reviewQueueSummary,
    );
    const reviewQueueRoles = Reflect.getMetadata(
      ROLES_KEY,
      controller.reviewQueue,
    );
    const getOneRoles = Reflect.getMetadata(ROLES_KEY, controller.getOne);
    const getAuditRoles = Reflect.getMetadata(ROLES_KEY, controller.getAudit);
    const verificationRoles = Reflect.getMetadata(
      ROLES_KEY,
      controller.updateVerification,
    );
    const activeRoles = Reflect.getMetadata(ROLES_KEY, controller.updateActive);

    expect(listRoles).toContain(UserRole.LICENSE_REVIEWER);
    expect(searchRoles).toContain(UserRole.LICENSE_REVIEWER);
    expect(reviewQueueSummaryRoles).toContain(UserRole.LICENSE_REVIEWER);
    expect(reviewQueueRoles).toContain(UserRole.LICENSE_REVIEWER);
    expect(getOneRoles).toContain(UserRole.LICENSE_REVIEWER);
    expect(getAuditRoles).toContain(UserRole.LICENSE_REVIEWER);
    expect(verificationRoles).toContain(UserRole.LICENSE_REVIEWER);
    expect(activeRoles).toBeUndefined();
  });

  it('returns queue counts for pending, approved, and rejected vendor verification', async () => {
    vendorService.findPublicVendors
      .mockResolvedValueOnce({
        items: [],
        total: 9,
        currentPage: 1,
        totalPages: 9,
      })
      .mockResolvedValueOnce({
        items: [],
        total: 17,
        currentPage: 1,
        totalPages: 17,
      })
      .mockResolvedValueOnce({
        items: [],
        total: 4,
        currentPage: 1,
        totalPages: 4,
      });

    const result = await controller.reviewQueueSummary({
      q: 'coffee',
      country: 'ET',
      meta: '1',
    });

    expect(vendorService.findPublicVendors).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        page: 1,
        limit: 1,
        search: 'coffee',
        verificationStatus: 'PENDING',
        country: 'ET',
      }),
    );
    expect(vendorService.findPublicVendors).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        verificationStatus: 'APPROVED',
      }),
    );
    expect(vendorService.findPublicVendors).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        verificationStatus: 'REJECTED',
      }),
    );
    expect(result).toEqual({ pending: 9, approved: 17, rejected: 4 });
  });

  it('returns a dedicated pending review queue for license reviewers', async () => {
    await controller.reviewQueue({
      page: 1,
      limit: 25,
      q: 'pending',
      verificationStatus: 'APPROVED',
      meta: '1',
    });

    expect(vendorService.findPublicVendors).toHaveBeenCalledWith(
      expect.objectContaining({
        page: 1,
        limit: 25,
        search: 'pending',
        verificationStatus: 'PENDING',
      }),
    );
  });

  it('returns vendor detail with verification documents for review work', async () => {
    const result = await controller.getOne(7);

    expect(vendorService.getAdminVendorDetail).toHaveBeenCalledWith(7);
    expect(usersService.findById).toHaveBeenCalledWith(7);
    expect(usersService.normalizeVerificationDocuments).toHaveBeenCalledWith([
      { url: 'https://cdn.suuq.test/license.pdf', name: 'license.pdf' },
    ]);
    expect(result).toEqual(
      expect.objectContaining({
        profile: expect.objectContaining({
          id: 7,
          verificationDocuments: [
            {
              url: 'https://cdn.suuq.test/license.pdf',
              name: 'license.pdf',
            },
          ],
          businessLicenseInfo: { licenseNumber: 'BL-77' },
        }),
      }),
    );
  });

  it('delegates vendor audit cursor queries unchanged', async () => {
    auditService.listForTargetCursor.mockResolvedValue({
      items: [
        {
          id: 6,
          action: 'vendor.verification.update',
          actorId: 9,
          actorEmail: 'admin@example.com',
          meta: { status: 'APPROVED' },
          reason: 'Manual verification',
          createdAt: new Date('2026-03-20T10:05:00.000Z'),
        },
      ],
      nextCursor: 'cursor:vendor:next',
    });

    const result = await controller.getAudit(12, {
      limit: 15,
      after: Buffer.from('2026-03-20T10:15:00.000Z|88', 'utf8').toString(
        'base64url',
      ),
      actions: 'vendor.verification.update',
      actorEmail: 'admin@example.com',
      actorId: 9,
    });

    expect(auditService.listForTargetCursor).toHaveBeenCalledWith(
      'vendor',
      12,
      {
        after: expect.any(String),
        limit: 15,
        filters: expect.objectContaining({
          actions: ['vendor.verification.update'],
          actorEmail: 'admin@example.com',
          actorId: 9,
        }),
      },
    );
    expect(result).toEqual({
      items: [
        expect.objectContaining({
          id: 6,
          action: 'vendor.verification.update',
          actionLabel: 'Approved vendor',
        }),
      ],
      nextCursor: 'cursor:vendor:next',
    });
  });

  it('propagates malformed vendor audit cursor failures', async () => {
    auditService.listForTargetCursor.mockRejectedValue(
      new BadRequestException('Invalid audit cursor'),
    );

    await expect(
      controller.getAudit(12, { after: 'not-a-valid-audit-cursor' }),
    ).rejects.toThrow('Invalid audit cursor');
  });

  it('delegates paged vendor audit queries with validated filters', async () => {
    auditService.listForTargetPaged.mockResolvedValue({
      items: [
        {
          id: 8,
          action: 'vendor.active.update',
          actorId: 9,
          actorEmail: 'admin@example.com',
          meta: { isActive: false },
          createdAt: new Date('2026-03-20T10:05:00.000Z'),
        },
      ],
      total: 1,
      page: 2,
      perPage: 10,
      totalPages: 1,
    });

    const result = await controller.getAudit(12, {
      page: 2,
      limit: 10,
      actions: 'vendor.active.update',
      actorEmail: 'admin@example.com',
      actorId: 9,
      from: '2026-03-01T00:00:00.000Z',
      to: '2026-03-20T23:59:59.999Z',
    });

    expect(auditService.listForTargetPaged).toHaveBeenCalledWith('vendor', 12, {
      page: 2,
      limit: 10,
      filters: expect.objectContaining({
        actions: ['vendor.active.update'],
        actorEmail: 'admin@example.com',
        actorId: 9,
        from: new Date('2026-03-01T00:00:00.000Z'),
        to: new Date('2026-03-20T23:59:59.999Z'),
      }),
    });
    expect(result).toEqual(
      expect.objectContaining({
        items: [
          expect.objectContaining({
            actionLabel: 'Deactivated vendor',
          }),
        ],
        total: 1,
        page: 2,
      }),
    );
  });

  it('updates vendor verification and writes an audit record', async () => {
    const req = { user: { id: 9, email: 'admin@example.com' } };

    const result = await controller.updateVerification(
      7,
      { status: 'APPROVED' as any, reason: 'Manual review complete' },
      req,
    );

    expect(vendorService.setVendorVerificationStatus).toHaveBeenCalledWith(
      7,
      'APPROVED',
      'Manual review complete',
    );
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'vendor.verification.update',
        targetId: 7,
        reason: 'Manual review complete',
        actorId: 9,
        actorEmail: 'admin@example.com',
      }),
    );
    expect(result).toEqual({ ok: true, vendorId: 7, status: 'APPROVED' });
  });

  it('enforces super-admin access for active state changes', async () => {
    await expect(
      controller.updateActive(
        7,
        { isActive: false },
        { user: { roles: ['ADMIN'] } },
      ),
    ).rejects.toThrow('Only SUPER_ADMIN can change active state');
  });

  it('updates vendor active state for super admins and writes an audit record', async () => {
    const req = {
      user: { id: 11, email: 'super@example.com', roles: ['SUPER_ADMIN'] },
    };

    const result = await controller.updateActive(7, { isActive: false }, req);

    expect(vendorService.setVendorActiveState).toHaveBeenCalledWith(7, false);
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'vendor.active.update',
        targetId: 7,
        actorId: 11,
        actorEmail: 'super@example.com',
        meta: { isActive: false },
      }),
    );
    expect(result).toEqual({ ok: true, vendorId: 7, isActive: false });
  });
});
