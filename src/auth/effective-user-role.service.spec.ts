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

    expect(roles).toEqual([UserRole.VENDOR, UserRole.POS_MANAGER]);
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

    expect(roles).toEqual([UserRole.VENDOR, UserRole.POS_OPERATOR]);
  });
});
