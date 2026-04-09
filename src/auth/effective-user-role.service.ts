import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, In } from 'typeorm';
import { Branch } from '../branches/entities/branch.entity';
import {
  BranchStaffAssignment,
  BranchStaffRole,
} from '../branch-staff/entities/branch-staff-assignment.entity';
import { RetailModule } from '../retail/entities/tenant-module-entitlement.entity';
import { RetailTenantStatus } from '../retail/entities/retail-tenant.entity';
import { TenantModuleEntitlement } from '../retail/entities/tenant-module-entitlement.entity';
import {
  TenantSubscription,
  TenantSubscriptionStatus,
} from '../retail/entities/tenant-subscription.entity';
import { UserRole } from './roles.enum';

@Injectable()
export class EffectiveUserRoleService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async resolveRoles(user: {
    id?: number | null;
    roles?: string[];
  }): Promise<UserRole[]> {
    const roles = Array.from(
      new Set((Array.isArray(user.roles) ? user.roles : []) as UserRole[]),
    );

    if (!user?.id) {
      return roles;
    }

    const branchRepository = this.dataSource.getRepository(Branch);
    const assignmentRepository = this.dataSource.getRepository(
      BranchStaffAssignment,
    );
    const entitlementRepository = this.dataSource.getRepository(
      TenantModuleEntitlement,
    );
    const subscriptionRepository =
      this.dataSource.getRepository(TenantSubscription);

    const [ownedBranches, assignments] = await Promise.all([
      branchRepository.find({
        where: { ownerId: user.id, isActive: true },
        select: { id: true, retailTenantId: true },
      }),
      assignmentRepository.find({
        where: { userId: user.id, isActive: true },
        relations: { branch: true },
      }),
    ]);

    const branchAccess = new Map<
      number,
      {
        isOwner: boolean;
        role: BranchStaffRole;
        retailTenantId?: number | null;
      }
    >();

    for (const branch of ownedBranches) {
      branchAccess.set(branch.id, {
        isOwner: true,
        role: BranchStaffRole.MANAGER,
        retailTenantId: branch.retailTenantId ?? null,
      });
    }

    for (const assignment of assignments) {
      if (!assignment.branch?.isActive) {
        continue;
      }

      const existing = branchAccess.get(assignment.branchId);
      branchAccess.set(assignment.branchId, {
        isOwner: existing?.isOwner ?? false,
        role:
          existing?.isOwner || existing?.role === BranchStaffRole.MANAGER
            ? BranchStaffRole.MANAGER
            : (assignment.role ?? BranchStaffRole.OPERATOR),
        retailTenantId:
          existing?.retailTenantId ?? assignment.branch?.retailTenantId ?? null,
      });
    }

    const tenantIds = Array.from(
      new Set(
        Array.from(branchAccess.values())
          .map((entry) => entry.retailTenantId)
          .filter((tenantId): tenantId is number => Number.isInteger(tenantId)),
      ),
    );

    const now = Date.now();
    const activeTenantIds = new Set<number>();
    const posEnabledTenantIds = new Set<number>();

    if (tenantIds.length > 0) {
      const [activeSubscriptions, posEntitlements] = await Promise.all([
        subscriptionRepository.find({
          where: {
            tenantId: In(tenantIds),
            status: TenantSubscriptionStatus.ACTIVE,
          },
          select: { tenantId: true },
        }),
        entitlementRepository
          .createQueryBuilder('entitlement')
          .innerJoin('entitlement.tenant', 'tenant')
          .select(['entitlement.tenantId AS "tenantId"'])
          .where('entitlement.tenantId IN (:...tenantIds)', { tenantIds })
          .andWhere('entitlement.module = :module', {
            module: RetailModule.POS_CORE,
          })
          .andWhere('entitlement.enabled = true')
          .andWhere('tenant.status = :tenantStatus', {
            tenantStatus: RetailTenantStatus.ACTIVE,
          })
          .andWhere(
            '(entitlement.startsAt IS NULL OR entitlement.startsAt <= :now)',
            {
              now: new Date(now),
            },
          )
          .andWhere(
            '(entitlement.expiresAt IS NULL OR entitlement.expiresAt >= :now)',
            {
              now: new Date(now),
            },
          )
          .getRawMany<{ tenantId: string | number }>(),
      ]);

      for (const subscription of activeSubscriptions) {
        activeTenantIds.add(subscription.tenantId);
      }

      for (const entitlement of posEntitlements) {
        posEnabledTenantIds.add(Number(entitlement.tenantId));
      }
    }

    let hasManagerAccess = false;
    let hasOperatorAccess = false;

    for (const access of branchAccess.values()) {
      const tenantId = access.retailTenantId;
      if (
        !tenantId ||
        !activeTenantIds.has(tenantId) ||
        !posEnabledTenantIds.has(tenantId)
      ) {
        continue;
      }

      if (access.isOwner || access.role === BranchStaffRole.MANAGER) {
        hasManagerAccess = true;
        continue;
      }

      if (access.role === BranchStaffRole.OPERATOR) {
        hasOperatorAccess = true;
      }
    }

    if (hasManagerAccess) {
      roles.push(UserRole.POS_MANAGER);
    } else if (hasOperatorAccess) {
      roles.push(UserRole.POS_OPERATOR);
    }

    return Array.from(new Set(roles));
  }

  async applyEffectiveRoles<T extends { id?: number | null; roles?: string[] }>(
    user: T,
  ): Promise<T & { roles: UserRole[] }> {
    const roles = await this.resolveRoles(user);
    return {
      ...user,
      roles,
    } as T & { roles: UserRole[] };
  }
}
