import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AuditService } from '../audit/audit.service';
import { EmailService } from '../email/email.service';
import { User } from '../users/entities/user.entity';
import { Branch } from '../branches/entities/branch.entity';
import { RetailEntitlementsService } from '../retail/retail-entitlements.service';
import { RetailTenant } from '../retail/entities/retail-tenant.entity';
import { RetailModule } from '../retail/entities/tenant-module-entitlement.entity';
import {
  TenantBillingInterval,
  TenantSubscriptionStatus,
  TenantSubscription,
} from '../retail/entities/tenant-subscription.entity';
import { InviteBranchStaffDto } from './dto/invite-branch-staff.dto';
import { BranchStaffService } from './branch-staff.service';
import {
  BranchStaffAssignment,
  BranchStaffRole,
} from './entities/branch-staff-assignment.entity';
import { ForbiddenException } from '@nestjs/common';

describe('BranchStaffService', () => {
  let service: BranchStaffService;
  let assignmentsRepository: {
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    find: jest.Mock;
  };
  let invitesRepository: {
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    find: jest.Mock;
  };
  let branchesRepository: {
    findOne: jest.Mock;
    find: jest.Mock;
  };
  let usersRepository: { findOne: jest.Mock };
  let retailTenantsRepository: { find: jest.Mock };
  let tenantSubscriptionsRepository: any;
  let emailService: { send: jest.Mock };
  let auditService: { log: jest.Mock };
  let retailEntitlementsService: {
    getActiveBranchRetailAccess: jest.Mock;
    getBranchWorkspaceStatus: jest.Mock;
  };

  beforeEach(async () => {
    assignmentsRepository = {
      findOne: jest.fn(),
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => value),
      find: jest.fn(),
    };
    invitesRepository = {
      findOne: jest.fn(),
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => ({ id: 1, ...value })),
      find: jest.fn(),
    };
    branchesRepository = {
      findOne: jest.fn(),
      find: jest.fn(),
    };
    usersRepository = {
      findOne: jest.fn(),
    };
    retailTenantsRepository = {
      find: jest.fn().mockResolvedValue([]),
    };
    tenantSubscriptionsRepository = { findOne: jest.fn(), find: jest.fn() };
    emailService = {
      send: jest.fn(),
    };
    auditService = {
      log: jest.fn(),
    };
    retailEntitlementsService = {
      getActiveBranchRetailAccess: jest.fn(),
      getBranchWorkspaceStatus: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BranchStaffService,
        {
          provide: getRepositoryToken(BranchStaffAssignment),
          useValue: assignmentsRepository,
        },

        {
          provide: getRepositoryToken(Branch),
          useValue: branchesRepository,
        },
        {
          provide: getRepositoryToken(User),
          useValue: usersRepository,
        },
        {
          provide: getRepositoryToken(RetailTenant),
          useValue: retailTenantsRepository,
        },

        {
          provide: getRepositoryToken(TenantSubscription),
          useValue: tenantSubscriptionsRepository,
        },
        { provide: EmailService, useValue: emailService },
        { provide: AuditService, useValue: auditService },
        {
          provide: RetailEntitlementsService,
          useValue: retailEntitlementsService,
        },
      ],
    }).compile();

    service = module.get(BranchStaffService);
  });

  it('allows a branch manager assignment to manage branch staff without a global role', async () => {
    branchesRepository.findOne.mockResolvedValueOnce(null);
    assignmentsRepository.findOne.mockResolvedValueOnce({ id: 88 });

    await expect(
      service.assertCanManageBranchStaff({ id: 51, roles: ['USER'] }, 7),
    ).resolves.toBeUndefined();

    expect(assignmentsRepository.findOne).toHaveBeenCalledWith({
      where: {
        branchId: 7,
        userId: 51,
        isActive: true,
        role: BranchStaffRole.MANAGER,
      },
      select: { id: true },
    });
  });

  it('denies branch staff management when the user is not an owner, manager, or global admin', async () => {
    branchesRepository.findOne.mockResolvedValueOnce(null);
    assignmentsRepository.findOne.mockResolvedValueOnce(null);

    await expect(
      service.assertCanManageBranchStaff({ id: 52, roles: ['USER'] }, 7),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('denies branch staff management for a POS_MANAGER role without ownership or a manager assignment on the target branch', async () => {
    branchesRepository.findOne.mockResolvedValueOnce(null);
    assignmentsRepository.findOne.mockResolvedValueOnce(null);

    await expect(
      service.assertCanManageBranchStaff({ id: 52, roles: ['POS_MANAGER'] }, 7),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('upserts an existing branch assignment instead of creating a duplicate', async () => {
    assignmentsRepository.findOne.mockResolvedValue({
      id: 99,
      branchId: 7,
      userId: 51,
      role: BranchStaffRole.OPERATOR,
      permissions: ['OPEN_REGISTER'],
      isActive: false,
    });

    const result = await service.assign(7, {
      userId: 51,
      role: BranchStaffRole.MANAGER,
      permissions: ['OPEN_REGISTER', 'VIEW_REPORTS'],
    });

    expect(assignmentsRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 99,
        branchId: 7,
        userId: 51,
        role: BranchStaffRole.MANAGER,
        permissions: ['OPEN_REGISTER', 'VIEW_REPORTS'],
        isActive: true,
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        id: 99,
        role: BranchStaffRole.MANAGER,
        isActive: true,
      }),
    );
  });

  it('deactivates an active branch assignment when unassigning a POS user', async () => {
    assignmentsRepository.findOne.mockResolvedValue({
      id: 99,
      branchId: 7,
      userId: 51,
      role: BranchStaffRole.OPERATOR,
      permissions: ['OPEN_REGISTER'],
      isActive: true,
    });

    const result = await service.unassign(7, 51);

    expect(assignmentsRepository.findOne).toHaveBeenCalledWith({
      where: { branchId: 7, userId: 51, isActive: true },
      relations: { user: true },
    });
    expect(assignmentsRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 99,
        isActive: false,
      }),
    );
    expect(result).toEqual(expect.objectContaining({ isActive: false }));
  });

  it('lists only active branch staff assignments for a branch roster', async () => {
    assignmentsRepository.find.mockResolvedValue([
      { id: 11, branchId: 7, userId: 51, isActive: true },
    ]);

    const result = await service.findByBranch(7);

    expect(assignmentsRepository.find).toHaveBeenCalledWith({
      where: { branchId: 7, isActive: true },
      order: { createdAt: 'DESC' },
      relations: { user: true, branch: true },
    });
    expect(result).toEqual([
      { id: 11, branchId: 7, userId: 51, isActive: true },
    ]);
  });

  it('returns authoritative POS admin access context for a user', async () => {
    usersRepository.findOne.mockResolvedValue({
      id: 51,
      roles: ['POS_OPERATOR'],
    });
    branchesRepository.find.mockResolvedValue([]);
    assignmentsRepository.find.mockResolvedValue([]);

    const result = await service.getAdminPosAccessForUser(51);

    expect(usersRepository.findOne).toHaveBeenCalledWith({
      where: { id: 51 },
      select: { id: true, roles: true },
    });
    expect(result).toEqual({
      branchAssignments: [],
      workspaceActivationCandidates: [],
    });
  });

  it('returns portal diagnostics for an activation-blocked user email', async () => {
    usersRepository.findOne.mockResolvedValue({
      id: 2008,
      email: 'global.me23@gmail.com',
      roles: ['VENDOR'],
      displayName: 'Global Me',
    });
    jest
      .spyOn(service, 'getPosBranchSummariesForUser')
      .mockResolvedValue([] as any);
    jest
      .spyOn(service, 'getPosWorkspaceActivationCandidatesForUser')
      .mockResolvedValue([
        {
          branchId: 41,
          branchName: 'Jigjiga',
          branchCode: null,
          serviceFormat: null,
          role: BranchStaffRole.MANAGER,
          isOwner: true,
          isTenantOwner: false,
          retailTenantId: 34,
          retailTenantName: 'Smart Tech',
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
            'Set a branch service format such as RETAIL before starting activation.',
          ],
          pricing: {
            amount: 1900,
            currency: 'ETB',
            billingInterval: TenantBillingInterval.MONTHLY,
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
      ] as any);

    const result = await service.getPortalAccessDiagnosticsByEmail(
      'global.me23@gmail.com',
    );

    expect(result).toEqual(
      expect.objectContaining({
        searchedEmail: 'global.me23@gmail.com',
        user: expect.objectContaining({ id: 2008 }),
        branchAssignments: [],
        workspaceActivationCandidates: [
          expect.objectContaining({ branchId: 41 }),
        ],
        summary: expect.objectContaining({
          status: 'ACTIVATION_REQUIRED',
          likelyRootCause:
            'Set a branch service format such as RETAIL before starting activation.',
        }),
      }),
    );
  });

  it('returns portal diagnostics when the user email does not exist', async () => {
    usersRepository.findOne.mockResolvedValue(null);

    const result = await service.getPortalAccessDiagnosticsByEmail(
      'missing@example.com',
    );

    expect(result).toEqual(
      expect.objectContaining({
        searchedEmail: 'missing@example.com',
        user: null,
        branchAssignments: [],
        workspaceActivationCandidates: [],
        summary: expect.objectContaining({
          status: 'USER_NOT_FOUND',
        }),
      }),
    );
  });

  it('returns merged POS branch summaries only for branches with active POS_CORE access', async () => {
    branchesRepository.find.mockResolvedValue([
      {
        id: 5,
        name: 'HQ Branch',
        code: 'HQ-5',
        createdAt: new Date('2026-03-01T00:00:00.000Z'),
      },
      {
        id: 6,
        name: 'Inventory Only Branch',
        code: 'INV-6',
        createdAt: new Date('2026-03-01T00:00:00.000Z'),
      },
    ]);
    assignmentsRepository.find.mockResolvedValue([
      {
        branchId: 8,
        role: BranchStaffRole.OPERATOR,
        permissions: ['OPEN_REGISTER'],
        createdAt: new Date('2026-03-02T00:00:00.000Z'),
        branch: {
          id: 8,
          name: 'Airport Branch',
          code: 'AIR-8',
          isActive: true,
        },
      },
    ]);
    retailEntitlementsService.getBranchWorkspaceStatus
      .mockResolvedValueOnce({
        tenant: { id: 21, name: 'HQ Retail' },
        subscription: {
          status: TenantSubscriptionStatus.ACTIVE,
          planCode: 'POS_BRANCH',
        },
        entitlements: [{ module: RetailModule.POS_CORE }],
        hasPosModule: true,
        workspaceStatus: 'ACTIVE',
        trialStartedAt: null,
        trialEndsAt: null,
        trialDaysRemaining: null,
      })
      .mockResolvedValueOnce({
        tenant: { id: 23, name: 'Inventory Only Retail' },
        entitlements: [{ module: RetailModule.INVENTORY_CORE }],
        hasPosModule: false,
        workspaceStatus: 'ACTIVE',
        trialStartedAt: null,
        trialEndsAt: null,
        trialDaysRemaining: null,
      })
      .mockResolvedValueOnce({
        tenant: { id: 22, name: 'Airport Retail' },
        subscription: {
          status: TenantSubscriptionStatus.ACTIVE,
          planCode: 'POS_BRANCH',
        },
        entitlements: [
          { module: RetailModule.INVENTORY_CORE },
          { module: RetailModule.POS_CORE },
        ],
        hasPosModule: true,
        workspaceStatus: 'ACTIVE',
        trialStartedAt: null,
        trialEndsAt: null,
        trialDaysRemaining: null,
      });

    const result = await service.getPosBranchSummariesForUser({ id: 7 });

    expect(result).toEqual([
      expect.objectContaining({
        branchId: 5,
        branchName: 'HQ Branch',
        role: BranchStaffRole.MANAGER,
        isOwner: true,
        retailTenantId: 21,
        modules: [RetailModule.POS_CORE],
      }),
      expect.objectContaining({
        branchId: 8,
        branchName: 'Airport Branch',
        role: BranchStaffRole.OPERATOR,
        permissions: ['OPEN_REGISTER'],
        isOwner: false,
        retailTenantId: 22,
        modules: [RetailModule.INVENTORY_CORE, RetailModule.POS_CORE],
      }),
    ]);
    expect(result).toHaveLength(2);
    expect(result.map((entry) => entry.branchId)).toEqual([5, 8]);
  });

  it('returns activation candidates for branches that exist but are not yet activated for POS-S', async () => {
    branchesRepository.find.mockResolvedValue([
      {
        id: 5,
        name: 'HQ Branch',
        code: 'HQ-5',
        retailTenantId: 21,
        createdAt: new Date('2026-03-01T00:00:00.000Z'),
      },
    ]);
    assignmentsRepository.find.mockResolvedValue([]);
    retailEntitlementsService.getBranchWorkspaceStatus.mockResolvedValue({
      tenant: { id: 21, name: 'HQ Retail' },
      subscription: {
        status: TenantSubscriptionStatus.PAST_DUE,
        planCode: 'POS_BRANCH',
      },
      entitlements: [{ module: RetailModule.POS_CORE }],
      hasPosModule: true,
      workspaceStatus: 'PAST_DUE',
      trialStartedAt: null,
      trialEndsAt: null,
      trialDaysRemaining: null,
    });

    const result = await service.getPosWorkspaceActivationCandidatesForUser({
      id: 7,
    });

    expect(result).toEqual([
      expect.objectContaining({
        branchId: 5,
        branchName: 'HQ Branch',
        retailTenantId: 21,
        retailTenantName: 'HQ Retail',
        workspaceStatus: 'PAST_DUE',
        subscriptionStatus: TenantSubscriptionStatus.PAST_DUE,
        planCode: 'POS_BRANCH',
        canStartActivation: true,
        canOpenNow: false,
        pricing: {
          amount: 1900,
          currency: 'ETB',
          billingInterval: TenantBillingInterval.MONTHLY,
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
      }),
    ]);
  });
});
