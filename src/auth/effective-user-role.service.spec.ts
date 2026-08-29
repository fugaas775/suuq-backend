import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { Branch } from '../branches/entities/branch.entity';
import {
  BranchStaffAssignment,
  BranchStaffRole,
} from '../branch-staff/entities/branch-staff-assignment.entity';
import { RetailModule } from '../retail/entities/tenant-module-entitlement.entity';
import { TenantModuleEntitlement } from '../retail/entities/tenant-module-entitlement.entity';
import {
  TenantSubscription,
  TenantSubscriptionStatus,
} from '../retail/entities/tenant-subscription.entity';
import { POS_SELF_SERVE_TRIAL_PLAN_CODE } from '../retail/pos-self-serve-trial.policy';
import { UserRole } from './roles.enum';
import { EffectiveUserRoleService } from './effective-user-role.service';

describe('EffectiveUserRoleService', () => {
  let service: EffectiveUserRoleService;
  let dataSource: { getRepository: jest.Mock };
  let branchRepository: { find: jest.Mock };
  let assignmentRepository: { find: jest.Mock };
  let entitlementRepository: { createQueryBuilder: jest.Mock };
  let subscriptionRepository: { find: jest.Mock };
  let entitlementQueryBuilder: {
    innerJoin: jest.Mock;
    select: jest.Mock;
    where: jest.Mock;
    andWhere: jest.Mock;
    getRawMany: jest.Mock;
  };

  beforeEach(async () => {
    branchRepository = {
      find: jest.fn(),
    };
    assignmentRepository = {
      find: jest.fn(),
    };
    entitlementQueryBuilder = {
      innerJoin: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getRawMany: jest.fn(),
    };
    entitlementRepository = {
      createQueryBuilder: jest.fn(() => entitlementQueryBuilder),
    };
    subscriptionRepository = {
      find: jest.fn(),
    };
    dataSource = {
      getRepository: jest.fn((entity) => {
        if (entity === Branch) {
          return branchRepository;
        }

        if (entity === BranchStaffAssignment) {
          return assignmentRepository;
        }

        if (entity === TenantModuleEntitlement) {
          return entitlementRepository;
        }

        if (entity === TenantSubscription) {
          return subscriptionRepository;
        }

        throw new Error(`Unexpected repository request: ${entity?.name}`);
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EffectiveUserRoleService,
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    service = module.get(EffectiveUserRoleService);
  });

  it('derives POS_MANAGER for active branch owners or managers with POS_CORE access', async () => {
    branchRepository.find.mockResolvedValue([{ id: 7, retailTenantId: 11 }]);
    assignmentRepository.find.mockResolvedValue([]);
    subscriptionRepository.find.mockResolvedValue([
      { tenantId: 11, status: TenantSubscriptionStatus.ACTIVE },
    ]);
    entitlementQueryBuilder.getRawMany.mockResolvedValue([
      { tenantId: 11, module: RetailModule.POS_CORE },
    ]);

    const roles = await service.resolveRoles({
      id: 41,
      roles: [UserRole.VENDOR],
    });

    expect(roles).toEqual([
      UserRole.VENDOR,
      UserRole.POS_MANAGER,
      UserRole.ADMIN,
    ]);
  });

  it('derives POS_OPERATOR for active POS operators without manager access', async () => {
    branchRepository.find.mockResolvedValue([]);
    assignmentRepository.find.mockResolvedValue([
      {
        branchId: 9,
        role: BranchStaffRole.OPERATOR,
        branch: { isActive: true, retailTenantId: 21 },
      },
    ]);
    subscriptionRepository.find.mockResolvedValue([
      { tenantId: 21, status: TenantSubscriptionStatus.ACTIVE },
    ]);
    entitlementQueryBuilder.getRawMany.mockResolvedValue([
      { tenantId: 21, module: RetailModule.POS_CORE },
    ]);

    const roles = await service.resolveRoles({
      id: 52,
      roles: [UserRole.VENDOR],
    });

    expect(roles).toEqual([
      UserRole.VENDOR,
      UserRole.POS_MANAGER,
      UserRole.ADMIN,
      UserRole.POS_OPERATOR,
    ]);
  });

  /**
   * The cases above all start from `roles: [VENDOR]`, which grants POS_MANAGER
   * on its own — so they passed while the derivation under test granted
   * nothing. A manually created cashier starts from `roles: []` and has no
   * such floor: what this service returns is the whole of their authority.
   */
  describe('a staff member whose only authority is their branch assignment', () => {
    const operatorAssignment = {
      branchId: 139,
      role: BranchStaffRole.OPERATOR,
      branch: { isActive: true, retailTenantId: 31 },
    };

    beforeEach(() => {
      branchRepository.find.mockResolvedValue([]);
      assignmentRepository.find.mockResolvedValue([operatorAssignment]);
      entitlementQueryBuilder.getRawMany.mockResolvedValue([
        { tenantId: 31, module: RetailModule.POS_CORE },
      ]);
    });

    it('is a POS_OPERATOR on a branch whose free period is still running', async () => {
      subscriptionRepository.find.mockResolvedValue([
        {
          tenantId: 31,
          status: TenantSubscriptionStatus.TRIAL,
          planCode: POS_SELF_SERVE_TRIAL_PLAN_CODE,
          endsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      ]);

      const roles = await service.resolveRoles({ id: 900, roles: [] });

      // Without this the cashier signs in holding `[]`, and every
      // @Roles-guarded /retail/v1/ops route — the register's product catalog
      // among them — answers 403 for as long as the branch is free.
      expect(roles).toEqual([UserRole.POS_OPERATOR]);
    });

    it('is a POS_MANAGER when the assignment says MANAGER', async () => {
      assignmentRepository.find.mockResolvedValue([
        { ...operatorAssignment, role: BranchStaffRole.MANAGER },
      ]);
      subscriptionRepository.find.mockResolvedValue([
        {
          tenantId: 31,
          status: TenantSubscriptionStatus.TRIAL,
          planCode: POS_SELF_SERVE_TRIAL_PLAN_CODE,
          endsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      ]);

      const roles = await service.resolveRoles({ id: 901, roles: [] });

      expect(roles).toEqual([UserRole.POS_MANAGER]);
    });

    it('gets nothing once the free period has lapsed', async () => {
      subscriptionRepository.find.mockResolvedValue([
        {
          tenantId: 31,
          status: TenantSubscriptionStatus.TRIAL,
          planCode: POS_SELF_SERVE_TRIAL_PLAN_CODE,
          endsAt: new Date(Date.now() - 1000),
        },
      ]);

      const roles = await service.resolveRoles({ id: 902, roles: [] });

      expect(roles).toEqual([]);
    });

    it('gets nothing from a hand-set TRIAL row that is not the free period', async () => {
      // Only the free-period plan codes open a branch unpaid; a bare TRIAL row
      // keeps its pay-first meaning, exactly as getBranchWorkspaceStatus reads
      // it.
      subscriptionRepository.find.mockResolvedValue([
        {
          tenantId: 31,
          status: TenantSubscriptionStatus.TRIAL,
          planCode: 'SOME_PAID_PLAN',
          endsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      ]);

      const roles = await service.resolveRoles({ id: 903, roles: [] });

      expect(roles).toEqual([]);
    });
  });
});
