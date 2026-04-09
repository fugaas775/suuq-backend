import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { VendorPortalAuthController } from './vendor-portal-auth.controller';
import { AuthService } from '../auth/auth.service';
import { VendorStaffService } from './vendor-staff.service';
import { UserRole } from '../auth/roles.enum';
import { AuditService } from '../audit/audit.service';

describe('VendorPortalAuthController', () => {
  let controller: VendorPortalAuthController;

  const authServiceMock = {
    login: jest.fn(),
    googleLogin: jest.fn(),
    appleLogin: jest.fn(),
    getUsersService: jest.fn(),
    buildAuthenticatedUser: jest.fn(),
  };

  const vendorStaffServiceMock = {
    getStoreSummariesForUser: jest.fn(),
  };

  const auditServiceMock = {
    log: jest.fn(),
  };

  const user = {
    id: 41,
    email: 'vendor@suuq.test',
    roles: [UserRole.VENDOR],
    displayName: 'Portal Vendor',
  } as any;

  beforeEach(async () => {
    jest.resetAllMocks();
    authServiceMock.buildAuthenticatedUser.mockImplementation(
      async (value) => value,
    );

    const module: TestingModule = await Test.createTestingModule({
      controllers: [VendorPortalAuthController],
      providers: [
        { provide: AuthService, useValue: authServiceMock },
        { provide: VendorStaffService, useValue: vendorStaffServiceMock },
        { provide: AuditService, useValue: auditServiceMock },
      ],
    }).compile();

    controller = module.get<VendorPortalAuthController>(
      VendorPortalAuthController,
    );
  });

  it('returns a portal-ready payload for Google sign-in', async () => {
    authServiceMock.googleLogin.mockResolvedValue({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      user,
    });
    vendorStaffServiceMock.getStoreSummariesForUser.mockResolvedValue([
      {
        vendorId: 41,
        storeName: 'Portal Vendor',
        permissions: ['MANAGE_PRODUCTS'],
        title: 'Owner',
        joinedAt: new Date('2026-03-28T00:00:00.000Z'),
      },
    ]);

    const result = await controller.google({ idToken: 'google-id-token' }, {
      headers: { 'user-agent': 'jest', 'x-forwarded-for': '1.2.3.4' },
      method: 'POST',
      route: { path: '/vendor-portal/auth/google' },
    } as any);

    expect(authServiceMock.googleLogin).toHaveBeenCalledWith({
      idToken: 'google-id-token',
    });
    expect(result).toMatchObject({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      defaultVendorId: 41,
      requiresStoreSelection: false,
    });
    expect(result.stores).toHaveLength(1);
    expect(auditServiceMock.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'vendor_portal.auth.google.success',
        targetType: 'USER',
        targetId: 41,
      }),
    );
  });

  it('rejects accounts without vendor access', async () => {
    authServiceMock.getUsersService.mockReturnValue({
      findById: jest.fn().mockResolvedValue(user),
    });
    authServiceMock.buildAuthenticatedUser.mockResolvedValue(user);
    vendorStaffServiceMock.getStoreSummariesForUser.mockResolvedValue([]);

    await expect(
      controller.session({
        user: { id: 41, roles: [UserRole.CUSTOMER] },
        headers: { 'user-agent': 'jest' },
        ip: '127.0.0.1',
        method: 'GET',
        route: { path: '/vendor-portal/auth/session' },
      } as any),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(auditServiceMock.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'vendor_portal.auth.access_denied',
        targetType: 'USER',
        targetId: 41,
      }),
    );
  });
});
