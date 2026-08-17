import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from '../auth/auth.service';
import { AuditService } from '../audit/audit.service';
import { UserRole } from '../auth/roles.enum';
import { BranchStaffService } from './branch-staff.service';
import { BranchShiftService } from './branch-shift.service';
import { PosPortalAuthController } from './pos-portal-auth.controller';
import { PosPortalLoginDto } from './dto/pos-portal-login.dto';
import { RetailModule } from '../retail/entities/tenant-module-entitlement.entity';
import {
  PosManagerApprovalDto,
  PosManagerApprovalType,
} from './dto/pos-operator-unlock.dto';
import { PosWorkspaceActivationService } from './pos-workspace-activation.service';
import { PosPortalOnboardingService } from './pos-portal-onboarding.service';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../redis/redis.service';
import { SupplierStaffService } from '../suppliers/supplier-staff.service';
import { SupplierOnboardingService } from '../suppliers/supplier-onboarding.service';
import { SupplierActivationService } from '../suppliers/supplier-activation.service';
import { PosOperatorPinThrottleService } from './pos-operator-pin-throttle.service';

describe('PosPortalAuthController', () => {
  let controller: PosPortalAuthController;

  const authServiceMock = {
    login: jest.fn(),
    loginWithIdentifier: jest.fn(),
    googleLogin: jest.fn(),
    appleLogin: jest.fn(),
    generateScopedAccessToken: jest.fn(),
    getUsersService: jest.fn(),
    buildAuthenticatedUser: jest.fn(),
  };

  const branchStaffServiceMock = {
    getPosBranchSummariesForUser: jest.fn(),
    getPosWorkspaceActivationCandidatesForUser: jest.fn(),
    getPosWorkspacePricing: jest.fn(),
    assertIsBranchMember: jest.fn().mockResolvedValue(undefined),
    verifyUnlockPin: jest.fn(),
  };

  const auditServiceMock = {
    log: jest.fn(),
  };

  const posWorkspaceActivationServiceMock = {
    startEbirrActivationPayment: jest.fn(),
  };

  const posPortalOnboardingServiceMock = {
    createWorkspaceForUser: jest.fn(),
    createTrialWorkspaceForNewUser: jest.fn(),
  };

  const supplierStaffServiceMock = {
    getSupplierContextForUser: jest.fn(),
    getSupplierContextsForUser: jest.fn().mockResolvedValue([]),
  };

  const supplierOnboardingServiceMock = {
    createSupplierAccountForUser: jest.fn(),
  };

  const supplierActivationServiceMock = {
    startEbirrActivationPayment: jest.fn(),
    getActivationState: jest.fn(),
  };

  const configServiceMock = {
    get: jest.fn(),
  };

  const redisServiceMock = {
    getClient: jest.fn(),
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
  };

  const branchShiftServiceMock = {
    isUserAllowedNow: jest.fn(),
  };

  const pinThrottleServiceMock = {
    getLockoutState: jest
      .fn()
      .mockResolvedValue({ locked: false, scope: null, retryAfterSeconds: 0 }),
    recordFailure: jest
      .fn()
      .mockResolvedValue({ locked: false, scope: null, retryAfterSeconds: 0 }),
    clearFailures: jest.fn().mockResolvedValue(undefined),
  };

  const user = {
    id: 51,
    email: 'pos@suuq.test',
    roles: [UserRole.POS_MANAGER],
    displayName: 'POS Manager',
  } as any;

  beforeEach(async () => {
    jest.resetAllMocks();
    authServiceMock.buildAuthenticatedUser.mockImplementation(
      async (value) => value,
    );
    branchStaffServiceMock.assertIsBranchMember.mockResolvedValue(undefined);
    branchShiftServiceMock.isUserAllowedNow.mockResolvedValue(true);
    pinThrottleServiceMock.getLockoutState.mockResolvedValue({
      locked: false,
      scope: null,
      retryAfterSeconds: 0,
    });
    pinThrottleServiceMock.recordFailure.mockResolvedValue({
      locked: false,
      scope: null,
      retryAfterSeconds: 0,
    });
    pinThrottleServiceMock.clearFailures.mockResolvedValue(undefined);
    branchStaffServiceMock.getPosWorkspacePricing.mockReturnValue({
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
    });

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PosPortalAuthController],
      providers: [
        { provide: AuthService, useValue: authServiceMock },
        { provide: BranchStaffService, useValue: branchStaffServiceMock },
        { provide: BranchShiftService, useValue: branchShiftServiceMock },
        {
          provide: PosPortalOnboardingService,
          useValue: posPortalOnboardingServiceMock,
        },
        {
          provide: PosWorkspaceActivationService,
          useValue: posWorkspaceActivationServiceMock,
        },
        {
          provide: SupplierStaffService,
          useValue: supplierStaffServiceMock,
        },
        {
          provide: SupplierOnboardingService,
          useValue: supplierOnboardingServiceMock,
        },
        {
          provide: SupplierActivationService,
          useValue: supplierActivationServiceMock,
        },
        { provide: AuditService, useValue: auditServiceMock },
        { provide: ConfigService, useValue: configServiceMock },
        { provide: RedisService, useValue: redisServiceMock },
        {
          provide: PosOperatorPinThrottleService,
          useValue: pinThrottleServiceMock,
        },
      ],
    }).compile();

    controller = module.get<PosPortalAuthController>(PosPortalAuthController);
  });

  it('returns a portal-ready payload for Google sign-in', async () => {
    authServiceMock.googleLogin.mockResolvedValue({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      user,
    });
    branchStaffServiceMock.getPosBranchSummariesForUser.mockResolvedValue([
      {
        branchId: 9,
        branchName: 'Airport Branch',
        branchCode: 'AIR-9',
        role: 'MANAGER',
        permissions: ['OPEN_REGISTER'],
        assignedSurfaces: ['staff', 'reports'],
        capabilities: ['MANAGE_BRANCH_STAFF'],
        isOwner: false,
        retailTenantId: 31,
        retailTenantName: 'Airport Retail',
        modules: [RetailModule.POS_CORE, RetailModule.INVENTORY_CORE],
        joinedAt: new Date('2026-03-28T00:00:00.000Z'),
      },
    ]);

    const result = await controller.google({ idToken: 'google-id-token' }, {
      headers: { 'user-agent': 'jest', 'x-forwarded-for': '1.2.3.4' },
      method: 'POST',
      route: { path: '/pos-portal/auth/google' },
    } as any);

    expect(authServiceMock.googleLogin).toHaveBeenCalledWith({
      idToken: 'google-id-token',
    });
    expect(result).toMatchObject({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      defaultBranchId: 9,
      requiresBranchSelection: false,
      portalKey: 'pos',
      branches: [
        expect.objectContaining({
          branchId: 9,
          assignedSurfaces: ['staff', 'reports'],
          capabilities: ['MANAGE_BRANCH_STAFF'],
        }),
      ],
    });
    expect(result.branches).toHaveLength(1);
    expect(auditServiceMock.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'pos_portal.auth.google.success',
        targetType: 'USER',
        targetId: 51,
      }),
    );
  });

  it('issues a scoped operator token for the requested branch unlock', async () => {
    authServiceMock.loginWithIdentifier.mockResolvedValue({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      user,
    });
    authServiceMock.generateScopedAccessToken.mockResolvedValue(
      'scoped-operator-token',
    );
    branchStaffServiceMock.getPosBranchSummariesForUser.mockResolvedValue([
      {
        branchId: 9,
        branchName: 'Airport Branch',
        branchCode: 'AIR-9',
        role: 'OPERATOR',
        permissions: ['OPEN_REGISTER'],
        assignedSurfaces: ['pos-s'],
        capabilities: [],
        isOwner: false,
        isTenantOwner: false,
        retailTenantId: 31,
        retailTenantName: 'Airport Retail',
        modules: [RetailModule.POS_CORE],
        joinedAt: new Date('2026-03-28T00:00:00.000Z'),
      },
    ]);

    const result = await controller.operatorUnlock(
      Object.assign(
        {},
        {
          branchId: 9,
          identifier: 'cashier.one',
          password: 'Branch#123',
          resolveIdentifier: () => 'cashier.one',
        },
      ),
      {
        headers: { 'user-agent': 'jest', 'x-forwarded-for': '1.2.3.4' },
        method: 'POST',
        route: { path: '/pos-portal/auth/operator-unlock' },
      } as any,
    );

    expect(authServiceMock.loginWithIdentifier).toHaveBeenCalledWith(
      'cashier.one',
      'Branch#123',
    );
    expect(authServiceMock.generateScopedAccessToken).toHaveBeenCalledWith(
      expect.objectContaining({
        tokenType: 'pos_operator',
        branchId: 9,
        branchRole: 'OPERATOR',
        permissions: ['OPEN_REGISTER'],
        assignedSurfaces: ['pos-s'],
        capabilities: [],
      }),
      '8h',
    );
    expect(result).toMatchObject({
      operatorAccessToken: 'scoped-operator-token',
      branch: expect.objectContaining({
        branchId: 9,
        role: 'OPERATOR',
      }),
    });
  });

  it('issues a short-lived manager approval token for sensitive actions', async () => {
    authServiceMock.loginWithIdentifier.mockResolvedValue({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      user,
    });
    authServiceMock.generateScopedAccessToken.mockResolvedValue(
      'manager-approval-token',
    );
    branchStaffServiceMock.getPosBranchSummariesForUser.mockResolvedValue([
      {
        branchId: 9,
        branchName: 'Airport Branch',
        branchCode: 'AIR-9',
        role: 'MANAGER',
        permissions: ['VOID_SETTLED_BILL'],
        assignedSurfaces: ['pos-s'],
        capabilities: ['MANAGE_BRANCH_STAFF'],
        isOwner: false,
        isTenantOwner: false,
        retailTenantId: 31,
        retailTenantName: 'Airport Retail',
        modules: [RetailModule.POS_CORE],
        joinedAt: new Date('2026-03-28T00:00:00.000Z'),
      },
    ]);

    const result = await controller.managerApproval(
      Object.assign(
        {},
        {
          branchId: 9,
          identifier: 'manager.one',
          password: 'Branch#123',
          approvalType: PosManagerApprovalType.VOID_SETTLED_BILL,
          resolveIdentifier: () => 'manager.one',
        },
      ),
      {
        headers: { 'user-agent': 'jest', 'x-forwarded-for': '1.2.3.4' },
        method: 'POST',
        route: { path: '/pos-portal/auth/manager-approval' },
      } as any,
    );

    expect(authServiceMock.generateScopedAccessToken).toHaveBeenCalledWith(
      expect.objectContaining({
        tokenType: 'pos_manager_approval',
        branchId: 9,
        branchRole: 'MANAGER',
        approvalType: 'VOID_SETTLED_BILL',
      }),
      '15m',
    );
    expect(result).toMatchObject({
      approvalAccessToken: 'manager-approval-token',
      approvalType: 'VOID_SETTLED_BILL',
    });
    expect(auditServiceMock.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'pos_portal.auth.manager_approval.success',
        targetType: 'USER',
        targetId: 51,
      }),
    );
  });

  it('rejects manager approval when the approver is only an operator on the branch', async () => {
    authServiceMock.loginWithIdentifier.mockResolvedValue({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      user,
    });
    branchStaffServiceMock.getPosBranchSummariesForUser.mockResolvedValue([
      {
        branchId: 9,
        branchName: 'Airport Branch',
        branchCode: 'AIR-9',
        role: 'OPERATOR',
        permissions: ['VOID_SETTLED_BILL'],
        assignedSurfaces: ['pos-s'],
        isOwner: false,
        isTenantOwner: false,
        retailTenantId: 31,
        retailTenantName: 'Airport Retail',
        modules: [RetailModule.POS_CORE],
        joinedAt: new Date('2026-03-28T00:00:00.000Z'),
      },
    ]);

    await expect(
      controller.managerApproval(
        Object.assign(
          {},
          {
            branchId: 9,
            identifier: 'cashier.one',
            password: 'Branch#123',
            approvalType: PosManagerApprovalType.VOID_SETTLED_BILL,
            resolveIdentifier: () => 'cashier.one',
          },
        ) as unknown as PosManagerApprovalDto,
        {
          headers: { 'user-agent': 'jest', 'x-forwarded-for': '1.2.3.4' },
          method: 'POST',
          route: { path: '/pos-portal/auth/manager-approval' },
        } as any,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects accounts without POS branch access', async () => {
    authServiceMock.getUsersService.mockReturnValue({
      findById: jest.fn().mockResolvedValue(user),
    });
    authServiceMock.buildAuthenticatedUser.mockResolvedValue(user);
    branchStaffServiceMock.getPosBranchSummariesForUser.mockResolvedValue([]);
    branchStaffServiceMock.getPosWorkspaceActivationCandidatesForUser.mockResolvedValue(
      [],
    );

    await expect(
      controller.session({
        user: { id: 51 },
        headers: {
          'user-agent': 'jest',
          authorization: 'Bearer session-access-token',
        },
        ip: '127.0.0.1',
        method: 'GET',
        route: { path: '/pos-portal/auth/session' },
      } as any),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'POS_PORTAL_ACCESS_DENIED',
        onboardingAccessToken: 'session-access-token',
      }),
    });

    expect(auditServiceMock.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'pos_portal.auth.access_denied',
        targetType: 'USER',
        targetId: 51,
      }),
    );
  });

  it('returns activation-required denial with the current bearer token on the session endpoint', async () => {
    authServiceMock.getUsersService.mockReturnValue({
      findById: jest.fn().mockResolvedValue(user),
    });
    authServiceMock.buildAuthenticatedUser.mockResolvedValue(user);
    branchStaffServiceMock.getPosBranchSummariesForUser.mockResolvedValue([]);
    branchStaffServiceMock.getPosWorkspaceActivationCandidatesForUser.mockResolvedValue(
      [
        {
          branchId: 9,
          branchName: 'Airport Branch',
          branchCode: 'AIR-9',
          role: 'MANAGER',
          isOwner: true,
          retailTenantId: 31,
          retailTenantName: 'Airport Retail',
          workspaceStatus: 'PAYMENT_REQUIRED',
          subscriptionStatus: null,
          planCode: null,
          canStartTrial: true,
          canStartActivation: true,
          canOpenNow: false,
          trialStartedAt: null,
          trialEndsAt: null,
          trialDaysRemaining: null,
          activationBlockers: [
            'Start a 15-day trial or complete the first monthly billing activation for this branch workspace.',
            'Set a branch service format such as RETAIL before starting activation.',
          ],
          pricing: {
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
          },
        },
      ],
    );

    await expect(
      controller.session({
        user: { id: 51 },
        headers: {
          'user-agent': 'jest',
          authorization: 'Bearer session-access-token',
        },
        ip: '127.0.0.1',
        method: 'GET',
        route: { path: '/pos-portal/auth/session' },
      } as any),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'POS_PORTAL_ACTIVATION_REQUIRED',
        activationAccessToken: 'session-access-token',
      }),
    });
  });

  it('asks a brand-new Google account what it sells instead of guessing QSR', async () => {
    // The silent auto-provision handed everyone a QSR branch. Roughly three in
    // four owners do not run one, so most landed in the wrong lane. Now the gate
    // asks first, and sign-in provisions nothing.
    authServiceMock.googleLogin.mockResolvedValue({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      user,
      isNewUser: true,
    });
    branchStaffServiceMock.getPosBranchSummariesForUser.mockResolvedValue([]);
    branchStaffServiceMock.getPosWorkspaceActivationCandidatesForUser.mockResolvedValue(
      [],
    );

    await expect(
      controller.google({ idToken: 'google-id-token' }, {
        headers: { 'user-agent': 'jest' },
        method: 'POST',
        route: { path: '/pos-portal/auth/google' },
      } as any),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'POS_PORTAL_ACCESS_DENIED' }),
    });

    expect(
      posPortalOnboardingServiceMock.createTrialWorkspaceForNewUser,
    ).not.toHaveBeenCalled();
  });

  it.each([
    [
      'apple',
      () => authServiceMock.appleLogin,
      (c: any) =>
        c.apple(
          { identityToken: 'apple-token' } as any,
          {
            headers: { 'user-agent': 'jest' },
            method: 'POST',
            route: { path: '/pos-portal/auth/apple' },
          } as any,
        ),
    ],
    [
      'username/password',
      () => authServiceMock.loginWithIdentifier,
      (c: any) =>
        c.login(
          { identifier: 'pos@suuq.test', password: 'pw' } as any,
          {
            headers: { 'user-agent': 'jest' },
            method: 'POST',
            route: { path: '/pos-portal/auth/login' },
          } as any,
        ),
    ],
  ])(
    'gives a branchless %s sign-in the same self-serve route as Google',
    async (_label, getAuthMock, callController) => {
      // Parity is the point: isNewUser was only ever set by googleLogin, so
      // Apple and password signups could never reach the trial at all.
      const authMock = getAuthMock();
      if (!authMock) return;
      authMock.mockResolvedValue({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        user,
        isNewUser: false,
      });
      branchStaffServiceMock.getPosBranchSummariesForUser.mockResolvedValue([]);
      branchStaffServiceMock.getPosWorkspaceActivationCandidatesForUser.mockResolvedValue(
        [],
      );

      await expect(callController(controller)).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'POS_PORTAL_ACCESS_DENIED' }),
      });
    },
  );

  it('does not auto-provision a workspace for an existing branchless account', async () => {
    authServiceMock.loginWithIdentifier.mockResolvedValue({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      user,
      isNewUser: false,
    });
    branchStaffServiceMock.getPosBranchSummariesForUser.mockResolvedValue([]);
    branchStaffServiceMock.getPosWorkspaceActivationCandidatesForUser.mockResolvedValue(
      [],
    );

    await expect(
      controller.login(
        { identifier: 'pos@suuq.test', password: 'pw' } as any,
        {
          headers: { 'user-agent': 'jest' },
          method: 'POST',
          route: { path: '/pos-portal/auth/login' },
        } as any,
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'POS_PORTAL_ACCESS_DENIED' }),
    });

    expect(
      posPortalOnboardingServiceMock.createTrialWorkspaceForNewUser,
    ).not.toHaveBeenCalled();
  });

  it('falls back to onboarding-aware denial when auto-provisioning cannot run', async () => {
    authServiceMock.googleLogin.mockResolvedValue({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      user,
      isNewUser: true,
    });
    branchStaffServiceMock.getPosBranchSummariesForUser.mockResolvedValue([]);
    branchStaffServiceMock.getPosWorkspaceActivationCandidatesForUser.mockResolvedValue(
      [],
    );
    posPortalOnboardingServiceMock.createTrialWorkspaceForNewUser.mockRejectedValue(
      new Error('tenant insert failed'),
    );

    await expect(
      controller.google({ idToken: 'google-id-token' }, {
        headers: { 'user-agent': 'jest', 'x-forwarded-for': '1.2.3.4' },
        method: 'POST',
        route: { path: '/pos-portal/auth/google' },
      } as any),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'POS_PORTAL_ACCESS_DENIED',
        accountCreated: true,
        onboardingState: 'ACCOUNT_CREATED_BRANCH_LINK_REQUIRED',
        onboardingAccessToken: 'access-token',
      }),
    });

    expect(auditServiceMock.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'pos_portal.auth.access_denied',
        targetType: 'USER',
        targetId: 51,
        meta: expect.objectContaining({
          accountCreated: true,
          source: 'google',
        }),
      }),
    );
  });

  it('returns activation-required denial when a linked branch workspace still needs POS billing activation', async () => {
    authServiceMock.loginWithIdentifier.mockResolvedValue({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      user,
    });
    branchStaffServiceMock.getPosBranchSummariesForUser.mockResolvedValue([]);
    branchStaffServiceMock.getPosWorkspaceActivationCandidatesForUser.mockResolvedValue(
      [
        {
          branchId: 9,
          branchName: 'Airport Branch',
          branchCode: 'AIR-9',
          role: 'MANAGER',
          isOwner: true,
          retailTenantId: 31,
          retailTenantName: 'Airport Retail',
          workspaceStatus: 'PAYMENT_REQUIRED',
          subscriptionStatus: null,
          planCode: null,
          canStartTrial: true,
          canStartActivation: true,
          canOpenNow: false,
          trialStartedAt: null,
          trialEndsAt: null,
          trialDaysRemaining: null,
          activationBlockers: [
            'Start a 15-day trial or complete the first monthly billing activation for this branch workspace.',
          ],
          pricing: {
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
          },
        },
      ],
    );

    await expect(
      controller.login(
        Object.assign(new PosPortalLoginDto(), {
          email: 'pos@suuq.test',
          password: 'secret',
        }),
        {
          headers: { 'user-agent': 'jest', 'x-forwarded-for': '1.2.3.4' },
          method: 'POST',
          route: { path: '/pos-portal/auth/login' },
        } as any,
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'POS_PORTAL_ACTIVATION_REQUIRED',
        onboardingState: 'BRANCH_WORKSPACE_ACTIVATION_REQUIRED',
        pricing: expect.objectContaining({
          amount: 1900,
          currency: 'ETB',
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
        }),
        activationAccessToken: 'access-token',
        activationCandidates: [
          expect.objectContaining({
            branchId: 9,
            workspaceStatus: 'PAYMENT_REQUIRED',
            canStartTrial: true,
            activationBlockers: expect.arrayContaining([
              'Start a 15-day trial or complete the first monthly billing activation for this branch workspace.',
            ]),
          }),
        ],
      }),
    });

    expect(auditServiceMock.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'pos_portal.auth.activation_required',
        targetType: 'USER',
        targetId: 51,
      }),
    );
  });

  it('starts an Ebirr activation payment for an authenticated workspace activation request', async () => {
    posWorkspaceActivationServiceMock.startEbirrActivationPayment.mockResolvedValue(
      {
        branchId: 9,
        branchName: 'Airport Branch',
        referenceId: 'POSACT-9-1731100000000',
        status: 'PENDING_CONFIRMATION',
        checkoutUrl: 'https://checkout.ebirr.test/session/1',
        receiveCode: null,
        providerMessage: 'Confirm the payment in Ebirr, then return to POS-S.',
      },
    );

    const result = await controller.activateWorkspaceWithEbirr(
      {
        branchId: 9,
        phoneNumber: '0911223344',
      },
      {
        user: { id: 51, roles: [UserRole.POS_MANAGER] },
      } as any,
    );

    expect(
      posWorkspaceActivationServiceMock.startEbirrActivationPayment,
    ).toHaveBeenCalledWith(
      { id: 51, roles: [UserRole.POS_MANAGER] },
      {
        branchId: 9,
        phoneNumber: '0911223344',
      },
    );
    expect(result).toMatchObject({
      branchId: 9,
      status: 'PENDING_CONFIRMATION',
      checkoutUrl: 'https://checkout.ebirr.test/session/1',
    });
  });

  it('creates a first workspace for an authenticated user without POS access', async () => {
    authServiceMock.getUsersService.mockReturnValue({
      findById: jest.fn().mockResolvedValue(user),
    });
    posPortalOnboardingServiceMock.createWorkspaceForUser.mockResolvedValue({
      onboardingState: 'BRANCH_WORKSPACE_ACTIVATION_REQUIRED',
      message:
        'Your POS-S workspace was created. Start your 15-day free trial to open it.',
      workspace: {
        tenantId: 31,
        tenantName: 'Airport Retail',
        branchId: 9,
        branchName: 'Airport Branch',
        branchCode: null,
        workspaceStatus: 'PAYMENT_REQUIRED',
      },
      pricing: {
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
      },
      activationCandidates: [
        {
          branchId: 9,
          branchName: 'Airport Branch',
          branchCode: null,
          role: 'MANAGER',
          isOwner: true,
          retailTenantId: 31,
          retailTenantName: 'Airport Retail',
          workspaceStatus: 'PAYMENT_REQUIRED',
          subscriptionStatus: null,
          planCode: null,
          pricing: {
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
          },
        },
      ],
    });

    const result = await controller.createWorkspace(
      {
        businessName: 'Airport Retail',
        branchName: 'Airport Branch',
      },
      {
        user: { id: 51 },
      } as any,
    );

    expect(
      posPortalOnboardingServiceMock.createWorkspaceForUser,
    ).toHaveBeenCalledWith(user, {
      businessName: 'Airport Retail',
      branchName: 'Airport Branch',
    });
    expect(result).toMatchObject({
      onboardingState: 'BRANCH_WORKSPACE_ACTIVATION_REQUIRED',
      workspace: {
        branchId: 9,
        tenantId: 31,
      },
    });
  });

  describe('operatorUnlockPin', () => {
    const waiter = {
      id: 77,
      email: 'pos.m.amina@sys.internal',
      roles: [],
      displayName: 'Amina',
    } as any;

    const tillRequest = { user: { id: 51, roles: [] } } as any;

    function armWaiterBranch() {
      branchStaffServiceMock.getPosBranchSummariesForUser.mockResolvedValue([
        {
          branchId: 9,
          branchName: 'Cafe Blue',
          branchCode: 'CB-9',
          serviceFormat: 'QSR',
          role: 'OPERATOR',
          permissions: ['OPEN_REGISTER'],
          assignedSurfaces: null,
          capabilities: [],
          isOwner: false,
          isTenantOwner: false,
          posExperienceProfileCode: 'QSR_WAITER',
          timezone: 'Africa/Addis_Ababa',
          workspaceStatus: 'ACTIVE',
        },
      ]);
      authServiceMock.generateScopedAccessToken.mockResolvedValue(
        'operator-token',
      );
    }

    it('mints an operator token for the tapped waiter when the PIN matches', async () => {
      armWaiterBranch();
      branchStaffServiceMock.verifyUnlockPin.mockResolvedValue({
        userId: 77,
        user: waiter,
      });

      const result = await controller.operatorUnlockPin(
        { branchId: 9, userId: 77, pin: '4827' },
        tillRequest,
      );

      expect(branchStaffServiceMock.verifyUnlockPin).toHaveBeenCalledWith(
        9,
        77,
        '4827',
      );
      expect(result).toMatchObject({
        operatorAccessToken: 'operator-token',
        branch: { branchId: 9, posExperienceProfileCode: 'QSR_WAITER' },
      });
      expect(pinThrottleServiceMock.clearFailures).toHaveBeenCalledWith(9, 77);
    });

    it('requires the till to already hold a session on that branch', async () => {
      branchStaffServiceMock.assertIsBranchMember.mockRejectedValue(
        new ForbiddenException('nope'),
      );

      await expect(
        controller.operatorUnlockPin(
          { branchId: 9, userId: 77, pin: '4827' } as any,
          tillRequest,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(branchStaffServiceMock.verifyUnlockPin).not.toHaveBeenCalled();
    });

    it('records a failure and gives nothing away when the PIN is wrong', async () => {
      branchStaffServiceMock.verifyUnlockPin.mockResolvedValue(null);

      await expect(
        controller.operatorUnlockPin(
          { branchId: 9, userId: 77, pin: '1111' } as any,
          tillRequest,
        ),
      ).rejects.toMatchObject({
        response: { code: 'POS_OPERATOR_PIN_INVALID' },
      });

      expect(pinThrottleServiceMock.recordFailure).toHaveBeenCalledWith(9, 77);
    });

    it('refuses without touching the PIN once the waiter is locked out', async () => {
      pinThrottleServiceMock.getLockoutState.mockResolvedValue({
        locked: true,
        scope: 'USER',
        retryAfterSeconds: 600,
      });

      await expect(
        controller.operatorUnlockPin(
          { branchId: 9, userId: 77, pin: '4827' } as any,
          tillRequest,
        ),
      ).rejects.toMatchObject({
        response: {
          code: 'POS_OPERATOR_PIN_LOCKED',
          retryAfterSeconds: 600,
        },
      });

      expect(branchStaffServiceMock.verifyUnlockPin).not.toHaveBeenCalled();
    });

    it('reports the branch-wide block distinctly so the screen can fall back to passwords', async () => {
      pinThrottleServiceMock.getLockoutState.mockResolvedValue({
        locked: true,
        scope: 'BRANCH',
        retryAfterSeconds: 900,
      });

      await expect(
        controller.operatorUnlockPin(
          { branchId: 9, userId: 77, pin: '4827' } as any,
          tillRequest,
        ),
      ).rejects.toMatchObject({
        response: { code: 'POS_OPERATOR_PIN_DISABLED' },
      });
    });

    it('still enforces the shift window', async () => {
      armWaiterBranch();
      branchStaffServiceMock.verifyUnlockPin.mockResolvedValue({
        userId: 77,
        user: waiter,
      });
      branchShiftServiceMock.isUserAllowedNow.mockResolvedValue(false);

      await expect(
        controller.operatorUnlockPin(
          { branchId: 9, userId: 77, pin: '4827' } as any,
          tillRequest,
        ),
      ).rejects.toMatchObject({
        response: { code: 'POS_OPERATOR_NO_ACTIVE_SHIFT' },
      });
    });
  });
});
